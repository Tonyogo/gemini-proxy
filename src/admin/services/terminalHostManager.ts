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
  return stream.replace(
    /\x1b(?:\](?:4|10|11|12);\?(?:\x1b\\|\x07)|\[[>?=]?(?:0)?c|\[\??6n|\[\??\d+\$p|\[>0?q|\[(?:14|18|19|20|21)t)/g,
    ''
  );
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

  public handleData(data: string): void {
    if (typeof data === 'string' && data.startsWith('JSON:')) {
      return;
    }
    this.historyBuffer.push(data);
    this.totalBufferSize += data.length;

    // If stream contains terminal clear scrollback sequence (\x1b[3J or \x1bc), compact buffer to purge stale screen history
    if (data.includes('\x1b[3J') || data.includes('\x1bc')) {
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
  private hosts: Map<string, ManagedHost> = new Map();
  private sessions: Map<string, RemoteAgentTerminalSession> = new Map();

  constructor() {}

  public getHosts(): ManagedHost[] {
    return Array.from(this.hosts.values());
  }

  public getHost(hostId: string): ManagedHost | null {
    return this.hosts.get(hostId) || null;
  }

  public getSession(hostId?: string): RemoteAgentTerminalSession | null {
    if (!hostId || !hostId.trim()) return null;
    const targetId = hostId.trim();
    const host = this.hosts.get(targetId);
    if (!host || host.status !== 'online') {
      return null;
    }
    return this.sessions.get(targetId) || null;
  }

  public registerAgent(metadata: {
    hostId: string;
    name?: string;
    hostname?: string;
    ip?: string;
    platform?: string;
    agentWs: any;
  }): ManagedHost {
    const id = metadata.hostId;
    let host = this.hosts.get(id);

    if (!host) {
      host = {
        id,
        name: metadata.name || metadata.hostname || id,
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
      if (metadata.name) host.name = metadata.name;
      if (metadata.hostname) host.hostname = metadata.hostname;
      if (metadata.ip) host.ip = metadata.ip;
      if (metadata.platform) host.platform = metadata.platform;
    }

    let session = this.sessions.get(id);
    if (!session) {
      session = new RemoteAgentTerminalSession(id, metadata.agentWs);
      this.sessions.set(id, session);
    } else {
      // Agent reconnecting / re-registering -> Reset dirty history and notify web clients, without killing agent PTY
      session.updateAgentWs(metadata.agentWs);
      session.reset(true, false);
      this.clearPendingRpcForHost(id);
    }

    logger.info(`[TerminalHostManager] Agent registered: ${id} (${host.name})`);
    return host;
  }

  public unregisterAgent(hostId: string): void {
    const host = this.hosts.get(hostId);
    if (host && host.type === 'agent') {
      host.status = 'offline';
      host.lastSeen = Date.now();
      logger.info(`[TerminalHostManager] Agent unregistered/offline: ${hostId}`);
    }
  }

  public handleAgentData(hostId: string, data: any): void {
    const session = this.sessions.get(hostId);
    if (session) {
      const text = typeof data === 'string' ? data : data.toString();
      session.handleData(text);
    }

    const host = this.hosts.get(hostId);
    if (host) {
      host.lastSeen = Date.now();
      host.status = 'online';
    }
  }

  private rpcResolvers: Map<string, (response: any) => void> = new Map();

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

  public clearPendingRpcForHost(hostId: string): void {
    for (const [reqId, resolver] of this.rpcResolvers.entries()) {
      resolver({ success: false, error: `Agent ${hostId} reconnected; previous RPC cancelled` });
      this.rpcResolvers.delete(reqId);
    }
  }

  public async executeFileRpc(hostId: string, payload: { action: string; path: string; params?: any }): Promise<any> {
    const session = this.getSession(hostId);
    if (!session) {
      return { success: false, error: `Agent "${hostId}" is offline or unavailable` };
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
