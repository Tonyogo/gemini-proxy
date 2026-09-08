import * as os from 'os';
import logger from '../../utils/logger';
import { getDefaultTerminalSession } from './terminalService';

export interface ManagedHost {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  platform: string;
  status: 'online' | 'offline';
  lastSeen: number;
  type: 'local' | 'agent';
}

export interface ITerminalSession {
  attach(ws: any): void;
  detach(ws: any): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  reset(notifyClients?: boolean): void;
  destroy(): void;
}

export class RemoteAgentTerminalSession implements ITerminalSession {
  public readonly hostId: string;
  private agentWs: any;
  private activeSockets: Set<any> = new Set();
  private historyBuffer: string[] = [];
  private totalBufferSize: number = 0;
  private maxBufferSize: number = 1024 * 1024; // 1MB

  constructor(hostId: string, agentWs: any) {
    this.hostId = hostId;
    this.agentWs = agentWs;
  }

  public updateAgentWs(agentWs: any): void {
    this.agentWs = agentWs;
  }

  public attach(ws: any): void {
    this.activeSockets.add(ws);
    if (this.historyBuffer.length > 0 && ws.readyState === 1) {
      try {
        ws.send(this.historyBuffer.join(''));
      } catch {
        // Ignore send errors
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

  public reset(notifyClients: boolean = true): void {
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    if (this.agentWs && this.agentWs.readyState === 1) {
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

export class LocalTerminalSessionWrapper implements ITerminalSession {
  public attach(ws: any): void {
    getDefaultTerminalSession().attach(ws);
  }

  public detach(ws: any): void {
    getDefaultTerminalSession().detach(ws);
  }

  public write(data: string): void {
    getDefaultTerminalSession().write(data);
  }

  public resize(cols: number, rows: number): void {
    getDefaultTerminalSession().resize(cols, rows);
  }

  public reset(): void {
    getDefaultTerminalSession().reset();
  }

  public destroy(): void {
    getDefaultTerminalSession().destroy();
  }
}

export class TerminalHostManager {
  private hosts: Map<string, ManagedHost> = new Map();
  private sessions: Map<string, ITerminalSession> = new Map();

  constructor() {
    this.initLocalHost();
  }

  private initLocalHost(): void {
    const localHost: ManagedHost = {
      id: 'local',
      name: 'Localhost',
      hostname: typeof os.hostname === 'function' ? os.hostname() : 'localhost',
      ip: '127.0.0.1',
      platform: typeof os.platform === 'function' ? os.platform() : 'linux',
      status: 'online',
      lastSeen: Date.now(),
      type: 'local',
    };
    this.hosts.set('local', localHost);
    this.sessions.set('local', new LocalTerminalSessionWrapper());
  }

  public getHosts(): ManagedHost[] {
    return Array.from(this.hosts.values());
  }

  public getHost(hostId: string): ManagedHost | null {
    return this.hosts.get(hostId) || null;
  }

  public getSession(hostId?: string): ITerminalSession | null {
    const targetId = hostId && hostId.trim() ? hostId.trim() : 'local';
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

    let session = this.sessions.get(id) as RemoteAgentTerminalSession | undefined;
    if (!session || !(session instanceof RemoteAgentTerminalSession)) {
      session = new RemoteAgentTerminalSession(id, metadata.agentWs);
      this.sessions.set(id, session);
    } else {
      // Agent reconnecting / re-registering -> Reset dirty history and notify web clients
      session.updateAgentWs(metadata.agentWs);
      session.reset(true);
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
    if (session && session instanceof RemoteAgentTerminalSession) {
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
    if (!session || !(session instanceof RemoteAgentTerminalSession)) {
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
