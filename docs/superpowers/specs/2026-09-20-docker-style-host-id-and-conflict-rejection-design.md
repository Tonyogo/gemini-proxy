# Design Doc: Docker-Style Unique Host ID, Automatic Naming, Conflict Rejection & Canonical ID Routing

- **Date:** 2026-09-20
- **Topic:** Docker-Style 12-Hex Host ID, Auto-Naming, Strict Online Name Conflict Rejection, and Canonical Host ID Data Routing
- **Status:** Approved

## 1. Overview & Objectives

In multi-agent environments, when multiple agents connect with identical names or when an agent restarts without a stable identifier:
1. **Name Hijacking / Session Cross-Talk**: If two physical machines launch with `--name=worker`, the second connection previously overwrote the first agent's WebSocket session, leading to channel cross-talk and erratic command execution.
2. **Ambiguous Routing**: Commands like `gt exec worker uptime` rely on name matching, but internal routing in previous versions coupled Name with ID.

### Core Goals (Aligned with Docker Container Architecture):
1. **12-Hex Container-Style Host ID**:
   - Every agent instance generates a unique 12-character lowercase hexadecimal ID (e.g. `e90f23a8b12c`, generated from 6 random cryptographic bytes) per process lifecycle (unless explicitly overridden via `--id`).
2. **Docker-Style Automatic Name Generation**:
   - If `--name` is omitted, automatically generate `<sanitized-hostname>-<4-hex-random>` (e.g. `ubuntu-srv-a3b1`, `macbook-7f2c`).
3. **Strict Online Name Conflict Rejection**:
   - If an agent connects with a `--name` currently held by an **active (`online`)** host, the proxy server rejects the connection:
     - Sends `JSON:{"type":"rejected","reason":"Conflict: Host name 'worker' is already in use by active node 'e90f23a8b12c'"}`.
     - Closes the WebSocket with code `4009 (Name Conflict)`.
     - The agent immediately logs the actionable error and exits with code 1 without reconnect loops.
     - The existing online agent is completely undisturbed.
   - If the existing host with that name is **`offline`**, the new agent is accepted, automatically replacing and pruning the stale offline record.
4. **Canonical ID Data Invariance**:
   - All internal sessions (`RemoteAgentTerminalSession`), history scrollback buffers, RPC dispatchers (`cmdRpcResolvers`, `rpcResolvers`), and file channels route **strictly and exclusively by `hostId`**.
   - `Name` is purely a lookup alias in `resolveCanonicalHostId(input)`.

---

## 2. Agent-Side Specification (Node.js & Rust)

### 2.1 Host ID & Default Name Generation
- **Host ID**: 12-char hex string (6 random bytes).
  - Node.js (`scripts/terminal-agent.js`):
    ```javascript
    const hostId = options.id || options.hostId || crypto.randomBytes(6).toString('hex');
    ```
  - Rust (`agent-rs/src/config.rs`):
    ```rust
    let host_id = self.id.clone().unwrap_or_else(|| {
        let mut bytes = [0u8; 6];
        getrandom::getrandom(&mut bytes).unwrap_or_default();
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    });
    ```
- **Host Name**:
  - If user provides `--name`, sanitize to `[a-z0-9-_]`.
  - If omitted:
    - Node.js: `${sanitizedHostname}-${crypto.randomBytes(2).toString('hex')}`
    - Rust: `format!("{}-{}", sanitized_hostname, random_4_hex)`

### 2.2 Rejection Handling & Exit
- When Agent receives WebSocket control frame with `type === 'rejected'` or connection closes with code `4009`:
  - Print explicit error to `stderr`:
    ```text
    [Error] Registration rejected by server: Host name 'worker' is already in use by an active node.
    Please choose a different name using --name=<unique-name>.
    ```
  - Set `isExiting = true` and exit process with code 1 (do NOT retry/reconnect).

---

## 3. Server-Side Specification (`TerminalHostManager`)

### 3.1 Registration & Conflict Check (`src/terminal/services/terminalHostManager.ts`)
```typescript
public registerAgent(metadata: {
  hostId: string;
  name?: string;
  hostname?: string;
  ip?: string;
  platform?: string;
  agentWs: any;
}): { success: boolean; host?: ManagedHost; error?: string } {
  const id = metadata.hostId;
  const targetName = metadata.name || id;

  // 1. Check for name conflict against ACTIVE (online) nodes
  for (const [existingId, existingHost] of this.hosts.entries()) {
    if (existingId !== id && existingHost.name === targetName) {
      if (existingHost.status === 'online') {
        logger.warn(`[TerminalHostManager] Rejecting duplicate online host name "${targetName}" from ${id} (already held by ${existingId})`);
        return {
          success: false,
          error: `Conflict: Host name '${targetName}' is already in use by active node '${existingId}'`
        };
      } else {
        // Existing is offline -> auto-prune stale record to allow takeover
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

  // 2. Register / Update host strictly under `id`
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
  }

  let session = this.sessions.get(id);
  if (!session) {
    session = new RemoteAgentTerminalSession(id, metadata.agentWs);
    this.sessions.set(id, session);
  } else {
    session.updateAgentWs(metadata.agentWs);
    this.clearPendingRpcForHost(id);
  }

  return { success: true, host };
}
```

### 3.2 Canonical Host Resolver (`resolveCanonicalHostId`)
```typescript
public resolveCanonicalHostId(input?: string): string | null {
  if (!input || !input.trim()) return null;
  const target = input.trim();

  // 1. Exact ID match
  if (this.hosts.has(target)) return target;

  // 2. Exact Name match (online preferred)
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
    for (const host of this.hosts.values()) {
      if (host.id.startsWith(target)) {
        return host.id;
      }
    }
  }

  return null;
}
```

---

## 4. Testing & Verification Plan

1. **Host ID & Name Generation Tests**:
   - Verify Node.js and Rust agents generate 12-char hex IDs matching `^[0-9a-f]{12}$`.
   - Verify default generated names match `<hostname>-<4hex>`.
2. **Server Registration & Conflict Tests (`tests/terminalHostManagerConflict.test.ts`)**:
   - Register Agent A (`id: a1b2c3d4e5f6`, `name: worker`) -> Returns success.
   - Register Agent B (`id: 112233445566`, `name: worker`) while A is online -> Returns `{ success: false, error: ... }`, Agent A remains online and undisturbed.
   - Disconnect Agent A (becomes offline) -> Register Agent B with `name: worker` -> Returns success, Agent A pruned.
3. **Canonical ID Routing Tests**:
   - Verify `resolveCanonicalHostId` resolves by 12-char ID, short prefix (`a1b2`), and Name.
   - Verify `executeCmdRpc` and `getSession` work seamlessly whether user supplies full ID, short ID, or Name.
4. **Full Regression Suite**:
   - `npm test` across all 117+ suites.
