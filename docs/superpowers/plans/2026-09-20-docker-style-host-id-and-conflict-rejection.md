# Docker-Style Unique Host ID, Auto-Naming & Online Conflict Rejection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 12-character lowercase hexadecimal Host IDs (like Docker Container IDs `e90f23a8b12c`), automatic Docker-style host naming (`<hostname>-<4hex>`), strict server-side online name conflict rejection (WS 4009 + error frame), and canonical ID data routing with lookup resolver across Node.js and Rust agents.

**Architecture:**
1. Server-Side (`terminalHostManager.ts` & `terminalWs.ts`):
   - `registerAgent()` checks for existing `online` hosts holding the same `name`. If found, rejects with `{ success: false, error: ... }`, sends a `type: 'rejected'` frame, and closes WS with code 4009. If the existing same-name host is `offline`, allows registration and prunes the stale record.
   - `resolveCanonicalHostId(input)` resolves exact 12-hex ID, exact Name (online preferred), or 4+ char ID prefix.
   - `getSession()`, `getHost()`, `executeCmdRpc()`, and `executeFileRpc()` route 100% strictly by canonical `hostId`.
2. Node.js Agent (`scripts/terminal-agent.js`):
   - Generates random 12-hex `hostId` per process lifecycle via `crypto.randomBytes(6).toString('hex')` unless `--id` is provided.
   - Auto-generates `<sanitized-hostname>-<4hex>` if `--name` is omitted.
   - On `type: 'rejected'` or close code 4009, prints clear error and exits with code 1 immediately without reconnecting.
3. Rust Agent (`agent-rs/src/config.rs` & `agent-rs/src/ws/client.rs`):
   - Generates random 12-hex `host_id` per lifecycle via `getrandom`.
   - Auto-generates `<sanitized-hostname>-<4hex>` if `--name` is omitted.
   - Handles `type: 'rejected'` or code 4009 and exits with code 1.

**Tech Stack:** TypeScript, Node.js (Crypto, WebSocket), Rust (getrandom, tokio-tungstenite), Express, Jest.

## Global Constraints
- **Zero Cross-Talk**: Two active connections must never share or hijack the same session/name.
- **Docker-Style ID**: 12 lowercase hexadecimal characters matching `^[0-9a-f]{12}$`.
- **Immediate Termination on Rejection**: Agents must exit cleanly with code 1 upon 4009 / rejection, never entering a retry storm.
- **Backward Compatibility**: Existing REST and WebSocket endpoints remain functional.

---

### Task 1: Server-Side Conflict Check & Canonical ID Resolver

**Files:**
- Modify: `src/terminal/services/terminalHostManager.ts`
- Modify: `src/terminal/routes/terminalWs.ts`
- Test: `tests/terminalHostManagerConflict.test.ts`

**Interfaces:**
- Produces:
  - `terminalHostManager.registerAgent(metadata)` returns `{ success: boolean; host?: ManagedHost; error?: string }`
  - `terminalHostManager.resolveCanonicalHostId(input?: string): string | null`
  - `terminalHostManager.getSession(input?: string): RemoteAgentTerminalSession | null`
  - `terminalHostManager.getHost(input?: string): ManagedHost | null`
  - `terminalHostManager.executeCmdRpc(hostOrName: string, payload: any): Promise<any>`
  - `terminalHostManager.executeFileRpc(hostOrName: string, payload: any): Promise<any>`

- [ ] **Step 1: Write failing unit tests for conflict check and canonical resolver**

Create `tests/terminalHostManagerConflict.test.ts`:
```typescript
import { TerminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('TerminalHostManager - Conflict Check & Canonical ID Routing', () => {
  let manager: TerminalHostManager;

  beforeEach(() => {
    manager = new TerminalHostManager();
  });

  it('successfully registers first agent with unique ID and name', () => {
    const mockWs = { readyState: 1, send: jest.fn(), close: jest.fn() };
    const res = manager.registerAgent({
      hostId: 'e90f23a8b12c',
      name: 'worker-node',
      hostname: 'ubuntu-1',
      agentWs: mockWs,
    });

    expect(res.success).toBe(true);
    expect(res.host?.id).toBe('e90f23a8b12c');
    expect(res.host?.name).toBe('worker-node');
    expect(res.host?.status).toBe('online');
  });

  it('rejects second agent with same name when first agent is online', () => {
    const mockWs1 = { readyState: 1, send: jest.fn(), close: jest.fn() };
    const mockWs2 = { readyState: 1, send: jest.fn(), close: jest.fn() };

    manager.registerAgent({
      hostId: 'e90f23a8b12c',
      name: 'worker-node',
      hostname: 'ubuntu-1',
      agentWs: mockWs1,
    });

    // Attempt to register duplicate name from different host ID while first is online
    const res2 = manager.registerAgent({
      hostId: '4a1b7c89df20',
      name: 'worker-node',
      hostname: 'ubuntu-2',
      agentWs: mockWs2,
    });

    expect(res2.success).toBe(false);
    expect(res2.error).toContain("Host name 'worker-node' is already in use by active node 'e90f23a8b12c'");

    // First agent session must remain intact and online
    const firstHost = manager.getHost('e90f23a8b12c');
    expect(firstHost?.status).toBe('online');
    expect(manager.getSession('e90f23a8b12c')).not.toBeNull();
  });

  it('allows takeover of name if previous agent with that name is offline', () => {
    const mockWs1 = { readyState: 1, send: jest.fn(), close: jest.fn(), destroy: jest.fn() };
    const mockWs2 = { readyState: 1, send: jest.fn(), close: jest.fn() };

    manager.registerAgent({
      hostId: 'e90f23a8b12c',
      name: 'worker-node',
      hostname: 'ubuntu-1',
      agentWs: mockWs1,
    });

    // First agent goes offline
    manager.unregisterAgent('e90f23a8b12c');
    expect(manager.getHost('e90f23a8b12c')?.status).toBe('offline');

    // Second agent connects with same name
    const res2 = manager.registerAgent({
      hostId: '4a1b7c89df20',
      name: 'worker-node',
      hostname: 'ubuntu-1-restarted',
      agentWs: mockWs2,
    });

    expect(res2.success).toBe(true);
    expect(res2.host?.id).toBe('4a1b7c89df20');
    expect(res2.host?.status).toBe('online');

    // Old offline host record was pruned
    expect(manager.getHost('e90f23a8b12c')).toBeNull();
  });

  it('resolves canonical host ID by exact ID, short prefix, or Name', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    manager.registerAgent({
      hostId: 'e90f23a8b12c',
      name: 'production-app',
      hostname: 'prod-srv',
      agentWs: mockWs,
    });

    // 1. Exact ID
    expect(manager.resolveCanonicalHostId('e90f23a8b12c')).toBe('e90f23a8b12c');
    // 2. Short prefix (min 4 chars)
    expect(manager.resolveCanonicalHostId('e90f23')).toBe('e90f23a8b12c');
    // 3. Name lookup
    expect(manager.resolveCanonicalHostId('production-app')).toBe('e90f23a8b12c');
    // 4. Non-existent
    expect(manager.resolveCanonicalHostId('non-existent')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalHostManagerConflict.test.ts`
Expected: FAIL because `registerAgent` does not yet return `{ success, error }` on online conflict.

- [ ] **Step 3: Update `src/terminal/services/terminalHostManager.ts`**

Update `src/terminal/services/terminalHostManager.ts`:
```typescript
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

export function stripTerminalQuerySequences(stream: string): string {
  if (!stream || typeof stream !== 'string') return '';
  const stripped = stream.replace(
    /\x1b(?:\](?:4|10|11|12);\?(?:\x1b\\|\x07)|\[[>?=]?(?:0)?c|\[\??6n|\[\??\d+\$p|\[>0?q|\[(?:14|18|19|20|21)t)/g,
    ''
  );
  if (!stripped) return '';
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
    if (this.historyBuffer.length > 0) {
      const fullHistory = this.historyBuffer.join('');
      const sanitizedHistory = stripTerminalQuerySequences(fullHistory);
      if (sanitizedHistory) {
        ws.send(sanitizedHistory);
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
        } catch {}
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
      } catch {}
    }
  }
}

export class TerminalHostManager {
  private hosts: Map<string, ManagedHost> = new Map();
  private sessions: Map<string, RemoteAgentTerminalSession> = new Map();
  private rpcResolvers: Map<string, (response: any) => void> = new Map();
  private cmdRpcResolvers: Map<string, (response: any) => void> = new Map();

  public static readonly OFFLINE_HOST_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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
          logger.info(`[TerminalHostManager] Pruned offline host: ${id}`);
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
      const text = typeof data === 'string' ? data : data.toString();
      session.handleData(text);
    }

    const host = this.hosts.get(hostId);
    if (host) {
      host.lastSeen = Date.now();
      host.status = 'online';
    }
  }

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
```

- [ ] **Step 4: Update `src/terminal/routes/terminalWs.ts` to reject conflicting connections**

In `src/terminal/routes/terminalWs.ts`:
```typescript
    const regResult = terminalHostManager.registerAgent({
      hostId,
      name,
      hostname,
      ip,
      platform,
      agentWs: ws,
    });

    if (!regResult.success) {
      logger.warn(`[TerminalWS:Agent] Registration rejected for ${hostId} (${name}): ${regResult.error}`);
      try {
        ws.send(`JSON:${JSON.stringify({ type: 'rejected', reason: regResult.error, code: 4009 })}`);
        ws.close(4009, regResult.error);
      } catch {}
      return;
    }

    const host = regResult.host!;
    logger.info(`[TerminalWS:Agent] Agent connected: ${hostId} (${host.name}) from ${ip}`);
    ws.send(`JSON:${JSON.stringify({ type: 'registered', hostId, status: 'online' })}`);
```

- [ ] **Step 5: Run tests to verify Task 1 passes**

Run: `npx jest tests/terminalHostManagerConflict.test.ts tests/terminalHostManagerCmdRpc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/terminal/services/terminalHostManager.ts src/terminal/routes/terminalWs.ts tests/terminalHostManagerConflict.test.ts
git commit -m "feat(terminal): add online name conflict rejection and canonical host ID lookup resolver"
```

---

### Task 2: Node.js Agent 12-Hex Container ID, Auto-Naming & Rejection Handling

**Files:**
- Modify: `scripts/terminal-agent.js`
- Test: `tests/terminalAgentConflict.test.ts`

**Interfaces:**
- Produces:
  - Random 12-hex `hostId` (via `crypto.randomBytes(6).toString('hex')`).
  - Auto-generated `<sanitized-hostname>-<4hex>` if `--name` is omitted.
  - On `type === 'rejected'` frame or WS close code `4009`, prints red error and exits code 1 (no reconnect).

- [ ] **Step 1: Write integration test for Node.js Agent auto-naming and conflict rejection**

Create `tests/terminalAgentConflict.test.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { execFile } from 'child_process';
import path from 'path';

const agentScript = path.resolve(__dirname, '../scripts/terminal-agent.js');

describe('Node.js Terminal Agent - 12-Hex ID, Auto-Naming and Conflict Rejection', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let serverPort: number;
  let receivedQueryParams: Record<string, string> = {};

  beforeAll((done) => {
    server = http.createServer();
    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      url.searchParams.forEach((val, key) => {
        receivedQueryParams[key] = val;
      });

      wss.handleUpgrade(req, socket, head, (ws) => {
        if (url.searchParams.get('name') === 'conflict-name') {
          // Simulate rejection
          ws.send(JSON.stringify({ type: 'rejected', reason: 'Name already taken', code: 4009 }));
          ws.close(4009, 'Name already taken');
        } else {
          ws.send(JSON.stringify({ type: 'registered', hostId: url.searchParams.get('hostId'), status: 'online' }));
        }
      });
    });

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    wss.close();
    server.close(done);
  });

  beforeEach(() => {
    receivedQueryParams = {};
  });

  it('generates 12-hex hostId and auto-derives name when not specified', (done) => {
    const child = execFile('node', [agentScript, `--server=http://localhost:${serverPort}`]);

    setTimeout(() => {
      expect(receivedQueryParams.hostId).toMatch(/^[0-9a-f]{12}$/);
      expect(receivedQueryParams.name).toMatch(/^[a-z0-9-_]+-[0-9a-f]{4}$/);
      child.kill('SIGTERM');
      done();
    }, 500);
  });

  it('exits with code 1 immediately without reconnect loops when rejected with 4009', (done) => {
    const child = execFile('node', [agentScript, `--server=http://localhost:${serverPort}`, '--name=conflict-name'], (error, stdout, stderr) => {
      expect(error?.code).toBe(1);
      expect(stderr).toContain('Registration rejected by server');
      done();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalAgentConflict.test.ts`
Expected: FAIL because 12-hex ID and rejection exit are not yet implemented in `terminal-agent.js`.

- [ ] **Step 3: Update `scripts/terminal-agent.js`**

In `scripts/terminal-agent.js`:
1. Use `crypto` for 12-hex ID and 4-hex name suffix:
```javascript
const crypto = require('crypto');
// ...
const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
const random4Hex = crypto.randomBytes(2).toString('hex');
const defaultName = `${sanitizedHostname}-${random4Hex}`;

const hostName = options.name ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') : defaultName;
const hostId = options.id || options.hostId || crypto.randomBytes(6).toString('hex');
```
2. In `parseControlMessage` / WS on message:
```javascript
if (control.type === 'rejected') {
  isExiting = true;
  console.error(`\x1b[31m[Error] Registration rejected by server: ${control.reason || 'Name conflict'}\x1b[0m`);
  console.error('Please choose a different name using --name=<unique-name>.');
  process.exit(1);
}
```
3. In `ws.on('close', (code, reason) => { ... })`:
```javascript
if (code === 4009) {
  isExiting = true;
  console.error(`\x1b[31m[Error] Registration rejected by server: ${reason?.toString() || 'Host name conflict'}\x1b[0m`);
  console.error('Please choose a different name using --name=<unique-name>.');
  process.exit(1);
}
```

- [ ] **Step 4: Run test to verify Task 2 passes**

Run: `npx jest tests/terminalAgentConflict.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/terminal-agent.js tests/terminalAgentConflict.test.ts
git commit -m "feat(agent): implement 12-hex container ID, auto-naming, and 4009 rejection handling"
```

---

### Task 3: Rust Agent 12-Hex Container ID, Auto-Naming & Rejection Handling

**Files:**
- Modify: `agent-rs/Cargo.toml`
- Modify: `agent-rs/src/config.rs`
- Modify: `agent-rs/src/ws/client.rs`
- Modify: `agent-rs/src/protocol/message.rs`

**Interfaces:**
- Produces:
  - `config.get_host_id()` produces 12-char hex string matching `^[0-9a-f]{12}$`.
  - `config.get_host_name()` produces `<sanitized-hostname>-<4hex>` if `--name` is omitted.
  - Rust client handles `ControlMessage::Rejected` and close code 4009, printing red error and exiting code 1.

- [ ] **Step 1: Add `getrandom` dependency in `agent-rs/Cargo.toml`**

In `agent-rs/Cargo.toml`:
```toml
getrandom = "0.2"
```

- [ ] **Step 2: Update `agent-rs/src/config.rs`**

In `agent-rs/src/config.rs`:
```rust
    pub fn get_host_id(&self) -> String {
        if let Some(ref id) = self.id {
            return id.clone();
        }
        let mut bytes = [0u8; 6];
        let _ = getrandom::getrandom(&mut bytes);
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }

    pub fn get_host_name(&self) -> String {
        if let Some(ref name) = self.name {
            let sanitized: String = name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
                .collect();
            let trimmed = sanitized.trim_matches('-');
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        let hostname = self.get_hostname();
        let sanitized_hostname: String = hostname
            .to_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let trimmed_host = sanitized_hostname.trim_matches('-');
        let safe_host = if trimmed_host.is_empty() { "host" } else { trimmed_host };

        let mut bytes = [0u8; 2];
        let _ = getrandom::getrandom(&mut bytes);
        let hex4: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
        format!("{}-{}", safe_host, hex4)
    }
```

- [ ] **Step 3: Update `agent-rs/src/protocol/message.rs` and `agent-rs/src/ws/client.rs`**

In `agent-rs/src/protocol/message.rs`, add `ControlMessage::Rejected { reason: String }`:
```rust
        "rejected" => {
            let reason = parsed.get("reason").and_then(|r| r.as_str()).unwrap_or("Name conflict").to_string();
            Some(ControlMessage::Rejected { reason })
        }
```

In `agent-rs/src/ws/client.rs`:
```rust
ControlMessage::Rejected { reason } => {
    eprintln!("\x1b[31m[Error] Registration rejected by server: {}\x1b[0m", reason);
    eprintln!("Please choose a different name using --name=<unique-name>.");
    std::process::exit(1);
}
```
And on Close frame with code `4009`:
```rust
if let Some(ref cf) = close_frame {
    if cf.code == 4009.into() {
        eprintln!("\x1b[31m[Error] Registration rejected by server (4009 Name Conflict): {}\x1b[0m", cf.reason);
        eprintln!("Please choose a different name using --name=<unique-name>.");
        std::process::exit(1);
    }
}
```

- [ ] **Step 4: Verify Rust compilation and tests**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo test --manifest-path agent-rs/Cargo.toml
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agent-rs/Cargo.toml agent-rs/src/config.rs agent-rs/src/protocol/message.rs agent-rs/src/ws/client.rs
git commit -m "feat(rust): implement 12-hex host ID, auto-naming, and conflict rejection exit"
```

---

### Task 4: Full Regression Testing & Production Build

**Files:**
- Run full test suite & production build

- [ ] **Step 1: Run complete Jest test suite**

Run: `npm test`
Expected: 100% test suites pass.

- [ ] **Step 2: Build release Rust binary**

Run:
```bash
PATH="/Users/yogo/.rustup/toolchains/stable-x86_64-apple-darwin/bin:$HOME/.cargo/bin:$PATH" cargo build --release --manifest-path agent-rs/Cargo.toml
```
Expected: Binary compiles cleanly at `agent-rs/target/release/gt`.

- [ ] **Step 3: Run full production build**

Run: `npm run build`
Expected: 0 errors for frontend Vite SPA and backend TypeScript compilation.

- [ ] **Step 4: Commit any remaining updates**

```bash
git status
git commit -m "chore: complete Docker-style unique host ID, auto-naming, and conflict rejection implementation"
```
