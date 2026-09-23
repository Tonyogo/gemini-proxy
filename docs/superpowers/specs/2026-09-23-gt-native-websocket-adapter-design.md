# Design Spec: gt Zero-Dependency Native WebSocket Adapter

- **Date**: 2026-09-23
- **Topic**: Fix `TypeError: ws.on is not a function` in `gt agent` and standalone `gt exec` under Node 22+ when `ws` npm package is not installed.
- **Status**: Approved

---

## 1. Problem Statement

When users install `gt` CLI via the one-line installer (`curl ... | bash`) on clean environments (such as Google Cloud Shell, VPS, Docker containers) without local or global `node_modules/ws`:
1. `gt.js` catches the `require('ws')` error and falls back to Node.js 22+ built-in `globalThis.WebSocket`.
2. Node.js built-in `globalThis.WebSocket` implements the WHATWG W3C WebSocket standard (`EventTarget` interface with `addEventListener`), rather than the Node.js `EventEmitter` interface (`.on()`, `.once()`, `.off()`).
3. Running `gt agent` or `gt exec -it` crashes immediately with:
   ```text
   [Agent] Uncaught exception: TypeError: ws.on is not a function
       at connect (/usr/local/bin/gt:1430:8)
   ```

---

## 2. Goals & Non-Goals

### Goals
- Make `scripts/gt.js` completely self-contained and zero-dependency under Node.js 22+.
- Provide a `NativeWebSocketAdapter` that wraps `globalThis.WebSocket` and exposes the exact API surface used by `gt agent` and `gt exec`:
  - `on(event, handler)`, `once(event, handler)`, `off(event, handler)`, `removeListener(event, handler)`
  - `send(data)` (supporting strings and Buffers)
  - `close(code, reason)` and `terminate()`
  - `readyState` property and `OPEN`, `CLOSED`, `CONNECTING`, `CLOSING` constants
  - Normalizing message events so handlers receive `(data, isBinary)` where binary payloads are presented as `Buffer`
- Maintain 100% backward compatibility when `ws` package is present.

### Non-Goals
- Supporting WebSocket functionality on Node versions < 21 when neither `ws` nor `globalThis.WebSocket` is present.
- Implementing unused features of the `ws` package (like server-side websockets or compression hooks).

---

## 3. Architecture & Detailed Design

### 3.1 Adapter Construction (`createWebSocketAdapter`)

In `scripts/gt.js`:
```javascript
function createWebSocketAdapter() {
  class NativeWebSocketAdapter {
    constructor(url, options = {}) {
      this._ws = new globalThis.WebSocket(url, options);
      this._ws.binaryType = 'arraybuffer';
      this._listeners = new Map();

      this._ws.addEventListener('open', (e) => this._emit('open', e));
      this._ws.addEventListener('close', (e) => this._emit('close', e.code, e.reason));
      this._ws.addEventListener('error', (e) => {
        this._emit('error', e.error || new Error(e.message || 'WebSocket error'));
      });
      this._ws.addEventListener('message', (e) => {
        let data = e.data;
        const isBinary = data instanceof ArrayBuffer;
        if (isBinary) {
          data = Buffer.from(data);
        }
        this._emit('message', data, isBinary);
      });
    }

    get readyState() {
      return this._ws.readyState;
    }

    send(data) {
      return this._ws.send(data);
    }

    close(code, reason) {
      return this._ws.close(code, reason);
    }

    terminate() {
      return this._ws.close();
    }

    on(event, handler) {
      if (!this._listeners.has(event)) {
        this._listeners.set(event, []);
      }
      this._listeners.get(event).push(handler);
      return this;
    }

    once(event, handler) {
      const onceWrapper = (...args) => {
        this.off(event, onceWrapper);
        handler(...args);
      };
      return this.on(event, onceWrapper);
    }

    off(event, handler) {
      const list = this._listeners.get(event);
      if (list) {
        const idx = list.indexOf(handler);
        if (idx !== -1) list.splice(idx, 1);
      }
      return this;
    }

    removeListener(event, handler) {
      return this.off(event, handler);
    }

    _emit(event, ...args) {
      const handlers = (this._listeners.get(event) || []).slice();
      for (const h of handlers) {
        try {
          h(...args);
        } catch (err) {
          console.error(`[WebSocket error in ${event}]:`, err);
        }
      }
    }
  }

  NativeWebSocketAdapter.CONNECTING = 0;
  NativeWebSocketAdapter.OPEN = 1;
  NativeWebSocketAdapter.CLOSING = 2;
  NativeWebSocketAdapter.CLOSED = 3;

  return NativeWebSocketAdapter;
}
```

### 3.2 Safe Fallback Resolution

```javascript
let WebSocketImpl = null;
try {
  WebSocketImpl = require('ws');
} catch {}

if (!WebSocketImpl && typeof globalThis.WebSocket !== 'undefined') {
  WebSocketImpl = createWebSocketAdapter();
}

const WebSocket = WebSocketImpl;
```

Export `createWebSocketAdapter` at the bottom of `scripts/gt.js` for unit testing and direct verification.

### 3.3 Defensive Guards in `gt.js`
In `connect()` inside `runAgent`:
```javascript
ws.on('upgrade', (response) => {
  if (ws._socket && typeof ws._socket.setKeepAlive === 'function') {
    ws._socket.setKeepAlive(true, 10000);
  }
});
```
This is safe because `NativeWebSocketAdapter` simply does not emit `upgrade`, and `ws._socket` check guards against null/undefined.

---

## 4. Testing Strategy

1. **Unit Test (`tests/gtNativeWebSocket.test.ts`)**:
   - Verify `createWebSocketAdapter` creates an instance matching `EventEmitter` interface.
   - Test connecting to a local `WebSocketServer` via `NativeWebSocketAdapter` without importing `ws` on client side.
   - Verify sending/receiving JSON text messages and Buffer binary messages.
   - Verify `on('open')`, `on('message')`, `on('close')`, `terminate()`, and constants (`WebSocket.OPEN`).
2. **Existing Regression Suite**:
   - Run `npm test` across all 139 test suites to ensure zero regression.
