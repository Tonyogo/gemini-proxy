import logger from '../../utils/logger';

export interface ManagedHost {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  platform: string;
  status: 'online' | 'offline';
  lastSeen: number;
  type: 'agent';
}

export interface ITerminalSession {
  attach(ws: any): void;
  detach(ws: any): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  reset(notifyClients?: boolean, resetAgentPty?: boolean): void;
  destroy(): void;
}

/**
 * Strips terminal query escape sequences from historical replayed streams
 * (such as OSC 10/11 color queries, DA device attribute queries, CPR cursor requests)
 * to prevent attached xterm.js clients from generating synthetic response reports back into the shell.
 */
export function stripTerminalQuerySequences(stream: string): string {
  if (!stream || typeof stream !== 'string') return '';
  const stripped = stream.replace(
    /\x1b(?:\](?:4|10|11|12);\?(?:\x1b\\|\x07)|\[[>?=]?(?:0)?c|\[\??6n|\[\??\d+\$p|\[>0?q|\[(?:14|18|19|20|21)t)/g,
    ''
  );
  if (!stripped) return '';
  // Prepend soft style reset and show cursor to ensure pristine state after replay
  return '\x1b[0m\x1b[?25h' + stripped;
}

export class RemoteAgentTerminalSession implements ITerminalSession {
  public hostId: string;
  private agentWs: any = null;
  private activeSockets: Set<any> = new Set();
  private historyBuffer: string[] = [];
  private totalBufferSize: number = 0;
  private readonly maxBufferSize: number = 200 * 1024; // 200KB scrollback

  constructor(hostId: string, agentWs?: any) {
    this.hostId = hostId;
    this.agentWs = agentWs;
  }

  public updateAgentWs(agentWs: any): void {
    this.agentWs = agentWs;
  }

  public attach(ws: any): void {
    this.activeSockets.add(ws);
    // Replay history buffer atomically as a single combined stream with query sequences stripped to prevent echo storms
    if (this.historyBuffer.length > 0 && ws.readyState === 1) {
      try {
        const fullStream = this.historyBuffer.join('');
        const sanitized = stripTerminalQuerySequences(fullStream);
        if (sanitized.length > 0) {
          ws.send(sanitized);
        }
      } catch {
        // Ignore socket write errors during replay
      }
    }
  }

  public detach(ws: any): void {
    this.activeSockets.delete(ws);
  }

  public write(data: string): void {
    if (this.agentWs && this.agentWs.readyState === 1) {
      try {
        this.agentWs.send(data);
      } catch (err: any) {
        logger.warn(`[RemoteAgentTerminal:${this.hostId}] Failed to send data to agent: ${err.message}`);
      }
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.agentWs && this.agentWs.readyState === 1) {
      try {
        this.agentWs.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
      } catch (err: any) {
        logger.warn(`[RemoteAgentTerminal:${this.hostId}] Failed to send resize to agent: ${err.message}`);
      }
    }
  }

  public reset(notifyClients: boolean = true, resetAgentPty: boolean = false): void {
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    if (resetAgentPty && this.agentWs && this.agentWs.readyState === 1) {
      try {
        this.agentWs.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      } catch (err: any) {
        logger.warn(`[RemoteAgentTerminal:${this.hostId}] Failed to send reset to agent: ${err.message}`);
      }
    }
    if (notifyClients) {
      for (const ws of this.activeSockets) {
        try {
          if (ws.readyState === 1) {
            ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
            ws.send('\x1b[2J\x1b[H\x1b[3J');
          }
        } catch {
          // Ignore write errors
        }
      }
    }
  }

  public destroy(): void {
    this.activeSockets.clear();
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    this.agentWs = null;
  }

  public handleData(data: string | Buffer): void {
    if (typeof data === 'string' && data.startsWith('JSON:')) {
      return;
    }
    const text = typeof data === 'string' ? data : data.toString('utf-8');
    this.historyBuffer.push(text);
    this.totalBufferSize += text.length;

    // If stream contains terminal clear scrollback sequence (\x1b[3J or \x1bc), compact buffer to purge stale screen history
    if (text.includes('\x1b[3J') || text.includes('\x1bc')) {
      const combined = this.historyBuffer.join('');
      const lastClearIdx = Math.max(combined.lastIndexOf('\x1b[3J'), combined.lastIndexOf('\x1bc'));
      if (lastClearIdx !== -1) {
        this.historyBuffer = [combined.slice(lastClearIdx)];
        this.totalBufferSize = this.historyBuffer[0].length;
      }
    }

    while (this.totalBufferSize > this.maxBufferSize && this.historyBuffer.length > 0) {
      const removed = this.historyBuffer.shift();
      if (removed) {
        this.totalBufferSize -= removed.length;
      }
    }

    for (const ws of this.activeSockets) {
      try {
        if (ws.readyState === 1) {
          ws.send(data);
        }
      } catch {
        // Ignore socket write errors
      }
    }
  }

  public getHistory(): string {
    return this.historyBuffer.join('');
  }
}

export class TerminalHostManager {
  public static readonly OFFLINE_HOST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private hosts: Map<string, ManagedHost> = new Map();
  private sessions: Map<string, RemoteAgentTerminalSession> = new Map();
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Schedule periodic sweep every hour (unref so it doesn't block process exit)
    this.pruneTimer = setInterval(() => {
      this.pruneOfflineHosts(TerminalHostManager.OFFLINE_HOST_TTL_MS);
    }, 60 * 60 * 1000);
    if (this.pruneTimer && typeof this.pruneTimer.unref === 'function') {
      this.pruneTimer.unref();
    }
  }

  public resolveCanonicalHostId(input?: string): string | null {
    if (!input || !input.trim()) return null;
    const target = input.trim();

    // 1. Exact ID match
    if (this.hosts.has(target)) return target;

    // 2. Exact Name match (prefer online node)
    const matchingByName: ManagedHost[] = [];
    for (const host of this.hosts.values()) {
      if (host.name === target) {
        matchingByName.push(host);
      }
    }
    if (matchingByName.length > 0) {
      const online = matchingByName.find(h => h.status === 'online');
      return (online || matchingByName[0]).id;
    }

    // 3. Short ID prefix match (minimum 4 chars, like Docker)
    if (target.length >= 4) {
      const matchingPrefix: ManagedHost[] = [];
      for (const host of this.hosts.values()) {
        if (host.id.toLowerCase().startsWith(target.toLowerCase())) {
          matchingPrefix.push(host);
        }
      }
      if (matchingPrefix.length === 1) {
        return matchingPrefix[0].id;
      }
      if (matchingPrefix.length > 1) {
        const online = matchingPrefix.find(h => h.status === 'online');
        if (online) return online.id;
      }
    }

    return null;
  }

  public pruneOfflineHosts(maxAgeMs: number = TerminalHostManager.OFFLINE_HOST_TTL_MS): string[] {
    const now = Date.now();
    const prunedIds: string[] = [];

    for (const [id, host] of this.hosts.entries()) {
      if (host.status === 'offline') {
        const age = now - (host.lastSeen || 0);
        if (maxAgeMs <= 0 || age >= maxAgeMs) {
          prunedIds.push(id);
          const session = this.sessions.get(id);
          if (session) {
            session.destroy();
            this.sessions.delete(id);
          }
          this.clearPendingRpcForHost(id);
          this.hosts.delete(id);
          logger.info(`[TerminalHostManager] Pruned offline host: ${id} (lastSeen: ${new Date(host.lastSeen).toISOString()})`);
        }
      }
    }

    return prunedIds;
  }

  public getHosts(): ManagedHost[] {
    this.pruneOfflineHosts(TerminalHostManager.OFFLINE_HOST_TTL_MS);
    const list = Array.from(this.hosts.values());
    return list.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'online' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  public getHost(hostIdOrName: string): ManagedHost | null {
    const canonicalId = this.resolveCanonicalHostId(hostIdOrName);
    if (!canonicalId) return null;
    return this.hosts.get(canonicalId) || null;
  }

  public getSession(hostIdOrName?: string): RemoteAgentTerminalSession | null {
    if (!hostIdOrName || !hostIdOrName.trim()) return null;
    const canonicalId = this.resolveCanonicalHostId(hostIdOrName);
    if (!canonicalId) return null;
    const host = this.hosts.get(canonicalId);
    if (!host || host.status !== 'online') {
      return null;
    }
    return this.sessions.get(canonicalId) || null;
  }

  public registerAgent(metadata: {
    hostId: string;
    name?: string;
    hostname?: string;
    ip?: string;
    platform?: string;
    agentWs: any;
  }): { success: boolean; host?: ManagedHost; error?: string } {
    const id = metadata.hostId.trim();
    const targetName = (metadata.name || metadata.hostname || id).trim();

    // 1. Check for name conflict against ACTIVE (online) nodes
    for (const [existingId, existingHost] of this.hosts.entries()) {
      if (existingId !== id && existingHost.name === targetName) {
        if (existingHost.status === 'online') {
          logger.warn(`[TerminalHostManager] Rejecting duplicate online host name "${targetName}" from ${id} (held by ${existingId})`);
          return {
            success: false,
            error: `Conflict: Host name '${targetName}' is already in use by active node '${existingId}'`
          };
        } else {
          // Auto-prune offline host to allow takeover
          const session = this.sessions.get(existingId);
          if (session) {
            session.destroy();
            this.sessions.delete(existingId);
          }
          this.clearPendingRpcForHost(existingId);
          this.hosts.delete(existingId);
          logger.info(`[TerminalHostManager] Pruned offline host with matching name "${targetName}": ${existingId}`);
        }
      }
    }

    // 2. Register or update host strictly under `id`
    let host = this.hosts.get(id);
    if (!host) {
      host = {
        id,
        name: targetName,
        hostname: metadata.hostname || id,
        ip: metadata.ip || '127.0.0.1',
        platform: metadata.platform || 'linux',
        status: 'online',
        lastSeen: Date.now(),
        type: 'agent',
      };
      this.hosts.set(id, host);
    } else {
      host.status = 'online';
      host.lastSeen = Date.now();
      host.name = targetName;
      if (metadata.hostname) host.hostname = metadata.hostname;
      if (metadata.ip) host.ip = metadata.ip;
      if (metadata.platform) host.platform = metadata.platform;
    }

    let session = this.sessions.get(id);
    if (!session) {
      session = new RemoteAgentTerminalSession(id, metadata.agentWs);
      this.sessions.set(id, session);
    } else {
      // Agent reconnecting -> Soft update agent WebSocket without wiping history or interrupting client screens
      session.updateAgentWs(metadata.agentWs);
      this.clearPendingRpcForHost(id);
    }

    logger.info(`[TerminalHostManager] Agent registered: ${id} (${host.name})`);
    return { success: true, host };
  }

  public unregisterAgent(hostId: string): void {
    const canonicalId = this.resolveCanonicalHostId(hostId) || hostId;
    const host = this.hosts.get(canonicalId);
    if (host && host.type === 'agent') {
      host.status = 'offline';
      host.lastSeen = Date.now();
      logger.info(`[TerminalHostManager] Agent unregistered/offline: ${canonicalId}`);
    }
  }

  public handleAgentData(hostId: string, data: any): void {
    const session = this.sessions.get(hostId);
    if (session) {
      session.handleData(data);
    }

    const host = this.hosts.get(hostId);
    if (host) {
      host.lastSeen = Date.now();
      host.status = 'online';
    }
  }

  private rpcResolvers: Map<string, (response: any) => void> = new Map();
  private cmdRpcResolvers: Map<string, (response: any) => void> = new Map();

  public handleAgentRpcResponse(response: any): void {
    const { reqId } = response;
    if (reqId && this.rpcResolvers.has(reqId)) {
      const resolver = this.rpcResolvers.get(reqId);
      this.rpcResolvers.delete(reqId);
      if (resolver) {
        resolver(response);
      }
    }
  }

  public handleAgentCmdRpcResponse(response: any): void {
    const { reqId } = response;
    if (reqId && this.cmdRpcResolvers.has(reqId)) {
      const resolver = this.cmdRpcResolvers.get(reqId);
      this.cmdRpcResolvers.delete(reqId);
      if (resolver) {
        resolver(response);
      }
    }
  }

  public clearPendingRpcForHost(hostId: string): void {
    for (const [reqId, resolver] of this.rpcResolvers.entries()) {
      resolver({ success: false, error: `Agent ${hostId} reconnected; previous RPC cancelled` });
      this.rpcResolvers.delete(reqId);
    }
    for (const [reqId, resolver] of this.cmdRpcResolvers.entries()) {
      resolver({ success: false, error: `Agent ${hostId} reconnected; previous command RPC cancelled` });
      this.cmdRpcResolvers.delete(reqId);
    }
  }

  public async executeCmdRpc(hostIdOrName: string, payload: { action: string; [key: string]: any }): Promise<any> {
    const canonicalId = this.resolveCanonicalHostId(hostIdOrName);
    if (!canonicalId) {
      return { success: false, error: `Agent "${hostIdOrName}" is offline or unavailable` };
    }
    const session = this.getSession(canonicalId);
    if (!session) {
      return { success: false, error: `Agent "${hostIdOrName}" is offline or unavailable` };
    }

    const reqId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rpcMsg = `JSON:${JSON.stringify({
      type: 'cmd_exec',
      reqId,
      ...payload,
    })}`;

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        if (this.cmdRpcResolvers.has(reqId)) {
          this.cmdRpcResolvers.delete(reqId);
          resolve({ success: false, error: 'Agent command RPC request timed out (30s)' });
        }
      }, 30000);

      this.cmdRpcResolvers.set(reqId, (response) => {
        clearTimeout(timeoutTimer);
        resolve(response);
      });

      session.write(rpcMsg);
    });
  }

  public async executeFileRpc(hostIdOrName: string, payload: { action: string; path: string; params?: any }): Promise<any> {
    const canonicalId = this.resolveCanonicalHostId(hostIdOrName);
    if (!canonicalId) {
      return { success: false, error: `Agent "${hostIdOrName}" is offline or unavailable` };
    }
    const session = this.getSession(canonicalId);
    if (!session) {
      return { success: false, error: `Agent "${hostIdOrName}" is offline or unavailable` };
    }

    const reqId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rpcMsg = `JSON:${JSON.stringify({
      type: 'file_rpc',
      reqId,
      ...payload,
    })}`;

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        if (this.rpcResolvers.has(reqId)) {
          this.rpcResolvers.delete(reqId);
          resolve({ success: false, error: 'Agent file request timed out (30s)' });
        }
      }, 30000);

      this.rpcResolvers.set(reqId, (res) => {
        clearTimeout(timeoutTimer);
        resolve(res);
      });

      session.write(rpcMsg);
    });
  }
}

export const terminalHostManager = new TerminalHostManager();
export default terminalHostManager;
