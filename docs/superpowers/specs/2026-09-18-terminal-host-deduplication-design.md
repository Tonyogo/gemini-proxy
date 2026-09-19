# Design Doc: Terminal Host Deduplication and Name Lifecycle Stabilization

- **Date:** 2026-09-18
- **Topic:** Eliminate Duplicate Terminal Hosts on Agent Restart and Reconnection
- **Status:** Approved

## 1. Overview & Objectives

Currently, when a Terminal Agent restarts or reconnects, the WebTerminal host list can display duplicate entries with identical names (e.g., two entries named `demo`, or lingering offline nodes alongside newly connected nodes).

### Root Causes Identified:
1. **Dynamic / Unstable Host ID Generation**:
   When `--id` is omitted and only `--name` is supplied, both the Node.js agent (`scripts/terminal-agent.js`) and Rust agent (`agent-rs/src/config.rs`) fallback to `${hostname}-${localIp}`. If IP addresses fluctuate or container networks reassign IPs on restart, a new `hostId` is generated, causing the hub to register it as a distinct machine while leaving the old one as an offline ghost.
2. **Missing Same-Name Offline Cleanup on Registration**:
   `TerminalHostManager.registerAgent` currently keys strictly on `hostId`. If an agent restarts with a new ID but the same friendly name (`name`), the old offline node remains in the registry until the 24-hour TTL expiration.
3. **Random Name Generation in Frontend Startup Modal**:
   `TerminalHostSelector.tsx` generated random names (`worker-${random}`) on every modal open, encouraging fragmentation.
4. **No Name-Based Deduplication Safeguard on Listing**:
   `getHosts()` returns all entries without name uniqueness deduplication, allowing offline and online nodes with identical names to be displayed simultaneously.

### Core Goals:
1. **Deterministic Host ID Derivation**: When `--name` is provided without `--id`, derive `hostId` deterministically from `name`, ensuring identical IDs across restarts.
2. **Auto-Prune Stale Offline Nodes on Same-Name Reconnection**: When an agent connects, automatically remove any existing offline entries with the same `name`.
3. **Name-Unique Query Guarantee**: Ensure `getHosts()` produces a strictly name-deduplicated list prioritizing online and most recently active instances.
4. **Stable Onboarding Guidance**: Replace random template names in `TerminalHostSelector` with stable defaults.

---

## 2. Architecture & Detailed Specifications

### 2.1 Agent-Side Deterministic Host ID Derivation

Both agent implementations will follow a strict three-tier priority:
1. Explicit `--id` flag: Used directly if supplied.
2. Explicit `--name` flag: If `--id` is omitted, derive `hostId` by sanitizing `name` (lowercase, letters/digits/hyphens/underscores).
3. Fallback: If neither is provided, fallback to `${sanitizedHostname}-${localIp}`.

#### Implementation in `scripts/terminal-agent.js`:
```javascript
const hostName = options.name || hostname;
const sanitizedName = options.name ? options.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') : '';
const hostId = options.id || options.hostId || (sanitizedName || `${hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}-${localIp.replace(/\./g, '-')}`);
```

#### Implementation in `agent-rs/src/config.rs`:
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

---

### 2.2 Server-Side Same-Name Lifecycle Auto-Pruning (`terminalHostManager.ts`)

#### 1. On `registerAgent`:
Before registering or restoring the new node, scan `this.hosts` for existing entries where:
- `host.name === metadata.name` (or matched `metadata.hostname`)
- `host.id !== metadata.hostId`
- `host.status === 'offline'`

For each matching stale offline host:
- Destroy its associated session (`session.destroy()`).
- Clear pending RPC resolvers.
- Delete the host from `this.hosts`.
- Log: `[TerminalHostManager] Auto-pruned stale offline host with matching name "${host.name}": ${host.id}`.

#### 2. On `getHosts()`:
Group all active hosts by `name`:
- If an online and offline host share the same name: **drop the offline host**.
- If multiple hosts share the same status: **retain only the host with the largest `lastSeen` timestamp**.
- Sort the resulting deduplicated list with online hosts first, then alphabetically by `name`.

---

### 2.3 Frontend Guidance & View Stabilization (`TerminalHostSelector.tsx`)

1. **Remove Random Suffix**:
   Change `--name="worker-${random}"` to `--name="my-server"`.
2. **Add Informative Tip**:
   Add clear helper text explaining that specifying `--name` gives the node a persistent identity that automatically reconnects and updates upon restart.
3. **Frontend View Deduplication**:
   Add a defensive filter on `hosts` rendering to ensure no duplicate names render even during short polling transitions.

---

## 3. Verification & Test Plan

1. **Unit Tests (`tests/terminalHostManager.test.ts` & `tests/terminalHostsApi.test.ts`)**:
   - Verify that registering an agent with `name: "node-a"` automatically purges any pre-existing offline node named `"node-a"`.
   - Verify `getHosts()` returns a name-unique array even if duplicate names exist with different IDs in memory.
   - Verify `online` status takes precedence over `offline` for same-name candidates.
2. **Agent Verification**:
   - Verify Node.js agent assigns `hostId === "demo"` when launched with `--name="demo"`.
   - Verify Rust agent assigns `hostId === "demo"` when launched with `--name="demo"`.
3. **Full Build & Regression Check**:
   - `npm run build`: Frontend and backend compile cleanly with 0 errors.
   - `npm test`: All 111 test suites pass with 0 regressions.
