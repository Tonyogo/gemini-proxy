# 内网终端服务重启重连乱码死循环修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决内网终端 Agent 服务或会话重启后，如果不刷新网页重新连接时导致的 ANSI 机器应答回显死循环（持续疯狂输出 `^[[24;80R` 等乱码）的问题。

**Architecture:** 
1. **Agent 握手重置 (`scripts/terminal-agent.js`)**: Agent 重启连接成功生成新 PTY 后，向服务端主动发送 `JSON:{"type":"reset"}` 重置控制帧；
2. **服务端 Hub 会话生命周期管理 (`terminalHostManager.ts`, `terminalWs.ts`)**: 在 Agent 重新注册或接收到 Reset 信号时，清空 `historyBuffer`，释放悬挂的旧 RPC 请求，并向当前挂载的前端客户端广播 `reset` 控制消息和 ANSI 复位清屏序列；
3. **前端状态机与静音门控 (`WebTerminalView.tsx`, `terminalFilter.ts`)**: 重连或收到 reset 后重置 xterm buffer，启动 600ms 静音门控，全面过滤 CPR、DA、OSC 颜色和 DEC 状态等机器应答序列，彻底截断正反馈回环回路。

**Tech Stack:** Node.js, TypeScript, WebSocket (`ws`), xterm.js, Jest.

## Global Constraints

- **彻底阻断回环死锁**: 无论是 Agent 进程重启、网络断线重连还是网页端重连，终端界面必须保持干净无乱码输出。
- **无感尺寸校准**: 重置后立即向 Agent 重新发送精确的 `resize`，使远程 PTY 尺寸与当前浏览器窗口严格对齐。
- **绝不误杀用户正常输入**: 静音过滤器仅拦截机器自动生成的 Escape 报告序列，绝不能影响用户敲击普通按键、组合键（Ctrl/Alt/Shift）或 Vim/Nano 编辑操作。
- **全量测试与构建通过**: 新增 Jest 断言测试套件，并通过全量 `npm test` 与 `npm run build`。

---

### Task 1: 编写重连重置与机器报告过滤断言测试 (`tests/terminalAgentReconnectReset.test.ts`)

**Files:**
- Create: `tests/terminalAgentReconnectReset.test.ts`
- Modify: `tests/terminalReplayMute.test.ts`

**Interfaces:**
- Validates:
  - `terminalHostManager.registerAgent()` 对已有会话重连时自动清空 `historyBuffer`
  - `RemoteAgentTerminalSession.reset()` 清空缓冲区并向前端发送重置信令
  - `isSyntheticTerminalReport` 对复合光标、设备属性及模式查询应答的全面覆盖性拦截

- [ ] **Step 1: 编写自动化测试文件**

Create `tests/terminalAgentReconnectReset.test.ts`:
```ts
import { terminalHostManager, RemoteAgentTerminalSession } from '../src/admin/services/terminalHostManager';
import { isSyntheticTerminalReport } from '../frontend/src/utils/terminalFilter';

describe('Terminal Agent Reconnect and Replay Loop Prevention Tests', () => {
  const testHostId = 'agent-test-reconnect-node';

  afterEach(() => {
    terminalHostManager.unregisterAgent(testHostId);
  });

  test('registerAgent cleans up historyBuffer and resets session on agent re-registration', () => {
    const mockAgentWs1 = { readyState: 1, send: jest.fn() };
    const mockClientWs = { readyState: 1, send: jest.fn() };

    // 1. Initial registration
    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs1,
    });

    const session = terminalHostManager.getSession(testHostId) as RemoteAgentTerminalSession;
    expect(session).toBeDefined();

    // Attach client and simulate dirty history with ANSI query sequences
    session.attach(mockClientWs);
    session.handleData('\x1b[6n\x1b[>c\x1b]11;?\x07echo "DIRTY_OLD_SESSION"\r\n');
    expect(session.getHistory()).toContain('DIRTY_OLD_SESSION');

    // 2. Agent restarts and reconnects with a new WebSocket
    const mockAgentWs2 = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs2,
    });

    // Verify historyBuffer is wiped clean so new PTY won't receive echo floods
    expect(session.getHistory()).toBe('');

    // Verify client received clean reset sequence
    const sentToClient = mockClientWs.send.mock.calls.map(call => call[0]);
    const hasResetSignal = sentToClient.some(msg =>
      (typeof msg === 'string' && msg.includes('JSON:{"type":"reset"}')) ||
      (typeof msg === 'string' && msg.includes('\x1b[2J\x1b[H'))
    );
    expect(hasResetSignal).toBe(true);
  });

  test('isSyntheticTerminalReport catches various complex device reports', () => {
    // CPR (Cursor Position Report) variations
    expect(isSyntheticTerminalReport('\x1b[1;1R')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[45;120R')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[1;1;1R')).toBe(true);

    // Primary & Secondary Device Attributes
    expect(isSyntheticTerminalReport('\x1b[?1;2c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[?62;1;2;4;6;7;8;9;15;18;21;22c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[>0;276;0c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[>1;10;0c')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[=0c')).toBe(true);

    // Color queries (OSC 10 / 11)
    expect(isSyntheticTerminalReport('\x1b]10;rgb:ffff/ffff/ffff\x1b\\')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b]11;rgb:0000/0000/0000\x07')).toBe(true);

    // Mode reports (DECRPM)
    expect(isSyntheticTerminalReport('\x1b[?2004;1$y')).toBe(true);
    expect(isSyntheticTerminalReport('\x1b[12;2$y')).toBe(true);

    // User keystrokes must NEVER be filtered
    expect(isSyntheticTerminalReport('ls -la\r')).toBe(false);
    expect(isSyntheticTerminalReport('\x03')).toBe(false); // Ctrl+C
    expect(isSyntheticTerminalReport('\x1b[A')).toBe(false); // Up arrow
  });
});
```

- [ ] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/terminalAgentReconnectReset.test.ts`
Expected: FAIL because `registerAgent` doesn't automatically reset `session.historyBuffer` or broadcast reset signals.

- [ ] **Step 3: 提交测试文件**

```bash
git add tests/terminalAgentReconnectReset.test.ts
git commit -m "test: add test suite for terminal agent reconnect reset and report filtering"
```

---

### Task 2: 增强服务端 `TerminalHostManager` 与 `RemoteAgentTerminalSession` 的重置与广播机制

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts:40-95, 210-240`
- Modify: `src/admin/routes/terminalWs.ts:80-115`
- Test: `tests/terminalAgentReconnectReset.test.ts`

**Interfaces:**
- Produces:
  - `RemoteAgentTerminalSession.reset(notifyClients = true)`: 清空 `historyBuffer` 并向挂载的前端客户端发送 `JSON:{"type":"reset"}` 及清屏序列 `\x1b[2J\x1b[H\x1b[3J`
  - `TerminalHostManager.registerAgent()`: 当为已有 session 重新上线时，自动触发 `session.reset()` 并拒绝未决旧 RPC 请求

- [ ] **Step 1: 修改 `src/admin/services/terminalHostManager.ts`**

In `RemoteAgentTerminalSession`:
```typescript
  public reset(notifyClients: boolean = true): void {
    this.historyBuffer = [];
    this.totalBufferSize = 0;
    if (this.agentWs && this.agentWs.readyState === 1) {
      try {
        this.agentWs.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      } catch (err: any) {
        logger.warn(`[RemoteAgentTerminal:${this.hostId}] Failed to send reset to agent: ${err.message}`);
      }
    }
    if (notifyClients) {
      for (const ws of this.activeSockets) {
        try {
          if (ws.readyState === 1) {
            ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
            ws.send('\x1b[2J\x1b[H\x1b[3J');
          }
        } catch {
          // Ignore write errors
        }
      }
    }
  }
```

In `TerminalHostManager.registerAgent()`:
```typescript
    let session = this.sessions.get(id) as RemoteAgentTerminalSession | undefined;
    if (!session || !(session instanceof RemoteAgentTerminalSession)) {
      session = new RemoteAgentTerminalSession(id, metadata.agentWs);
      this.sessions.set(id, session);
    } else {
      // Agent reconnecting / re-registering -> Reset dirty history and notify web clients
      session.updateAgentWs(metadata.agentWs);
      session.reset(true);
      this.clearPendingRpcForHost(id);
    }
```

增加清理挂起 RPC 方法：
```typescript
  public clearPendingRpcForHost(hostId: string): void {
    for (const [reqId, resolver] of this.rpcResolvers.entries()) {
      resolver({ success: false, error: `Agent ${hostId} reconnected; previous RPC cancelled` });
      this.rpcResolvers.delete(reqId);
    }
  }
```

- [ ] **Step 2: 运行测试并验证通过**

Run: `npx jest tests/terminalAgentReconnectReset.test.ts`
Expected: PASS.

- [ ] **Step 3: 提交后端更改**

```bash
git add src/admin/services/terminalHostManager.ts src/admin/routes/terminalWs.ts
git commit -m "fix(terminal): purge history buffer and broadcast reset on agent reconnect"
```

---

### Task 3: 升级 Agent 端 `scripts/terminal-agent.js` 重连握手与尺寸同步

**Files:**
- Modify: `scripts/terminal-agent.js:270-320`

**Interfaces:**
- Produces:
  - Agent 在 WS `open` 并生成新 PTY 之后，向服务端发送 `JSON:{"type":"reset"}` 和 `JSON:{"type":"resize", ...}`

- [ ] **Step 1: 修改 `scripts/terminal-agent.js`**

在 `ws.on('open')` 处增加主动 reset 与初始化信号：
```javascript
  ws.on('open', () => {
    reconnectAttempts = 0;
    console.log(`[Agent] Connected and registered successfully! Reverse tunnel is active.`);

    if (!ptyProcess) {
      spawnPty();
    }

    // Send reset signal to clear any stale hub buffers
    try {
      ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      if (ptyProcess) {
        ws.send(`JSON:${JSON.stringify({ type: 'resize', cols: ptyProcess.cols, rows: ptyProcess.rows })}`);
      }
    } catch {}
  });
```

- [ ] **Step 2: 提交 Agent 脚本更改**

```bash
git add scripts/terminal-agent.js
git commit -m "fix(agent): send reset and resize handshake on tunnel reconnect"
```

---

### Task 4: 增强前端过滤规则与重连静音门控 (`terminalFilter.ts` & `WebTerminalView.tsx`)

**Files:**
- Modify: `frontend/src/utils/terminalFilter.ts`
- Modify: `frontend/src/components/WebTerminalView.tsx:250-320, 675-710`
- Test: `tests/terminalReplayMute.test.ts`
- Test: `tests/terminalAgentReconnectReset.test.ts`

**Interfaces:**
- Produces:
  - `isSyntheticTerminalReport`: 匹配 3 参数 CPR、全量 DA 格式、DEC 模式查询应答
  - `WebTerminalView.tsx`: 接收到 `JSON:{"type":"reset"}` 时，调用 `xterm.reset()`，重新启动 600ms 静音门控，并调用 `fitAddon.fit()` 发送干净 `resize`

- [ ] **Step 1: 升级 `frontend/src/utils/terminalFilter.ts`**

```typescript
/**
 * Detects whether an escape sequence produced by xterm.js onData is an
 * automated device response / report generated in response to historical query sequences.
 */
export function isSyntheticTerminalReport(data: string): boolean {
  if (!data || typeof data !== 'string') {
    return false;
  }

  // CPR: \x1b[<row>;<col>R or \x1b[<row>;<col>;<page>R or \x1b[?<row>;<col>R
  if (/^\x1b\[\??\d+(?:;\d+)*R$/.test(data)) {
    return true;
  }

  // DA / DA2 / DA3: \x1b[>...c, \x1b[?...c, \x1b[=...c
  if (/^\x1b\[[>?=]\d+(?:;\d+)*c$/.test(data)) {
    return true;
  }

  // OSC 10 / OSC 11 / OSC 4 color reports: \x1b]10;rgb:... or \x1b]11;rgb:... or \x1b]4;... terminated by ST (\x1b\) or BEL (\x07)
  if (/^\x1b\](?:4|10|11|12);(?:[^\x1b\x07]+)(?:\x1b\\|\x07)$/.test(data)) {
    return true;
  }

  // DECRPM / ANSI mode reports: \x1b[<mode>;<status>$y or \x1b[?<mode>;<status>$y
  if (/^\x1b\[\??\d+(?:;\d+)*\$y$/.test(data)) {
    return true;
  }

  // Window manipulation reports (e.g. \x1b[4;<height>;<width>t, \x1b[8;<rows>;<cols>t)
  if (/^\x1b\[\d+(?:;\d+)*t$/.test(data)) {
    return true;
  }

  return false;
}
```

- [ ] **Step 2: 升级 `WebTerminalView.tsx` 处理 reset 信号与门控保护**

在 `ws.onmessage` 中处理 `JSON:{"type":"reset"}`：
```typescript
            if (parsed.type === 'reset') {
              console.debug('[WebTerminal] Received reset signal from backend, clearing buffer and muting synthetic reports');
              xtermRef.current?.reset();
              isReplayingRef.current = true;
              if (replayTimerRef.current) {
                clearTimeout(replayTimerRef.current);
              }
              replayTimerRef.current = setTimeout(() => {
                isReplayingRef.current = false;
              }, 600);
              if (fitAddonRef.current && xtermRef.current) {
                fitAddonRef.current.fit();
                sendResize(xtermRef.current.cols, xtermRef.current.rows);
              }
              return;
            }
```

在 `ws.onopen` 中初始启动 600ms 门控保护：
```typescript
      isReplayingRef.current = true;
      if (replayTimerRef.current) {
        clearTimeout(replayTimerRef.current);
      }
      replayTimerRef.current = setTimeout(() => {
        isReplayingRef.current = false;
      }, 600);
```

- [ ] **Step 3: 运行测试并验证通过**

Run: `npx jest tests/terminalReplayMute.test.ts tests/terminalAgentReconnectReset.test.ts`
Expected: PASS (100% passing).

- [ ] **Step 4: 提交前端代码**

```bash
git add frontend/src/utils/terminalFilter.ts frontend/src/components/WebTerminalView.tsx
git commit -m "fix(terminal): enhance synthetic report filter and reset state machine in web terminal"
```

---

### Task 5: 全量回归测试与编译打包验证

**Files:**
- All touched files
- Test: All suites

- [ ] **Step 1: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: All suites passed (68 suites, 0 failures).

- [ ] **Step 2: 运行前端生产编译**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

- [ ] **Step 3: 运行后端 TypeScript 编译**

Run: `npm run build:backend`
Expected: `tsc` compiles cleanly with 0 errors.

- [ ] **Step 4: 提交最终状态**

```bash
git status
git commit -m "chore: verify and finalize terminal agent reconnect echo loop fix"
```
