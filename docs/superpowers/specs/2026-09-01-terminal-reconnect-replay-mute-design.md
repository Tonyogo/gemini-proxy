# Terminal Reconnect Replay Mute Design

## Problem Statement

When the Web Terminal client reconnects or attaches to an active persistent session (`PersistentTerminalSession`), the backend replays the accumulated session history (`historyBuffer.join('')`) to the client so that the terminal screen is accurately restored.

However, during previous session activity (such as starting `zsh`, `vim`, or full-screen TUIs), the PTY emitted terminal query sequences:
- CPR (Cursor Position Report): `\x1b[6n`
- DA2 (Secondary Device Attributes): `\x1b[>c`
- OSC 10 / OSC 11 (Foreground & Background Color Query): `\x1b]10;?\x1b\`, `\x1b]11;?\x1b\`
- DECRQM (DEC Request Mode): `\x1b[?12$p`, `\x1b[?2004$p`

These query escape sequences were saved into the backend's `historyBuffer`. Upon reconnection, when `xterm.js` parses the replayed history stream via `xterm.write()`, it interprets these historical query sequences as live requests from the host and automatically dispatches report strings via `term.onData()`:
- `\x1b[<row>;<col>R` (CPR response)
- `\x1b[>0;276;0c` (DA2 response)
- `\x1b]10;rgb:f1f1/f5f5/f9f9\x1b\` (OSC 10 response)
- `\x1b]11;rgb:0909/0a0a/0f0f\x1b\` (OSC 11 response)
- `\x1b[12;2$y` (DECRPM response)

Because `term.onData()` immediately forwards these responses over the WebSocket to the PTY, and the backend shell is currently idle at a command prompt (not waiting for device reports), the shell treats them as raw keyboard input, resulting in garbled text being echoed into the prompt:
```text
2RR0;276;0c10;rgb:f1f1/f5f5/f9f911;rgb:0909/0a0a/0f0f12;2$y
```

---

## Architecture & Design (Approach A: Replay Mute & Settle)

### 1. Replay Lifecycle Tracking (`isReplayingRef`)

In `frontend/src/components/WebTerminalView.tsx`:
1. When a new WebSocket is initialized or opened (`ws.onopen`), mark `isReplayingRef.current = true`.
2. When the first history message(s) are received via `ws.onmessage`, feed them to `xterm.write(data, callback)`.
3. In the `xterm.write` completion callback, schedule a short debounce timer (~60ms) to mark `isReplayingRef.current = false`.

### 2. Synthetic Device Report Suppression in `term.onData`

During the replay window (`isReplayingRef.current === true`):
- If `data` received by `term.onData` matches automated terminal report signatures:
  - CPR: `^\x1b\[\d+(?:;\d+)*R$`
  - DA / DA2: `^\x1b\[[>?]\d+(?:;\d+)*c$`
  - OSC 10 / 11 color report: `^\x1b\](?:10|11);rgb:[0-9a-fA-F/]+(?:\x1b\\|\x07)$`
  - DECRPM: `^\x1b\[\??\d+;\d+\$y$`
- Suppress the packet (do not send via `wsRef.current.send(data)`).
- If the data is standard user typing (e.g. printable character or standard user control key during manual interaction), allow it to pass or process after the 60ms initial settle.

### 3. Normal Live Operation

Once `isReplayingRef.current` becomes `false`:
- All subsequent real-time queries issued by active applications (such as Vim opening in real time) are responded to normally and forwarded 100% transparently to the PTY.

---

## Verification & Testing Plan

1. **Simulated Session with Terminal Queries**:
   - Spawn a session that writes CPR (`\x1b[6n`), DA (`\x1b[>c`), OSC 10 (`\x1b]10;?\x1b\`), OSC 11 (`\x1b]11;?\x1b\`), and DECRQM (`\x1b[?12$p`) into `historyBuffer`.
2. **Replay & Attach Test**:
   - Connect WebSocket client.
   - Verify that upon receiving history replay, no synthetic escape response strings (`2RR0;276;0c...`) are sent back to the PTY.
   - Verify that the shell prompt remains 100% clean without garbled characters.
3. **Live Query Verification**:
   - Verify that after the initial replay window, live queries (e.g. launching Vim, querying cursor) continue to work seamlessly.
4. **Full Test Suite & Build**:
   - Run `npm test` and `npm run build`.
