import fetch from 'node-fetch';
import config, { parseBaseUrls } from '../../config/default';
import logger from './logger';

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
}

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export interface UpstreamHealthStatus {
  serverUrl: string;
  serverIndex: number;
  isHealthy: boolean;
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
}

export class UpstreamManager {
  private modelCounters: Map<string, number> = new Map();
  private globalCounter: number = 0;
  private healthMap: Map<number, UpstreamHealthStatus> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;

  constructor() {
    if (process.env.NODE_ENV !== 'test') {
      this.startHealthCheck();
    }
  }

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    const raw = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const urls = parseBaseUrls(raw);
    return urls.length > 0 ? urls : ['https://generativelanguage.googleapis.com'];
  }

  /**
   * Returns health status list for all configured upstream nodes.
   */
  public getHealthStatusList(): UpstreamHealthStatus[] {
    const servers = this.getBaseUrls();
    return servers.map((url, idx) => {
      const existing = this.healthMap.get(idx);
      if (existing && existing.serverUrl === url) {
        return existing;
      }
      const initial: UpstreamHealthStatus = {
        serverUrl: url,
        serverIndex: idx,
        isHealthy: true,
        lastChecked: Date.now(),
        consecutiveFailures: 0
      };
      this.healthMap.set(idx, initial);
      return initial;
    });
  }

  /**
   * Manually set a node's health status (e.g. for testing or passive circuit breaker).
   */
  public setNodeHealth(serverIndex: number, isHealthy: boolean, error?: string): void {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return;
    const url = servers[serverIndex];
    const existing = this.healthMap.get(serverIndex) || {
      serverUrl: url,
      serverIndex,
      isHealthy: true,
      lastChecked: Date.now(),
      consecutiveFailures: 0
    };

    existing.isHealthy = isHealthy;
    existing.lastChecked = Date.now();
    if (!isHealthy) {
      existing.lastError = error;
      existing.consecutiveFailures += 1;
    } else {
      existing.lastError = undefined;
      existing.consecutiveFailures = 0;
    }
    this.healthMap.set(serverIndex, existing);
  }

  /**
   * Actively probe upstream server health.
   */
  public async checkHealth(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const servers = this.getBaseUrls();
      await Promise.allSettled(
        servers.map(async (serverUrl, idx) => {
          const timeout = 3000;
          const headers: Record<string, string> = {
            'Accept': 'application/json'
          };
          if (config.adminSecretKey) {
            headers['Authorization'] = `Bearer ${config.adminSecretKey}`;
          }

          try {
            const probeUrl = `${serverUrl}/api/status`;
            const res = await fetch(probeUrl, {
              method: 'GET',
              headers,
              timeout
            });

            // Any HTTP response (2xx, 3xx, 401, 403, 404, etc.) proves host is alive and reachable
            // 502/503 indicates an upstream gateway outage
            if (res.status === 502 || res.status === 503) {
              this.setNodeHealth(idx, false, `HTTP ${res.status}`);
            } else {
              this.setNodeHealth(idx, true);
            }
          } catch (err: any) {
            this.setNodeHealth(idx, false, err.message || 'Connection failed');
          }
        })
      );
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Starts periodic background health check (every 20s by default).
   */
  public startHealthCheck(intervalMs: number = 20000): void {
    if (this.healthCheckTimer) return;
    // Immediate initial probe asynchronously
    this.checkHealth().catch(() => {});
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth().catch(() => {});
    }, intervalMs);
    if (this.healthCheckTimer.unref) {
      this.healthCheckTimer.unref();
    }
  }

  /**
   * Stops periodic background health check.
   */
  public stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Selects an upstream server based on model-specific round-robin,
   * explicit server index, or global round-robin, filtering out offline nodes.
   */
  public getUpstreamServer(options?: { model?: string; serverIndex?: number }): UpstreamServerSelection {
    const servers = this.getBaseUrls();
    if (servers.length === 0) {
      return { serverUrl: 'https://generativelanguage.googleapis.com', serverIndex: 0 };
    }

    // 1. Explicit serverIndex (e.g. for AccountService or direct targeting)
    if (options?.serverIndex !== undefined && !isNaN(options.serverIndex)) {
      const idx = Math.abs(Math.floor(options.serverIndex)) % servers.length;
      return { serverUrl: servers[idx], serverIndex: idx };
    }

    // 2. Filter healthy servers
    const healthyList = servers
      .map((url, idx) => ({ url, idx }))
      .filter(item => {
        const h = this.healthMap.get(item.idx);
        return h ? h.isHealthy : true;
      });

    // If all servers are marked unhealthy, fall back to full pool to prevent 100% hard failure
    const candidatePool = healthyList.length > 0
      ? healthyList
      : servers.map((url, idx) => ({ url, idx }));

    if (healthyList.length === 0 && servers.length > 1) {
      logger.warn(`[UpstreamManager] All upstream servers marked offline/unhealthy, falling back to full cluster`);
    }

    // 3. Per-model round-robin
    if (options?.model) {
      const current = this.modelCounters.get(options.model) || 0;
      const selection = candidatePool[current % candidatePool.length];
      this.modelCounters.set(options.model, (current + 1) % 100000000);
      return { serverUrl: selection.url, serverIndex: selection.idx };
    }

    // 4. Global round-robin fallback
    const selection = candidatePool[this.globalCounter % candidatePool.length];
    this.globalCounter = (this.globalCounter + 1) % 100000000;
    return { serverUrl: selection.url, serverIndex: selection.idx };
  }

  /**
   * Builds the full target URL and returns server selection metadata.
   */
  public getUpstreamUrl(
    pathAndQuery: string,
    options?: { model?: string; serverIndex?: number }
  ): UpstreamUrlSelection {
    const { serverUrl, serverIndex } = this.getUpstreamServer(options);
    const cleanPath = pathAndQuery.replace(/^\/+/, '');
    return {
      targetUrl: `${serverUrl}/${cleanPath}`,
      serverUrl,
      serverIndex
    };
  }

  /**
   * Resets internal counters and health cache.
   */
  public reset(): void {
    this.modelCounters.clear();
    this.globalCounter = 0;
    this.healthMap.clear();
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
