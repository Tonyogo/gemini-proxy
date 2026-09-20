import config, { parseBaseUrls } from '../../config/default';
import logger from './logger';

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
}

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export interface UpstreamCircuitState {
  serverUrl: string;
  serverIndex: number;
  consecutiveFailures: number;
  isolatedUntil: number; // Timestamp in ms until node is isolated; 0 if healthy
  lastError?: string;
}

export class UpstreamManager {
  private modelCounters: Map<string, number> = new Map();
  private globalCounter: number = 0;
  private circuitMap: Map<number, UpstreamCircuitState> = new Map();

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    const raw = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const urls = parseBaseUrls(raw);
    return urls.length > 0 ? urls : ['https://generativelanguage.googleapis.com'];
  }

  /**
   * Returns circuit breaker status list for all configured upstream nodes.
   */
  public getCircuitStatusList(): UpstreamCircuitState[] {
    const servers = this.getBaseUrls();
    const now = Date.now();
    return servers.map((url, idx) => {
      const existing = this.circuitMap.get(idx);
      if (existing && existing.serverUrl === url) {
        // Auto-heal if isolation time has passed
        if (existing.isolatedUntil > 0 && existing.isolatedUntil <= now) {
          existing.isolatedUntil = 0;
          existing.consecutiveFailures = 0;
          existing.lastError = undefined;
        }
        return existing;
      }
      const initial: UpstreamCircuitState = {
        serverUrl: url,
        serverIndex: idx,
        consecutiveFailures: 0,
        isolatedUntil: 0
      };
      this.circuitMap.set(idx, initial);
      return initial;
    });
  }

  /**
   * Checks whether a node is currently isolated under circuit breaker.
   */
  public isNodeIsolated(serverIndex: number): boolean {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return false;
    const existing = this.circuitMap.get(serverIndex);
    if (!existing) return false;
    if (existing.isolatedUntil > 0 && existing.isolatedUntil > Date.now()) {
      return true;
    }
    return false;
  }

  /**
   * Records request outcome for a given upstream server.
   * 3 consecutive failures trigger 180-second isolation.
   */
  public recordRequestResult(serverIndex: number, success: boolean, error?: string | number): void {
    const servers = this.getBaseUrls();
    if (serverIndex < 0 || serverIndex >= servers.length) return;
    const url = servers[serverIndex];
    let existing = this.circuitMap.get(serverIndex);
    if (!existing || existing.serverUrl !== url) {
      existing = {
        serverUrl: url,
        serverIndex,
        consecutiveFailures: 0,
        isolatedUntil: 0
      };
      this.circuitMap.set(serverIndex, existing);
    }

    if (success) {
      existing.consecutiveFailures = 0;
      existing.isolatedUntil = 0;
      existing.lastError = undefined;
      return;
    }

    existing.consecutiveFailures += 1;
    existing.lastError = error !== undefined ? String(error) : 'Upstream request failed';

    if (existing.consecutiveFailures >= 3) {
      existing.isolatedUntil = Date.now() + 180_000; // 180 seconds isolation
      logger.warn(`[UpstreamManager] Upstream node ${serverIndex + 1} (${url}) failed 3 times consecutively (${existing.lastError}). Isolated for 180s.`);
    }
  }

  /**
   * Resets circuit state for a given node or all nodes.
   */
  public resetCircuit(serverIndex?: number): void {
    if (serverIndex !== undefined) {
      this.circuitMap.delete(serverIndex);
    } else {
      this.circuitMap.clear();
    }
  }

  /**
   * Selects an upstream server based on model-specific round-robin,
   * explicit server index, or global round-robin, skipping isolated nodes.
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

    // 2. Filter out isolated nodes
    const now = Date.now();
    const availableList = servers
      .map((url, idx) => ({ url, idx }))
      .filter(item => {
        const state = this.circuitMap.get(item.idx);
        return !state || state.isolatedUntil <= now;
      });

    // If all servers are isolated, fall back to full pool to prevent 100% rejection
    const candidatePool = availableList.length > 0
      ? availableList
      : servers.map((url, idx) => ({ url, idx }));

    if (availableList.length === 0 && servers.length > 1) {
      logger.warn(`[UpstreamManager] All upstream servers currently isolated, falling back to full cluster`);
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
   * Resets internal counters and circuit state.
   */
  public reset(): void {
    this.modelCounters.clear();
    this.globalCounter = 0;
    this.circuitMap.clear();
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
