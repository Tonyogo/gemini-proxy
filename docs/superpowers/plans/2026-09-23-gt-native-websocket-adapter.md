# gt Native WebSocket Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a zero-dependency WHATWG WebSocket adapter (`NativeWebSocketAdapter`) in `scripts/gt.js` so that `gt agent` and `gt exec` work out-of-the-box on Node 22+ environments without requiring the `ws` npm package.

**Architecture:** Wrap Node.js built-in `globalThis.WebSocket` into an EventEmitter-compatible adapter (`NativeWebSocketAdapter`) that translates W3C EventTarget events (`open`, `message`, `error`, `close`) to Node.js EventEmitter style (`.on()`, `.once()`, `.off()`), normalizes binary frames to `Buffer`, and provides `.terminate()` and `WebSocket.OPEN` constants. Fallback dynamically to this adapter when `require('ws')` fails.

**Tech Stack:** Node.js (v22+), TypeScript, Jest, `ws` (for test server).

## Global Constraints

- No external runtime dependencies introduced to `scripts/gt.js`.
- Maintain 100% backward compatibility when `ws` is present.
- Support both text messages and binary `Buffer` payloads.
- Strictly adhere to Node 22+ `globalThis.WebSocket` API specs.

---

### Task 1: Create Unit Test for `NativeWebSocketAdapter`

**Files:**
- Create: `tests/gtNativeWebSocket.test.ts`
- Modify: `scripts/gt.js` (export `createWebSocketAdapter` if needed)

**Interfaces:**
- Consumes: `createWebSocketAdapter()` from `../scripts/gt.js`
- Produces: Verified `NativeWebSocketAdapter` class with standard WebSocket constants and EventEmitter methods (`on`, `once`, `off`, `send`, `close`, `terminate`).

- [x] **Step 1: Write the failing test**

Create `tests/gtNativeWebSocket.test.ts`:
```typescript
import http from 'http';
import { WebSocketServer } from 'ws';
// @ts-ignore
const gt = require('../scripts/gt.js');

describe('NativeWebSocketAdapter', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let port: number;

  beforeAll((done) => {
    server = http.createServer();
    wss = new WebSocketServer({ server });
    server.listen(0, () => {
      port = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    wss.close(() => {
      server.close(done);
    });
  });

  it('exports createWebSocketAdapter function', () => {
    expect(typeof gt.createWebSocketAdapter).toBe('function');
  });

  it('connects, sends and receives text and binary messages with EventEmitter interface', (done) => {
    wss.once('connection', (ws, req) => {
      expect(req.headers['x-admin-key']).toBe('test-secret');
      ws.send('server-hello');
      ws.send(Buffer.from([0x01, 0x02, 0x03]));
      ws.on('message', (data, isBinary) => {
        if (data.toString() === 'client-ping') {
          ws.send('server-pong');
        }
      });
    });

    const AdapterClass = gt.createWebSocketAdapter();
    expect(AdapterClass.OPEN).toBe(1);
    expect(AdapterClass.CLOSED).toBe(3);

    const client = new AdapterClass(`ws://127.0.0.1:${port}`, {
      headers: { 'x-admin-key': 'test-secret' },
    });

    expect(typeof client.on).toBe('function');
    expect(typeof client.once).toBe('function');
    expect(typeof client.off).toBe('function');
    expect(typeof client.terminate).toBe('function');

    const received: Array<{ data: any; isBinary: boolean }> = [];

    client.on('open', () => {
      expect(client.readyState).toBe(AdapterClass.OPEN);
      client.send('client-ping');
    });

    client.on('message', (data: any, isBinary: boolean) => {
      received.push({ data, isBinary });
      if (received.length === 3) {
        expect(received[0].data.toString()).toBe('server-hello');
        expect(received[0].isBinary).toBe(false);

        expect(Buffer.isBuffer(received[1].data)).toBe(true);
        expect(received[1].data).toEqual(Buffer.from([0x01, 0x02, 0x03]));
        expect(received[1].isBinary).toBe(true);

        expect(received[2].data.toString()).toBe('server-pong');

        client.close();
      }
    });

    client.on('close', () => {
      done();
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/gtNativeWebSocket.test.ts`
Expected: FAIL with `createWebSocketAdapter is not a function`

---

### Task 2: Implement `createWebSocketAdapter` in `scripts/gt.js`

**Files:**
- Modify: `scripts/gt.js:16-25`
- Modify: `scripts/gt.js:2670+` (module exports)

**Interfaces:**
- Consumes: `globalThis.WebSocket`
- Produces: `createWebSocketAdapter(): class NativeWebSocketAdapter` and initializes fallback `WebSocket` variable when `ws` is unavailable.

- [x] **Step 1: Implement `createWebSocketAdapter` and initialize fallback in `scripts/gt.js`**

Add `createWebSocketAdapter` implementation near top of `scripts/gt.js`:
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

let WebSocketImpl = null;
try {
  WebSocketImpl = require('ws');
} catch {}

if (!WebSocketImpl && typeof globalThis.WebSocket !== 'undefined') {
  WebSocketImpl = createWebSocketAdapter();
}

const WebSocket = WebSocketImpl;
```

Export `createWebSocketAdapter` at bottom of `scripts/gt.js`.

- [x] **Step 2: Run test to verify it passes**

Run: `npx jest tests/gtNativeWebSocket.test.ts`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add tests/gtNativeWebSocket.test.ts scripts/gt.js
git commit -m "feat(gt): implement NativeWebSocketAdapter for zero-dependency standalone execution"
```

---

### Task 3: Add Defensive Guard on `ws._socket` and Edge Cases

**Files:**
- Modify: `scripts/gt.js:1430-1435`
- Test: `tests/gtNativeWebSocket.test.ts`

**Interfaces:**
- Consumes: `ws` instance in `runAgent`
- Produces: Safe `upgrade` event handling without throwing on undefined `ws._socket`.

- [x] **Step 1: Write test for once, off, removeListener, and upgrade listener safety**

Add tests in `tests/gtNativeWebSocket.test.ts`:
```typescript
  it('supports once and off listener methods', () => {
    const AdapterClass = gt.createWebSocketAdapter();
    const client = new AdapterClass(`ws://127.0.0.1:${port}`);
    let calls = 0;
    client.once('custom', () => { calls++; });
    client._emit('custom');
    client._emit('custom');
    expect(calls).toBe(1);

    const handler = () => {};
    client.on('test', handler);
    expect(client._listeners.get('test').length).toBe(1);
    client.removeListener('test', handler);
    expect(client._listeners.get('test').length).toBe(0);
    client.close();
  });
```

- [x] **Step 2: Run test and ensure existing tests pass**

Run: `npx jest tests/gtNativeWebSocket.test.ts`
Expected: PASS

- [x] **Step 3: Verify full test suite**

Run: `npm test`
Expected: All test suites pass (140 passed).

- [x] **Step 4: Commit**

```bash
git add scripts/gt.js tests/gtNativeWebSocket.test.ts
git commit -m "fix(gt): guard ws._socket access and verify adapter event listener cleanup"
```
