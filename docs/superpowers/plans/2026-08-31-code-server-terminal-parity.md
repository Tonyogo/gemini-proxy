# Code-Server PTY Environment & Protocol Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure vim and interactive TUI applications operate flawlessly by injecting UTF-8 locale variables into PTY spawn options and decoupling JSON control commands from raw input streams with `"JSON:"` prefixing.

**Architecture:** Inject `LANG: 'en_US.UTF-8'` and `LC_ALL: 'en_US.UTF-8'` in `terminalService.ts`. Update `terminalWs.ts` and `WebTerminalView.tsx` to prefix control frames with `"JSON:"` so raw keystrokes (like typing `{}` in vim) are never intercepted by control parsers.

**Tech Stack:** Node.js, `node-pty`, `ws`, React 18, `@xterm/xterm`, TypeScript.

## Global Constraints

- **UTF-8 Environment**: PTY processes must be spawned with `LANG` and `LC_ALL` locale environment variables.
- **Unambiguous Protocol**: Control frames prefixed with `"JSON:"`.
- **Strict TypeScript & Zero Build Errors**: `npm run build:backend` and `npm run build:frontend` must pass cleanly.

---

### Task 1: Update PTY Environment Variables in terminalService.ts

**Files:**
- Modify: `src/admin/services/terminalService.ts`

**Interfaces:**
- Produces: UTF-8 compliant shell environments for `node-pty`.

- [ ] **Step 1: Update `spawnTerminalSession` in `src/admin/services/terminalService.ts`**

In `src/admin/services/terminalService.ts`:
```typescript
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'en_US.UTF-8',
    LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
    TERM_PROGRAM: 'gemini-proxy-terminal',
    ...options.env,
  } as { [key: string]: string };
```

- [ ] **Step 2: Run backend tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/admin/services/terminalService.ts
git commit -m "fix(terminal): inject UTF-8 locale environment variables into PTY process"
```

---

### Task 2: Decouple WebSocket Control Frames & Update Tests

**Files:**
- Modify: `src/admin/routes/terminalWs.ts`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `tests/terminalWs.test.ts`

**Interfaces:**
- Produces: Unambiguous control message parsing via `"JSON:"` prefix.

- [ ] **Step 1: Update `src/admin/routes/terminalWs.ts`**

In `src/admin/routes/terminalWs.ts`:
```typescript
    ws.on('message', (message: RawData) => {
      try {
        const msgStr = message.toString();
        if (msgStr.startsWith('JSON:')) {
          const control = JSON.parse(msgStr.slice(5));
          if (
            control.type === 'resize' &&
            typeof control.cols === 'number' &&
            !Number.isNaN(control.cols) &&
            typeof control.rows === 'number' &&
            !Number.isNaN(control.rows)
          ) {
            const cols = Math.max(10, Math.min(500, Math.floor(control.cols)));
            const rows = Math.max(5, Math.min(200, Math.floor(control.rows)));
            session.resize(cols, rows);
            return;
          }
          if (control.type === 'reset') {
            logger.info(`[TerminalWS] Reset session requested by client`);
            session.reset();
            return;
          }
          if (control.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
        }

        session.write(msgStr);
      } catch {
        session.write(message.toString());
      }
    });
```

- [ ] **Step 2: Update `WebTerminalView.tsx` control frame dispatches**

In `frontend/src/components/WebTerminalView.tsx`:
1. In `sendResize`:
```typescript
  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
    }
  }, []);
```
2. In `handleResetSession`:
```typescript
wsRef.current.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
```

- [ ] **Step 3: Update `tests/terminalWs.test.ts`**

In `tests/terminalWs.test.ts`:
Update test control frame payload to `JSON:{"type":"resize","cols":100,"rows":30}`.

- [ ] **Step 4: Verify test suite and build**

Run: `npm test && npm run build`
Expected: PASS with zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/admin/routes/terminalWs.ts frontend/src/components/WebTerminalView.tsx tests/terminalWs.test.ts
git commit -m "fix(terminal): isolate JSON control frames with JSON prefix to avoid vim input conflicts"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- All components and builds.

- [ ] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: 25 test suites pass.

- [ ] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero build errors.
