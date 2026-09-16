# Terminal Agent Keep-Alive & Self-Healing Reconnection Design

## 1. Overview & Problem Statement

### 1.1 Problem Statement
When running the `terminal-agent` via PM2 or background CLI, if the remote Gemini Proxy Hub restarts or experiences transient network partitions while the terminal is idle, the local TCP connection becomes a **half-open zombie socket**.
- The local operating system continues reporting `ESTABLISHED` (e.g. visible in `lsof` and `netstat`).
- Neither `close` nor `error` events are emitted by Node.js WebSocket client because no outbound packets are being transmitted to elicit an `RST` or `ACK`.
- The Node.js event loop remains idle (CPU 0%, memory stable), so PM2 reports the process as `online`.
- However, the server has wiped its in-memory agent registry upon restart. The agent never notices the death of the connection, resulting in a persistent offline state on the server.

### 1.2 Objective
Implement a robust 3-layer keep-alive and self-healing reconnection mechanism for `scripts/terminal-agent.js` and `src/admin/routes/terminalWs.ts`, ensuring:
1. Dead connections are detected within 13 seconds (10s interval + 3s timeout).
2. Half-open sockets are forcefully terminated with `ws.terminate()`.
3. Persistent PTY processes and active user sessions survive reconnections without data loss or terminal interruption.
4. Reconnection utilizes exponential backoff with jitter and auto-reconnects as soon as the hub is back online.
5. Control frames (Ping/Pong/RPC) are strictly isolated and never leak into shell STDIN or terminal screens.

---

## 2. Architecture & Layered Defense

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: Transport Keep-Alive            │
│  - Enable TCP SO_KEEPALIVE on created sockets               │
│  - Set handshake timeout (HANDSHAKE_TIMEOUT_MS = 4000)      │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 2: Application Heartbeat            │
│  - Agent sends `JSON:{"type":"ping"}` every 10s             │
│  - Hub responds with `JSON:{"type":"pong"}`                 │
│  - Any incoming data/pong refreshes heartbeat activity      │
│  - If no data/pong received within 3s -> Heartbeat Timeout  │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 3: Forceful Self-Healing            │
│  - Immediately call `ws.terminate()` on timeout             │
│  - Preserve existing `ptyProcess` (never kill user shell)   │
│  - Schedule exponential backoff reconnect (1.5s -> 30s cap) │
│  - On reconnect: register and sync PTY window size          │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Specifications

### 3.1 Agent Heartbeat & Keep-Alive (`scripts/terminal-agent.js`)

#### Parameters
- `HEARTBEAT_INTERVAL_MS = 10000` (10s)
- `HEARTBEAT_TIMEOUT_MS = 3000` (3s)
- `HANDSHAKE_TIMEOUT_MS = 4000` (4s)

#### Lifecycle Flow
1. **Connection Initiation (`connect`)**:
   - Start `connectTimeoutTimer` (4s).
   - Instantiate `new WebSocket(targetWsUrl, { headers: { 'x-admin-key': adminKey }, perMessageDeflate: false })`.
   - On socket creation, set `socket.setKeepAlive(true, 10000)`.
2. **On Open (`open`)**:
   - Clear `connectTimeoutTimer`.
   - Reset `reconnectAttempts = 0`.
   - Start proactive heartbeat via `startHeartbeat()`.
   - If first run, spawn PTY and send `reset`. If reconnecting existing PTY, send `resize` without `reset`.
3. **Heartbeat Loop (`startHeartbeat`)**:
   - `setInterval` every 10s.
   - Send `JSON:{"type":"ping"}`.
   - Start `heartbeatTimeoutTimer` for 3s.
   - If timer expires before any incoming message or pong:
     - Log: `[Agent] Heartbeat timeout (3s). Terminating dead connection...`
     - Call `ws.terminate()`.
4. **On Message (`message`)**:
   - Reset and clear `heartbeatTimeoutTimer`.
   - Parse control frame using `parseControlMessage(msgStr)`.
   - If `control.type === 'pong'`, consume silently without passing to PTY.
   - If `control.type === 'ping'`, reply with `JSON:{"type":"pong"}`.
5. **On Close & Error (`close`, `error`)**:
   - Clear all heartbeat and connection timers.
   - Log warning.
   - Call `scheduleReconnect()` with exponential backoff: `Math.min(30000, 1000 * Math.pow(1.5, Math.min(reconnectAttempts, 8)))`.

### 3.2 Hub Protocol Fix (`src/admin/routes/terminalWs.ts`)
- In `agentWss.on('connection')`:
  - When receiving `control.type === 'ping'`, respond with formatted prefix:
    ```typescript
    if (control.type === 'ping') {
      ws.send(`JSON:${JSON.stringify({ type: 'pong' })}`);
      return;
    }
    ```
  - Ensure compatibility with legacy bare `{"type":"pong"}` and `JSON:{"type":"pong"}`.

### 3.3 Control Frame Parsing Security
To prevent JSON protocol messages from ever echoing into the interactive shell or triggering terminal garbage output:
```javascript
function parseControlMessage(msgStr) {
  if (typeof msgStr !== 'string') return null;
  const trimmed = msgStr.trim();
  if (trimmed.startsWith('JSON:')) {
    try {
      return JSON.parse(trimmed.slice(5));
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === 'string') {
        return parsed;
      }
    } catch {}
  }
  return null;
}
```

---

## 4. Verification & Testing Strategy

1. **Unit & Protocol Testing (`tests/terminalAgentKeepalive.test.ts`)**:
   - Test Ping/Pong frame exchange.
   - Test heartbeat timeout triggers `ws.terminate()` and initiates reconnection.
   - Test PTY process preservation across multiple reconnect cycles.
   - Test control frame parsing and prevention of leaks into PTY.
2. **Regression Testing**:
   - Run complete suite with `npx jest --runInBand`.
   - Verify frontend build with `npm run build:frontend`.
3. **Live Process Verification**:
   - Run updated agent script against test hub.
   - Simulate sudden hub kill (`socket.destroy()`) and verify agent automatically re-registers and goes `online` within 13 seconds.
