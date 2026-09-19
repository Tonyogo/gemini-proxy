import config, { parseBaseUrls } from '../../config/default';

export interface UpstreamServerSelection {
  serverUrl: string;
  serverIndex: number;
}

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export class UpstreamManager {
  private modelCounters: Map<string, number> = new Map();
  private globalCounter: number = 0;

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    const raw = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    const urls = parseBaseUrls(raw);
    return urls.length > 0 ? urls : ['https://generativelanguage.googleapis.com'];
  }

  /**
   * Selects an upstream server based on model-specific round-robin,
   * explicit server index, or global round-robin.
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

    // 2. Per-model round-robin
    if (options?.model) {
      const current = this.modelCounters.get(options.model) || 0;
      const idx = current % servers.length;
      this.modelCounters.set(options.model, (current + 1) % 100000000);
      return { serverUrl: servers[idx], serverIndex: idx };
    }

    // 3. Global round-robin fallback
    const idx = this.globalCounter % servers.length;
    this.globalCounter = (this.globalCounter + 1) % 100000000;
    return { serverUrl: servers[idx], serverIndex: idx };
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
   * Resets internal counters (primarily for testing and hot-reload).
   */
  public reset(): void {
    this.modelCounters.clear();
    this.globalCounter = 0;
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
