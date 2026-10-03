import { WorkerRuntimeConfig } from '../config/workerConfig';
import { UpstreamServerConfig, UpstreamServerStatus, UpstreamServerSelection } from '../../src/types';
import { parseModelThinkingSuffix } from '../../src/utils/modelThinkingHelper';

export interface WorkerUpstreamSelection extends UpstreamServerSelection {
  targetUrl: string;
}

const circuitMap = new Map<number, { consecutiveFailures: number; isolatedUntil: number; lastError?: string }>();
const directKeyCounters = new Map<number, number>();

export class WorkerUpstreamManager {
  public static selectUpstream(
    targetPathAndQuery: string,
    config: WorkerRuntimeConfig,
    options?: { model?: string; serverIndex?: number }
  ): WorkerUpstreamSelection {
    const servers = config.upstreamServers || [];
    const cleanPath = targetPathAndQuery.startsWith('/') ? targetPathAndQuery : `/${targetPathAndQuery}`;
    const now = Date.now();

    // 1. If explicit serverIndex requested
    if (options?.serverIndex !== undefined && options.serverIndex >= 0 && options.serverIndex < servers.length) {
      const idx = options.serverIndex;
      const s = servers[idx];
      const selectedKey = this.selectDirectApiKey(idx, s);
      const url = `${s.url.replace(/\/+$/, '')}${cleanPath}`;
      return {
        targetUrl: url,
        serverUrl: s.url,
        serverIndex: idx,
        weight: s.weight || 1,
        serverType: s.type || 'proxy',
        selectedApiKey: selectedKey
      };
    }

    // 2. Filter enabled & non-isolated servers
    let candidates = servers
      .map((s, idx) => ({ ...s, serverIndex: idx }))
      .filter(s => {
        if (!s.enabled) return false;
        const circuit = circuitMap.get(s.serverIndex);
        if (circuit && circuit.isolatedUntil > now) return false;
        if (options?.model && Array.isArray(s.allowedModels) && s.allowedModels.length > 0) {
          const m = options.model.toLowerCase();
          return s.allowedModels.some(allowed => allowed.toLowerCase() === m);
        }
        return true;
      });

    // Fallback if all isolated
    if (candidates.length === 0) {
      candidates = servers
        .map((s, idx) => ({ ...s, serverIndex: idx }))
        .filter(s => s.enabled);
    }
    if (candidates.length === 0) {
      candidates = servers.map((s, idx) => ({ ...s, serverIndex: idx }));
    }

    // 3. Weighted Random Selection
    const totalWeight = candidates.reduce((sum, c) => sum + (c.weight || 1), 0);
    let rand = Math.random() * totalWeight;
    let chosen = candidates[0];
    for (const c of candidates) {
      rand -= (c.weight || 1);
      if (rand <= 0) {
        chosen = c;
        break;
      }
    }

    const selectedKey = this.selectDirectApiKey(chosen.serverIndex, chosen);
    const targetUrl = `${chosen.url.replace(/\/+$/, '')}${cleanPath}`;

    return {
      targetUrl,
      serverUrl: chosen.url,
      serverIndex: chosen.serverIndex,
      weight: chosen.weight || 1,
      serverType: chosen.type || 'proxy',
      selectedApiKey: selectedKey
    };
  }

  private static selectDirectApiKey(serverIndex: number, server: UpstreamServerConfig): string | undefined {
    if (server.type !== 'direct' || !server.apiKeys || server.apiKeys.length === 0) {
      return undefined;
    }
    const current = directKeyCounters.get(serverIndex) || 0;
    const selected = server.apiKeys[current % server.apiKeys.length];
    directKeyCounters.set(serverIndex, (current + 1) % server.apiKeys.length);
    return selected;
  }

  public static recordResult(serverIndex: number, success: boolean, error?: string): void {
    const now = Date.now();
    let current = circuitMap.get(serverIndex);
    if (!current) {
      current = { consecutiveFailures: 0, isolatedUntil: 0 };
      circuitMap.set(serverIndex, current);
    }

    if (success) {
      current.consecutiveFailures = 0;
      current.isolatedUntil = 0;
      current.lastError = undefined;
    } else {
      current.consecutiveFailures++;
      current.lastError = error;
      if (current.consecutiveFailures >= 3) {
        current.isolatedUntil = now + 180000; // 3 min circuit breaker
      }
    }
  }

  public static getStatusList(config: WorkerRuntimeConfig): UpstreamServerStatus[] {
    const servers = config.upstreamServers || [];
    const now = Date.now();

    return servers.map((server, idx) => {
      const circuit = circuitMap.get(idx);
      const isIsolated = Boolean(circuit && circuit.isolatedUntil > now);
      return {
        url: server.url,
        serverIndex: idx,
        weight: server.weight || 1,
        enabled: server.enabled !== false,
        name: server.name,
        allowedModels: server.allowedModels,
        type: server.type || 'proxy',
        apiKeys: server.apiKeys,
        keyCount: server.apiKeys ? server.apiKeys.length : 0,
        effectivePercent: 0,
        consecutiveFailures: circuit?.consecutiveFailures || 0,
        isIsolated,
        isolatedUntil: circuit?.isolatedUntil || 0,
        lastError: circuit?.lastError
      };
    });
  }
}
