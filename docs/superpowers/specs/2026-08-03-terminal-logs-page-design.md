# Design Spec: Terminal Logs Web Viewer

## Overview
This specification details the design for displaying live server terminal/console logs on the Admin Web Console. It enables real-time stream monitoring of application logs with fixed-capacity history buffer (100 entries) and rich terminal-style controls.

---

## Architectural Changes

### 1. Backend Service & SSE Engine (`src/admin/services/terminalLogService.ts`)

#### Ring Buffer & Log Broadcaster
- Maintains an in-memory fixed array `logsBuffer` capped at `100` items (FIFO eviction).
- Log Entry Schema:
  ```typescript
  export interface TerminalLogEntry {
    id: number;
    timestamp: string;
    level: 'error' | 'warn' | 'info' | 'debug';
    message: string;
  }
  ```
- Subscribes to backend log emissions via EventEmitter.
- Exposes `addLog(level, message)` method called by `src/utils/logger.ts`.

#### Logger Hook Integration (`src/utils/logger.ts`)
- Calls `terminalLogService.addLog(level, messageFormatted)` on every `log()` invocation.

#### API Routes & Controller (`src/admin/routes/adminRoutes.ts` & `adminController.ts`)
- Endpoint: `GET /api/admin/terminal-logs`
  - Normal JSON mode: Returns `{ logs: terminalLogService.getHistory() }` (up to 100 entries).
  - Streaming SSE mode (`?stream=true` or `Accept: text/event-stream`):
    - Sets headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
    - Sends initial history array event.
    - Flushes new log entries via `res.write('data: ' + JSON.stringify(entry) + '\n\n')`.
    - Automatically cleans up listener when client disconnects (`req.on('close')`).

---

### 2. Frontend Terminal View Component (`frontend/src/components/TerminalLogsView.tsx`)

#### Navigation (`frontend/src/App.tsx`)
- Adds `'terminal'` to active tabs: `Dashboard | Logs | Terminal Logs | Playground`.

#### UI & Interactivity Features
- Dark monospace terminal interface (`bg-slate-900`, `font-mono`).
- Real-time SSE listener via standard `EventSource` (handling `x-admin-key` via initial query parameter or fallback fetch).
- Features:
  - **Connection Badge**: Live indicator (Green when SSE connected, Red on disconnect/reconnect).
  - **Level Filter**: Filter entries by `ALL`, `INFO`, `WARN`, `ERROR`, `DEBUG`.
  - **Keyword Search**: Quick text match input.
  - **Auto-scroll**: Toggle auto-scrolling to bottom on new log arrival (automatically pauses on manual scroll up).
  - **Clear Screen**: Clears current client logs display.
  - **Color-coded Logs**:
    - `INFO`: Cyan/Green text
    - `WARN`: Yellow text
    - `ERROR`: Bright red text
    - `DEBUG`: Slate/Gray text

---

## Testing Strategy
- **Unit Test**: Create `tests/terminalLogService.test.ts` to test Ring Buffer capacity capping (100 max) and event listener dispatching.
- **Verification**: Run `npx jest --runInBand` and `npm run build:frontend`.
