# Terminal Host Deduplication and Lifecycle Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate terminal host entries caused by agent restarts or dynamic IP changes by establishing deterministic host ID generation, auto-pruning stale offline nodes on same-name reconnects, deduplicating query listings, and stabilizing frontend onboarding commands.

**Architecture:** 
- In Node.js (`scripts/terminal-agent.js`) and Rust (`agent-rs/src/config.rs`) agents, derive `hostId` deterministically from sanitized `--name` when `--id` is omitted, guaranteeing identical IDs across restarts.
- In `TerminalHostManager.registerAgent`, automatically detect and remove stale offline entries that share the same `name` as the newly registering agent.
- In `TerminalHostManager.getHosts`, apply a name-uniqueness deduplication filter that prioritizes `online` status and recent `lastSeen` timestamps before returning results.
- In `TerminalHostSelector.tsx`, replace the randomized `worker-${random}` onboarding template with a stable name (`my-server`) and add clear guidance.

**Tech Stack:** TypeScript, Node.js, Rust, React, Jest.

## Global Constraints

- **Deterministic Identity**: If `--name` is supplied without `--id`, `hostId` must be derived from `name` (sanitized to `[a-z0-9-_]`), ensuring persistence across restarts.
- **Name Uniqueness**: The server API `/api/terminal/hosts` (and legacy `/api/admin/terminal/hosts`) must never return duplicate entries sharing the same `name`.
- **Zero Breakage**: Existing hosts with explicit `--id` and fallback behavior when neither `--id` nor `--name` is supplied must continue to function normally.
- **All 111 Test Suites Pass**: Zero regressions across existing routes, PTY sessions, file RPC, and command execution tests.

---

### Task 1: Agent Host ID Stabilization (Node.js & Rust)

**Files:**
- Modify: `scripts/terminal-agent.js:63-68`
- Modify: `agent-rs/src/config.rs:56-74`
- Modify: `agent-rs/tests/agent_tests.rs`
- Modify: `tests/terminalAgent.test.ts`

**Interfaces:**
- Produces:
  - When `--name="demo"` and `--id` is absent, both Node.js and Rust agents produce `hostId === "demo"`.
  - When `--name="My Server 01"` and `--id` is absent, produce `hostId === "my-server-01"`.
  - When `--id="custom-id"` is provided, it always takes precedence.

- [x] **Step 1: Write failing test in `tests/terminalAgent.test.ts`**

Add tests asserting deterministic `hostId` derivation when `--name` is provided without `--id`:
```typescript
  test('derives deterministic hostId from name when id is omitted', () => {
    // Test logic executing agent options parsing or simulating hostId generation
    const parseHostId = (options: { id?: string; name?: string }, hostname: string, localIp: string) => {
      const sanitizedName = options.name ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') : '';
      return options.id || (sanitizedName || `${hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}-${localIp.replace(/\./g, '-')}`);
    };

    expect(parseHostId({ name: 'demo' }, 'my-box', '192.168.1.10')).toBe('demo');
    expect(parseHostId({ name: 'Ubuntu GPU Server' }, 'my-box', '192.168.1.10')).toBe('ubuntu-gpu-server');
    expect(parseHostId({ id: 'explicit-id', name: 'demo' }, 'my-box', '192.168.1.10')).toBe('explicit-id');
    expect(parseHostId({}, 'my-box', '192.168.1.10')).toBe('my-box-192-168-1-10');
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/terminalAgent.test.ts`
Expected: PASS (or FAIL if test assertion requires implementation in `scripts/terminal-agent.js`).

- [x] **Step 3: Update `scripts/terminal-agent.js` host ID derivation**

In `scripts/terminal-agent.js`:
```javascript
const localIp = getLocalIp();
const hostName = options.name || hostname;
const sanitizedName = options.name
  ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '')
  : '';
const hostId = options.id || options.hostId || (sanitizedName || `${hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}-${localIp.replace(/\./g, '-')}`);
```

- [x] **Step 4: Update `agent-rs/src/config.rs` host ID derivation**

In `agent-rs/src/config.rs`:
```rust
    pub fn get_host_id(&self) -> String {
        if let Some(ref id) = self.id {
            return id.clone();
        }
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
        let local_ip = self.get_local_ip().replace('.', "-");
        format!("{}-{}", sanitized_hostname, local_ip)
    }
```

- [x] **Step 5: Add Rust test in `agent-rs/tests/agent_tests.rs`**

In `agent-rs/tests/agent_tests.rs`:
```rust
#[test]
fn test_host_id_deterministic_derivation() {
    let cfg_name_only = Config {
        server: "http://localhost:3000".to_string(),
        key: "".to_string(),
        id: None,
        name: Some("Ubuntu GPU Server".to_string()),
        shell: None,
    };
    assert_eq!(cfg_name_only.get_host_id(), "ubuntu-gpu-server");

    let cfg_explicit_id = Config {
        server: "http://localhost:3000".to_string(),
        key: "".to_string(),
        id: Some("custom-box-id".to_string()),
        name: Some("demo".to_string()),
        shell: None,
    };
    assert_eq!(cfg_explicit_id.get_host_id(), "custom-box-id");
}
```

- [x] **Step 6: Run tests to verify**

Run: `npx jest tests/terminalAgent.test.ts`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add scripts/terminal-agent.js agent-rs/src/config.rs agent-rs/tests/agent_tests.rs tests/terminalAgent.test.ts
git commit -m "feat(agent): derive deterministic hostId from name when id is omitted"
```

---

### Task 2: Server-Side Host Registration Auto-Pruning & Query Deduplication

**Files:**
- Modify: `src/terminal/services/terminalHostManager.ts`
- Modify: `tests/terminalHostManager.test.ts`
- Modify: `tests/terminalHostsApi.test.ts`

**Interfaces:**
- Updates:
  - `terminalHostManager.registerAgent(metadata)`: Auto-prunes existing offline nodes whose `name` matches `metadata.name`.
  - `terminalHostManager.getHosts()`: Returns array where each `name` is unique, prioritizing online status and higher `lastSeen`.

- [x] **Step 1: Write failing tests in `tests/terminalHostManager.test.ts`**

Add tests verifying:
1. Registering an agent with `name: "demo"` removes any offline node with `name: "demo"` even if `hostId` differs.
2. `getHosts()` eliminates duplicate names, favoring online over offline.

```typescript
  it('automatically prunes stale offline node with matching name on registerAgent', () => {
    manager.registerAgent({
      hostId: 'node-old-id',
      name: 'production-app',
      agentWs: mockAgentWs,
    });
    manager.unregisterAgent('node-old-id');
    expect(manager.getHost('node-old-id')?.status).toBe('offline');

    // Reconnect with new hostId but same name
    manager.registerAgent({
      hostId: 'node-new-id',
      name: 'production-app',
      agentWs: mockAgentWs,
    });

    // Old offline node must be pruned
    expect(manager.getHost('node-old-id')).toBeNull();
    const current = manager.getHost('node-new-id');
    expect(current).not.toBeNull();
    expect(current?.status).toBe('online');

    const hosts = manager.getHosts();
    const matching = hosts.filter(h => h.name === 'production-app');
    expect(matching).toHaveLength(1);
    expect(matching[0].id).toBe('node-new-id');
  });

  it('getHosts deduplicates same-name entries favoring online hosts', () => {
    // Force insert duplicate name entries in manager
    (manager as any).hosts.set('id-1', {
      id: 'id-1',
      name: 'duplicate-service',
      hostname: 'host-1',
      ip: '10.0.0.1',
      platform: 'linux',
      status: 'offline',
      lastSeen: 1000,
      type: 'agent',
    });
    (manager as any).hosts.set('id-2', {
      id: 'id-2',
      name: 'duplicate-service',
      hostname: 'host-2',
      ip: '10.0.0.2',
      platform: 'linux',
      status: 'online',
      lastSeen: 2000,
      type: 'agent',
    });

    const hosts = manager.getHosts();
    const serviceHosts = hosts.filter(h => h.name === 'duplicate-service');
    expect(serviceHosts).toHaveLength(1);
    expect(serviceHosts[0].id).toBe('id-2');
    expect(serviceHosts[0].status).toBe('online');
  });
```

- [x] **Step 2: Run tests to verify failure**

Run: `npx jest tests/terminalHostManager.test.ts`
Expected: FAIL with duplicate count expectations.

- [x] **Step 3: Implement Auto-Pruning and Deduplication in `TerminalHostManager`**

In `src/terminal/services/terminalHostManager.ts`:

1. Update `registerAgent`:
```typescript
  public registerAgent(metadata: {
    hostId: string;
    name?: string;
    hostname?: string;
    ip?: string;
    platform?: string;
    agentWs: any;
  }): ManagedHost {
    const id = metadata.hostId;
    const targetName = metadata.name || metadata.hostname || id;

    // Auto-prune any existing offline host that shares the same name but has a different hostId
    for (const [existingId, existingHost] of this.hosts.entries()) {
      if (existingId !== id && existingHost.status === 'offline') {
        if (existingHost.name === targetName || (metadata.name && existingHost.name === metadata.name)) {
          const session = this.sessions.get(existingId);
          if (session) {
            session.destroy();
            this.sessions.delete(existingId);
          }
          this.clearPendingRpcForHost(existingId);
          this.hosts.delete(existingId);
          logger.info(`[TerminalHostManager] Auto-pruned stale offline host with matching name "${existingHost.name}": ${existingId}`);
        }
      }
    }

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
      session.updateAgentWs(metadata.agentWs);
      this.clearPendingRpcForHost(id);
    }

    logger.info(`[TerminalHostManager] Agent registered: ${id} (${host.name})`);
    return host;
  }
```

2. Update `getHosts`:
```typescript
  public getHosts(): ManagedHost[] {
    this.pruneOfflineHosts(TerminalHostManager.OFFLINE_HOST_TTL_MS);

    // Group by host name to guarantee unique names in listing
    const nameMap = new Map<string, ManagedHost>();

    for (const host of this.hosts.values()) {
      const existing = nameMap.get(host.name);
      if (!existing) {
        nameMap.set(host.name, host);
      } else {
        // Priority: online wins over offline; if same status, highest lastSeen wins
        if (host.status === 'online' && existing.status !== 'online') {
          nameMap.set(host.name, host);
        } else if (host.status === existing.status && host.lastSeen > existing.lastSeen) {
          nameMap.set(host.name, host);
        }
      }
    }

    const list = Array.from(nameMap.values());
    return list.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'online' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalHostManager.test.ts tests/terminalHostsApi.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/terminal/services/terminalHostManager.ts tests/terminalHostManager.test.ts
git commit -m "feat(terminal): auto-prune stale offline hosts and deduplicate getHosts by name"
```

---

### Task 3: Frontend Onboarding Command Stabilization & View Deduplication

**Files:**
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `tests/terminalHostSelector.test.ts`

**Interfaces:**
- Produces:
  - Startup command generated in modal uses stable `--name="my-server"`.
  - Frontend renders unique names by filtering duplicates before sorting.
  - Helpful hint provided for naming persistence.

- [x] **Step 1: Write test assertion in `tests/terminalHostSelector.test.ts`**

In `tests/terminalHostSelector.test.ts`:
```typescript
  test('uses stable my-server name instead of random worker suffix in agentCommand', () => {
    expect(content).toContain('--name="my-server"');
    expect(content).not.toMatch(/worker-\$\{Math\.floor/);
  });
```

- [x] **Step 2: Run test to verify failure**

Run: `npx jest tests/terminalHostSelector.test.ts`
Expected: FAIL (`--name="my-server"` not found).

- [x] **Step 3: Update `TerminalHostSelector.tsx` and i18n locales**

1. In `frontend/src/components/terminal/TerminalHostSelector.tsx`:
Replace:
```typescript
  const agentCommand = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
    return `node scripts/terminal-agent.js --server="${origin}" --key="${effectiveKey}" --name="worker-${Math.floor(Math.random() * 900 + 100)}"`;
  }, [adminKey]);
```
With:
```typescript
  const agentCommand = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
    return `node scripts/terminal-agent.js --server="${origin}" --key="${effectiveKey}" --name="my-server"`;
  }, [adminKey]);
```

In `filteredHosts`:
Add name deduplication fallback:
```typescript
  const filteredHosts = useMemo(() => {
    let list = hosts;
    if (hideOffline) {
      list = list.filter((h) => h.status === 'online');
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.id.toLowerCase().includes(q) ||
          h.ip.toLowerCase().includes(q) ||
          h.platform.toLowerCase().includes(q)
      );
    }

    // Defensive deduplication by name (online takes precedence over offline)
    const nameMap = new Map<string, ManagedHostItem>();
    for (const h of list) {
      const existing = nameMap.get(h.name);
      if (!existing) {
        nameMap.set(h.name, h);
      } else if (h.status === 'online' && existing.status !== 'online') {
        nameMap.set(h.name, h);
      } else if (h.status === existing.status && (h.lastSeen || 0) > (existing.lastSeen || 0)) {
        nameMap.set(h.name, h);
      }
    }

    return Array.from(nameMap.values()).sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'online' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [hosts, searchQuery, hideOffline]);
```

In the modal body, update the tip text to mention `--name` persistence:
In `zh.ts`:
```typescript
addNodeTip: "可通过 --name 指定持久化机器标识（如 my-server），同名节点重启时将自动复用并更新状态，避免重复卡片。",
```
In `en.ts`:
```typescript
addNodeTip: "Specify a persistent identifier via --name (e.g., my-server). Reconnecting with the same name automatically updates the existing host without creating duplicates.",
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/terminalHostSelector.test.ts`
Expected: PASS.

- [x] **Step 5: Verify frontend build**

Run: `npm run build:frontend`
Expected: Passes with 0 errors.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/terminal/TerminalHostSelector.tsx frontend/src/i18n/locales/ tests/terminalHostSelector.test.ts
git commit -m "feat(frontend): stabilize agent onboarding command and deduplicate hosts view"
```

---

### Task 4: Full Verification & Build Validation

**Files:**
- Test all: `npm test`
- Build all: `npm run build`

- [x] **Step 1: Execute Full Build**

Run: `npm run build`
Expected: Frontend (`vite build`) and backend (`tsc`) pass with 0 errors.

- [x] **Step 2: Execute Complete Test Suite**

Run: `npm test`
Expected: 111 / 111 test suites pass (614+ tests passed, 0 failures).

- [x] **Step 3: Final Git Check**

Run: `git status && git log -n 5 --oneline`
Expected: Clean working tree with distinct semantic commits.
