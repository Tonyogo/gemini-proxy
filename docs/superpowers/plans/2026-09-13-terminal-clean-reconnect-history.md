# 终端重连历史保留与防乱码实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决 WebTerminal 在服务或 Agent 重连时为了保留历史不调用 reset 导致的终端转义乱码（如 `^[[?1;2c`、`^[[1;1R` 等）问题，实现无感保留历史且 0 乱码的终端重连与回放机制。

**Architecture:** 
在 `src/admin/services/terminalHostManager.ts` 中增强历史回放清洗逻辑 `stripTerminalQuerySequences`（注入软重置与样式闭合前缀 `\x1b[0m\x1b[?25h`，彻底剥离所有可能引起 xterm 自动报告的查询码）；在 Agent 重新注册时执行“软重连”，只更新 WebSocket 连接通道，不再清空历史缓冲区 `historyBuffer`；在 `scripts/terminal-agent.js` 中将普通断线重连与全新的首次 PTY 启动解耦，普通重连不再发送清屏 reset；更新对应测试套件。

**Tech Stack:** Node.js, TypeScript, WebSocket, xterm.js, Jest.

## Global Constraints

- Agent 重新注册与连接时，原有的屏幕输出历史（`historyBuffer`）必须保留，不得调用 `session.reset()` 清屏。
- 客户端在附加（`attach`）读取历史流时，必须经过 `stripTerminalQuerySequences` 清洗，并在开头注入 `\x1b[0m\x1b[?25h` 前缀，防止历史截断导致的样式错乱与全屏变色。
- 回放历史流中不得包含任何查询序列（OSC 10/11/12, DA1/2/3, CPR, DECRPM），杜绝向 Shell 反向输入乱码。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 升级服务端历史清洗方法并实现 Agent 软重连保留历史

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts:25-65`
- Modify: `src/admin/services/terminalHostManager.ts:220-235`
- Modify: `tests/terminalSyntheticEchoProtection.test.ts`
- Modify: `tests/terminalAgentReconnectReset.test.ts`

**Interfaces:**
- Produces: `stripTerminalQuerySequences(stream: string): string`
  - 返回值：带有软重置前缀 `\x1b[0m\x1b[?25h` 并剥离所有查询序列的干净流。
- Modifies:
  - `RemoteAgentTerminalSession.attach`: 发送经过完整清洗与前缀包裹的历史流。
  - `TerminalHostManager.registerAgent`: 对已存在的会话仅更新 `agentWs` 与清理 RPC，不再清空 `historyBuffer`。

- [ ] **Step 1: 在 `tests/terminalSyntheticEchoProtection.test.ts` 与 `tests/terminalAgentReconnectReset.test.ts` 中编写保留历史与软重置前缀断言**

```typescript
// tests/terminalSyntheticEchoProtection.test.ts
    it('prepends soft style reset prefix to prevent color bleed or broken escapes from previous chunks', () => {
      const input = 'hello world';
      const output = stripTerminalQuerySequences(input);
      expect(output.startsWith('\x1b[0m\x1b[?25h')).toBe(true);
      expect(output).toContain('hello world');
    });

// tests/terminalAgentReconnectReset.test.ts
  test('registerAgent preserves historyBuffer on agent re-registration (soft reconnect)', () => {
    const mockAgentWs1 = { readyState: 1, send: jest.fn() };
    const mockClientWs = { readyState: 1, send: jest.fn() };

    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs1,
    });

    const session = terminalHostManager.getSession(testHostId) as RemoteAgentTerminalSession;
    session.attach(mockClientWs);
    session.handleData('PRESERVED_TERMINAL_OUTPUT\r\n');
    expect(session.getHistory()).toContain('PRESERVED_TERMINAL_OUTPUT');

    // Agent reconnects
    const mockAgentWs2 = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Test Node',
      agentWs: mockAgentWs2,
    });

    // History must be preserved, not wiped!
    expect(session.getHistory()).toContain('PRESERVED_TERMINAL_OUTPUT');
  });
```

- [ ] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalAgentReconnectReset.test.ts`
Expected: FAIL - 原逻辑会 `session.reset()` 导致历史被清空。

- [ ] **Step 3: 修改 `src/admin/services/terminalHostManager.ts`**

1. 更新 `stripTerminalQuerySequences`：
```typescript
export function stripTerminalQuerySequences(stream: string): string {
  if (!stream || typeof stream !== 'string') return '';
  const stripped = stream.replace(
    /\x1b(?:\](?:4|10|11|12);\?(?:\x1b\\|\x07)|\[[>?=]?(?:0)?c|\[\??6n|\[\??\d+\$p|\[>0?q|\[(?:14|18|19|20|21)t)/g,
    ''
  );
  if (!stripped) return '';
  // Prepend soft style reset and show cursor to ensure pristine state after replay
  return '\x1b[0m\x1b[?25h' + stripped;
}
```

2. 修改 `TerminalHostManager.registerAgent` 逻辑：
```typescript
    let session = this.sessions.get(id);
    if (!session) {
      session = new RemoteAgentTerminalSession(id, metadata.agentWs);
      this.sessions.set(id, session);
    } else {
      // Agent reconnecting -> Soft update agent WebSocket without wiping history or interrupting client screens
      session.updateAgentWs(metadata.agentWs);
      this.clearPendingRpcForHost(id);
    }
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx jest tests/terminalSyntheticEchoProtection.test.ts tests/terminalAgentReconnectReset.test.ts`
Expected: PASS

- [ ] **Step 5: 提交更改**

```bash
git add src/admin/services/terminalHostManager.ts tests/terminalSyntheticEchoProtection.test.ts tests/terminalAgentReconnectReset.test.ts
git commit -m "fix(terminal): preserve history on reconnect with sanitized soft reset prefix"
```

---

### Task 2: 优化反向 Agent 断网重连时不发送破坏性清屏包

**Files:**
- Modify: `scripts/terminal-agent.js:290-307`
- Test: `tests/terminalAgent.test.ts`

**Interfaces:**
- Behavior: `terminal-agent.js` 在网络断开重连恢复时，如果已存在运行中的 `ptyProcess`，只同步当前的窗口尺寸 `resize`，绝不再向服务端发送 `reset` 控制包，避免触发清屏。

- [ ] **Step 1: 检查 `tests/terminalAgent.test.ts`**

查看现有测试确保无语义冲突。

- [ ] **Step 2: 修改 `scripts/terminal-agent.js` 连接成功回调**

在 `ws.on('open')` 中调整：
```javascript
  ws.on('open', () => {
    reconnectAttempts = 0;
    console.log(`[Agent] Connected and registered successfully! Reverse tunnel is active.`);

    const isFirstSpawn = !ptyProcess;
    if (!ptyProcess) {
      spawnPty();
    }

    // Only send reset on absolute first spawn of a fresh process, never on reconnect of existing PTY
    try {
      if (isFirstSpawn) {
        ws.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      }
      if (ptyProcess) {
        ws.send(`JSON:${JSON.stringify({ type: 'resize', cols: ptyProcess.cols, rows: ptyProcess.rows })}`);
      }
    } catch {}
  });
```

- [ ] **Step 3: 运行相关测试验证**

Run: `npx jest tests/terminalAgent.test.ts`
Expected: PASS

- [ ] **Step 4: 提交更改**

```bash
git add scripts/terminal-agent.js
git commit -m "fix(agent): avoid sending reset on tunnel reconnect when PTY process is alive"
```

---

### Task 3: 前端编译与全套自动化测试回归

**Files:**
- None (Build & Verification only)

- [ ] **Step 1: 运行前端与后端编译构建检查**

Run: `npm run build`
Expected: 前端 Vite 打包与后端 TypeScript 编译 0 错误通过

- [ ] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 105 个测试套件全部通过

- [ ] **Step 3: 验证 git 状态干净**

Run: `git status`
Expected: working tree clean

---
