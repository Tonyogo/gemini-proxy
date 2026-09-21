# Design Doc: Consolidating Terminal Agent into `scripts/gt.js` and Deprecating Legacy Scripts

- **Date:** 2026-09-20
- **Topic:** Consolidating Node.js Terminal Agent and Client into `scripts/gt.js`, Deprecating Legacy Script Files (`terminal-agent.js`, `terminal-exec.js`), and Maintaining Dual-Language Parity with Rust `gt`
- **Status:** Approved

## 1. Overview & Objectives

Previously, the repository had multiple Node.js terminal scripts:
- `scripts/terminal-agent.js` (Reverse WebSocket Agent daemon)
- `scripts/terminal-exec.js` (Standalone remote command runner)
- `scripts/gt.js` (Unified Docker-style CLI)

To eliminate code duplication, maintenance overhead, and file fragmentation:
1. **Single Node.js Entry Point (`scripts/gt.js`)**:
   - Merge all reverse agent daemon logic (WebSocket tunnel, PTY spawning, File RPC handlers, TaskManager execution engine, 12-hex Container ID generation, auto-naming, and online conflict rejection exit) directly into `scripts/gt.js` under the `gt agent` subcommand.
   - Retain all client operations (`gt hosts`, `gt exec`, `gt ps`, `gt logs`, `gt kill`) in `scripts/gt.js`.
2. **Remove Legacy Scripts**:
   - Delete `scripts/terminal-agent.js`.
   - Delete `scripts/terminal-exec.js`.
3. **Streamlined Package Scripts**:
   - `"gt": "node scripts/gt.js"`
   - `"terminal-agent": "node scripts/gt.js agent"` (backward compatibility)
   - `"terminal-exec": "node scripts/gt.js exec"` (backward compatibility)
4. **Dual-Stack Long-Term Maintenance**:
   - Only two canonical implementations will be maintained across the repository:
     - **Node.js**: `scripts/gt.js`
     - **Rust**: `agent-rs/` (compiled to `target/release/gt`)

---

## 2. Architecture of `scripts/gt.js`

```text
                               scripts/gt.js
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        [ Client Subcommands ]                  [ Agent Daemon ]
        - gt hosts                              - gt agent [options]
        - gt exec <host> <cmd>                    ├─ 12-Hex Container ID
        - gt ps <host>                            ├─ Auto-Naming (<host>-<4hex>)
        - gt logs <host> <taskId>                 ├─ PTY Shell Manager
        - gt kill <host> <taskId>                 ├─ File RPC Subsystem
                                                  ├─ TaskManager Exec Engine
                                                  └─ 4009 Conflict Exit
```

### 2.1 Agent Daemon Integration in `scripts/gt.js`
When invoked as `gt agent [options]` or `node scripts/gt.js agent [options]`:
- Parses options: `--server`, `--key`, `--name`, `--id`, `--shell`.
- Generates 12-char lowercase hex `hostId` (via `crypto.randomBytes(6).toString('hex')`) if not specified.
- Generates `<sanitized-hostname>-<4hex>` if `--name` is omitted.
- Spawns PTY with `node-pty`, strips TMUX environment variables.
- Connects to `/api/terminal/agent-ws`, manages keepalive ping/pong.
- Dispatches `file_rpc` to `handleFileRpc()` and `cmd_exec` to `TaskManager`.
- If server rejects with `type: 'rejected'` or code `4009`, prints red error and terminates process with code 1 immediately without reconnect loops.

### 2.2 Exported Helper Functions for Unit Testing
Exports for test suites in `tests/`:
```javascript
module.exports = {
  formatRelativeTime,
  makeRequest,
  parseControlMessage,
  resolveWebSocketUrl,
  TaskManager,
  handleFileRpc,
  handleCmdExec,
  runAgent,
};
```

---

## 3. Migration & Cleanup Plan

1. **Delete Files**:
   - `scripts/terminal-agent.js`
   - `scripts/terminal-exec.js` (if exists)
2. **Update Tests**:
   - Update imports in `tests/terminalAgent*.test.ts`, `tests/terminalTaskManager.test.ts`, `tests/terminalAgentCommandExec.test.ts`, and `tests/terminalExecCli.test.ts` to require `../scripts/gt.js`.
3. **Update `package.json`**:
   - Ensure `"terminal-agent": "node scripts/gt.js agent"`
   - Ensure `"terminal-exec": "node scripts/gt.js exec"`
4. **Update Documentation (`CLAUDE.md`)**:
   - Document `gt` and `gt agent` as the primary references.

---

## 4. Testing & Verification

1. **Test Suite Verification**:
   - Run `npm test` across all 117+ test suites to ensure 0 import or behavioral failures.
2. **Production Build**:
   - Run `npm run build` to verify clean frontend and backend asset creation.
3. **CLI & Agent Verification**:
   - Verify `npm run gt -- --help`.
   - Verify `npm run terminal-agent -- --help` / startup.
   - Verify `npm run terminal-exec -- --help`.
