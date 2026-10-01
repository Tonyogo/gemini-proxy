import config, { parseBaseUrls, parseUpstreamServers } from '../../config/default';
import { UpstreamServerConfig, UpstreamServerStatus, UpstreamServerSelection } from '../types';
import { terminalHostManager } from '../terminal/services/terminalHostManager';
import logger from './logger';
import { parseModelThinkingSuffix } from './modelThinkingHelper';

export { UpstreamServerSelection };

export interface UpstreamUrlSelection extends UpstreamServerSelection {
  targetUrl: string;
}

export interface UpstreamCircuitState extends UpstreamServerStatus {
  serverUrl: string;
}

interface WeightedSchedulerState {
  currentWeights: Map<number, number>;
  lastSelectedIndex?: number;
}

export class UpstreamManager {
  private modelStates: Map<string, WeightedSchedulerState> = new Map();
  private globalState: WeightedSchedulerState = { currentWeights: new Map() };
  private circuitMap: Map<number, UpstreamCircuitState> = new Map();
  private directKeyIndexMap: Map<number, number> = new Map();

  private selectDirectApiKey(serverIndex: number, server: UpstreamServerConfig): string | undefined {
    if (server.type !== 'direct' || !server.apiKeys || server.apiKeys.length === 0) {
      return undefined;
    }
    const currentIdx = this.directKeyIndexMap.get(serverIndex) || 0;
    const selected = server.apiKeys[currentIdx % server.apiKeys.length];
    this.directKeyIndexMap.set(serverIndex, (currentIdx + 1) % server.apiKeys.length);
    return selected;
  }

  /**
   * Retrieves current list of configured upstream servers with weights and enabled state.
   */
  public getUpstreamServers(): UpstreamServerConfig[] {
    if (config.upstreamServers && Array.isArray(config.upstreamServers) && config.upstreamServers.length > 0) {
      return config.upstreamServers;
    }
    return parseUpstreamServers(config.geminiBaseUrl);
  }

  /**
   * Retrieves current list of configured upstream server URLs.
   */
  public getBaseUrls(): string[] {
    return this.getUpstreamServers().map(s => s.url);
  }

  /**
   * Returns upstream server status list for all configured upstream nodes including traffic weights and isolation.
   */
  public getUpstreamServerStatusList(): UpstreamServerStatus[] {
    const servers = this.getUpstreamServers();
    const now = Date.now();

    const isServerOnline = (s: UpstreamServerConfig) => {
      if (s.type === 'direct' && s.agentId) {
        return terminalHostManager.isAgentOnline(s.agentId);
      }
      return true;
    };

    // Find active healthy candidates for calculating effectivePercent
    let activeCandidates = servers
      .map((s, idx) => ({ ...s, serverIndex: idx }))
      .filter(item => item.enabled && !this.isNodeIsolated(item.serverIndex) && isServerOnline(item));

    if (activeCandidates.length === 0) {
      const enabledNodes = servers
        .map((s, idx) => ({ ...s, serverIndex: idx }))
        .filter(item => item.enabled && isServerOnline(item));
      if (enabledNodes.length > 0) {
        activeCandidates = enabledNodes;
      } else {
        activeCandidates = servers.map((s, idx) => ({ ...s, serverIndex: idx }));
      }
    }

    const activeTotalWeight = activeCandidates.reduce((sum, c) => sum + (c.weight || 1), 0);
    const activeSet = new Set(activeCandidates.map(c => c.serverIndex));

    return servers.map((server, idx) => {
      const existing = this.circuitMap.get(idx);
      let consecutiveFailures = 0;
      let isolatedUntil = 0;
      let isIsolated = false;
      let lastError: string | undefined = undefined;

      if (existing && existing.url === server.url) {
        if (existing.isolatedUntil > 0 && existing.isolatedUntil <= now) {
          existing.isolatedUntil = 0;
          existing.consecutiveFailures = 0;
          existing.lastError = undefined;
        }
        consecutiveFailures = existing.consecutiveFailures;
        isolatedUntil = existing.isolatedUntil;
        isIsolated = existing.isolatedUntil > 0 && existing.isolatedUntil > now;
        lastError = existing.lastError;
      }

      const effectivePercent = activeSet.has(idx) && activeTotalWeight > 0
        ? parseFloat((((server.weight || 1) / activeTotalWeight) * 100).toFixed(1))
        : 0;

      const status: UpstreamServerStatus = {
        url: server.url,
        serverIndex: idx,
        weight: server.weight || 1,
        enabled: server.enabled !== false,
        name: server.name,
        allowedModels: server.allowedModels,
        type: server.type || 'proxy',
        agentId: server.agentId,
        apiKeys: server.apiKeys,
        keyCount: server.apiKeys ? server.apiKeys.length : 0,
        effectivePercent,
        consecutiveFailures,
        isIsolated,
        isolatedUntil,
        lastError
      };
      return status;
    });
  }

  /**
   * Returns circuit breaker status list for all configured upstream nodes.
   */
  public getCircuitStatusList(): UpstreamCircuitState[] {
    const list = this.getUpstreamServerStatusList();
    return list.map(item => ({
      ...item,
      serverUrl: item.url
    }));
  }

  /**
   * Checks whether a node is currently isolated under circuit breaker.
   */
  public isNodeIsolated(serverIndex: number): boolean {
    const servers = this.getUpstreamServers();
    if (serverIndex < 0 || serverIndex >= servers.length) return false;
    const existing = this.circuitMap.get(serverIndex);
    if (!existing || existing.url !== servers[serverIndex].url) return false;
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
    const servers = this.getUpstreamServers();
    if (serverIndex < 0 || serverIndex >= servers.length) return;
    const server = servers[serverIndex];
    let existing = this.circuitMap.get(serverIndex);
    if (!existing || existing.url !== server.url) {
      existing = {
        url: server.url,
        serverUrl: server.url,
        serverIndex,
        weight: server.weight || 1,
        enabled: server.enabled !== false,
        name: server.name,
        effectivePercent: 0,
        consecutiveFailures: 0,
        isIsolated: false,
        isolatedUntil: 0
      };
      this.circuitMap.set(serverIndex, existing);
    }

    if (success) {
      existing.consecutiveFailures = 0;
      existing.isolatedUntil = 0;
      existing.isIsolated = false;
      existing.lastError = undefined;
      return;
    }

    existing.consecutiveFailures += 1;
    existing.lastError = error !== undefined ? String(error) : 'Upstream request failed';

    if (existing.consecutiveFailures >= 3) {
      existing.isolatedUntil = Date.now() + 180_000; // 180 seconds isolation
      existing.isIsolated = true;
      logger.warn(`[UpstreamManager] Upstream node ${serverIndex + 1} (${server.url}) failed 3 times consecutively (${existing.lastError}). Isolated for 180s.`);
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
   * Checks whether an upstream server supports a given model.
   * Case-insensitive exact match with dual-direction matching (client model or resolved target model).
   * Unrestricted (undefined or empty allowedModels) allows all models.
   */
  public serverSupportsModel(server: UpstreamServerConfig, originalModel?: string, resolvedModel?: string): boolean {
    if (!server.allowedModels || server.allowedModels.length === 0) {
      return true;
    }
    const allowedSet = new Set(server.allowedModels.map(m => m.trim().toLowerCase()).filter(Boolean));
    if (allowedSet.size === 0) return true;

    const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
    const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

    if (normOriginal && allowedSet.has(normOriginal)) return true;
    if (normResolved && allowedSet.has(normResolved)) return true;

    // Check base models if either model has a -high suffix
    const baseOriginal = parseModelThinkingSuffix(normOriginal).baseModel.toLowerCase();
    if (baseOriginal && allowedSet.has(baseOriginal)) return true;

    const baseResolved = parseModelThinkingSuffix(normResolved).baseModel.toLowerCase();
    if (baseResolved && allowedSet.has(baseResolved)) return true;

    return false;
  }

  /**
   * Checks whether any enabled upstream server in the cluster supports the model.
   */
  public hasUpstreamForModel(originalModel?: string, resolvedModel?: string): boolean {
    const servers = this.getUpstreamServers();
    return servers.some(s => s.enabled !== false && this.serverSupportsModel(s, originalModel, resolvedModel));
  }

  private getOrCreateModelState(model: string): WeightedSchedulerState {
    let state = this.modelStates.get(model);
    if (!state) {
      state = { currentWeights: new Map() };
      this.modelStates.set(model, state);
    }
    return state;
  }

  /**
   * Selects an upstream server based on smooth weighted round-robin (SWRR),
   * explicit server index, or per-model/global scheduling, skipping isolated and disabled nodes.
   */
  public getUpstreamServer(options?: {
    model?: string;
    originalModel?: string;
    resolvedModel?: string;
    serverIndex?: number;
  }): UpstreamServerSelection {
    const allServers = this.getUpstreamServers();
    if (allServers.length === 0) {
      return {
        serverUrl: 'https://generativelanguage.googleapis.com',
        serverIndex: 0,
        weight: 1,
        serverType: 'proxy'
      };
    }

    // 1. Explicit serverIndex (e.g. for AccountService or direct targeting)
    if (options?.serverIndex !== undefined && !isNaN(options.serverIndex)) {
      const idx = Math.abs(Math.floor(options.serverIndex)) % allServers.length;
      const target = allServers[idx];
      const serverType = target.type || 'proxy';
      const selectedApiKey = this.selectDirectApiKey(idx, target);
      return {
        serverUrl: target.url,
        serverIndex: idx,
        weight: target.weight || 1,
        serverType,
        selectedApiKey,
        agentId: target.agentId
      };
    }

    const isServerOnline = (s: UpstreamServerConfig) => {
      if (s.type === 'direct' && s.agentId) {
        return terminalHostManager.isAgentOnline(s.agentId);
      }
      return true;
    };

    // Extract models
    const originalModel = options?.originalModel || (options?.model && !options?.resolvedModel ? options.model : undefined);
    const resolvedModel = options?.resolvedModel || (options?.model && !options?.originalModel ? options.model : undefined);
    const hasModelFilter = Boolean(originalModel || resolvedModel || options?.model);

    // 2. Filter candidates
    let candidates: Array<UpstreamServerConfig & { serverIndex: number }> = [];

    if (hasModelFilter) {
      const modelCandidatePool = allServers
        .map((s, idx) => ({ ...s, serverIndex: idx }))
        .filter(item => item.enabled && isServerOnline(item) && this.serverSupportsModel(item, originalModel, resolvedModel));

      if (modelCandidatePool.length > 0) {
        candidates = modelCandidatePool.filter(item => !this.isNodeIsolated(item.serverIndex));
        if (candidates.length === 0) {
          // All servers supporting this model are isolated: fall back strictly to model-supporting cluster
          candidates = modelCandidatePool;
          logger.warn(`[UpstreamManager] All upstream servers supporting model '${originalModel || resolvedModel || options?.model}' currently isolated, falling back to model-supporting cluster`);
        }
      } else {
        // Fallback if no enabled server supports the model
        const anySupporting = allServers
          .map((s, idx) => ({ ...s, serverIndex: idx }))
          .filter(item => isServerOnline(item) && this.serverSupportsModel(item, originalModel, resolvedModel));
        if (anySupporting.length > 0) {
          candidates = anySupporting;
        } else {
          const onlineServers = allServers
            .map((s, idx) => ({ ...s, serverIndex: idx }))
            .filter(isServerOnline);
          candidates = onlineServers.length > 0
            ? onlineServers
            : allServers.map((s, idx) => ({ ...s, serverIndex: idx }));
        }
      }
    } else {
      // No model filter specified
      let pool = allServers
        .map((s, idx) => ({ ...s, serverIndex: idx }))
        .filter(item => item.enabled && isServerOnline(item));

      if (pool.length === 0) {
        const anyOnline = allServers
          .map((s, idx) => ({ ...s, serverIndex: idx }))
          .filter(isServerOnline);
        pool = anyOnline.length > 0 ? anyOnline : allServers.map((s, idx) => ({ ...s, serverIndex: idx }));
      }

      candidates = pool.filter(item => !this.isNodeIsolated(item.serverIndex));
      if (candidates.length === 0) {
        candidates = pool;
      }
    }

    // 3. Fast path if only one candidate
    if (candidates.length === 1) {
      const chosen = candidates[0];
      const serverType = chosen.type || 'proxy';
      const selectedApiKey = this.selectDirectApiKey(chosen.serverIndex, chosen);
      return {
        serverUrl: chosen.url,
        serverIndex: chosen.serverIndex,
        weight: chosen.weight || 1,
        serverType,
        selectedApiKey,
        agentId: chosen.agentId
      };
    }

    // 4. Smooth Weighted Round-Robin (SWRR)
    const modelKey = options?.model || options?.resolvedModel || options?.originalModel;
    const stateKey = modelKey ? `model:${modelKey.trim().toLowerCase()}` : undefined;
    const state = stateKey
      ? this.getOrCreateModelState(stateKey)
      : this.globalState;

    const totalWeight = candidates.reduce((sum, c) => sum + (c.weight || 1), 0);

    for (const cand of candidates) {
      if (!state.currentWeights.has(cand.serverIndex)) {
        state.currentWeights.set(cand.serverIndex, cand.weight || 1);
      }
    }

    // Step A: currentWeight += weight
    for (const cand of candidates) {
      const cur = state.currentWeights.get(cand.serverIndex) || 0;
      state.currentWeights.set(cand.serverIndex, cur + (cand.weight || 1));
    }

    // Step B: find candidate with maximum currentWeight, breaking ties favoring nodes not just selected
    let bestCand = candidates[0];
    let maxWeight = state.currentWeights.get(bestCand.serverIndex)!;

    for (let i = 1; i < candidates.length; i++) {
      const cand = candidates[i];
      const cur = state.currentWeights.get(cand.serverIndex)!;
      if (cur > maxWeight) {
        bestCand = cand;
        maxWeight = cur;
      } else if (cur === maxWeight) {
        if (bestCand.serverIndex === state.lastSelectedIndex && cand.serverIndex !== state.lastSelectedIndex) {
          bestCand = cand;
          maxWeight = cur;
        }
      }
    }

    // Step C: currentWeight -= totalWeight for selected node
    state.currentWeights.set(bestCand.serverIndex, maxWeight - totalWeight);
    state.lastSelectedIndex = bestCand.serverIndex;

    const chosenServer = bestCand;
    const serverType = chosenServer.type || 'proxy';
    const selectedApiKey = this.selectDirectApiKey(chosenServer.serverIndex, chosenServer);

    return {
      serverUrl: chosenServer.url,
      serverIndex: chosenServer.serverIndex,
      weight: chosenServer.weight || 1,
      serverType,
      selectedApiKey,
      agentId: chosenServer.agentId
    };
  }

  /**
   * Builds the full target URL and returns server selection metadata.
   */
  public getUpstreamUrl(
    pathAndQuery: string,
    options?: {
      model?: string;
      originalModel?: string;
      resolvedModel?: string;
      serverIndex?: number;
    }
  ): UpstreamUrlSelection {
    const selection = this.getUpstreamServer(options);
    const cleanPath = pathAndQuery.replace(/^\/+/, '');
    return {
      targetUrl: `${selection.serverUrl}/${cleanPath}`,
      ...selection
    };
  }

  /**
   * Resets internal counters, scheduling state, and circuit state.
   */
  public reset(): void {
    this.modelStates.clear();
    this.globalState = { currentWeights: new Map() };
    this.circuitMap.clear();
    this.directKeyIndexMap.clear();
  }
}

export const upstreamManager = new UpstreamManager();
export default upstreamManager;
