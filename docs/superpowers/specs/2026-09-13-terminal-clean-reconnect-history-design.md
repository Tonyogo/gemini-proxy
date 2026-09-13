# 终端重连历史保留与防乱码优化设计规范 (Design Spec)

- **创建日期**: 2026-09-13
- **状态**: Approved (已确认)
- **目标**: 彻底解决 WebTerminal 在服务或 Agent 重连时不调用 `reset` 保留历史记录导致出现转义字符乱码（如 `^[[?1;2c`、`^[]11;`、提示符错位等）的问题，实现无感保留历史且 0 乱码的终端重连机制。

---

## 1. 背景与核心痛点 (Background & Root Cause)

### 现状问题
- 当服务端与 Agent 重连时，若为了保留历史记录而不执行 `session.reset()`，终端界面上经常会瞬间冒出一串机器控制字符乱码（如 `^[[?1;2c`、`^[[1;1R`），提示符发生错位或重复，甚至回车提示 `command not found: ;2c`。

### 核心机理
1. **合成报告回声风暴 (Synthetic Echo Storm)**：
   终端历史记录中含有 Zsh / Starship / Vim 输出的颜色与设备查询序列（OSC 10/11、DA `\x1b[c`、CPR `\x1b[6n`）。重连回放给前端 `xterm.js` 时，xterm 会将响应报告反向输出，被当成用户的键盘输入注入到 Shell 命令行。
2. **重连生命周期里的粗暴重置**：
   原代码在 Agent 重新注册时，无条件调用 `session.reset(true, false)` 清空了所有历史记录并向前端广播清屏，导致哪怕底层 PTY 进程未退出，重连也会失去所有屏幕内容。
3. **ANSI 样式与截断未闭合**：
   200KB 循环缓冲区截断导致首尾可能存在残破的颜色序列，缺少状态前缀修复。

---

## 2. 详细设计与数据流 (Detailed Architecture)

### 2.1 服务端历史清洗与软重置前缀 (`src/admin/services/terminalHostManager.ts`)
```typescript
/**
 * Sanitizes historical terminal replayed stream:
 * 1. Injects soft reset prefix (\x1b[0m\x1b[?25h) to guarantee clean visual render state.
 * 2. Strips all terminal query escape sequences (OSC 10/11/12, DA1/2/3, CPR, DECRPM, Window queries)
 *    to strictly prevent xterm from generating echo storms into shell.
 */
export function sanitizeReplayHistory(stream: string): string {
  if (!stream || typeof stream !== 'string') return '';

  const stripped = stream.replace(
    /\x1b(?:\](?:4|10|11|12);\?(?:\x1b\\|\x07)|\[[>?=]?(?:0)?c|\[\??6n|\[\??\d+\$p|\[>0?q|\[(?:14|18|19|20|21)t)/g,
    ''
  );

  // Soft style reset prefix
  return '\x1b[0m\x1b[?25h' + stripped;
}
```

### 2.2 Agent 重连软恢复 (Soft Reconnect without Reset)
- 在 `TerminalHostManager.registerAgent()` 中：
  当已存在该 `hostId` 的会话时：
  - 仅更新 WebSocket 句柄 `session.updateAgentWs(metadata.agentWs)`；
  - **不再调用** `session.reset(true, false)` 清屏，保留完整的 `historyBuffer`；
  - 清理该 Host 的挂起 RPC。
- 在 `scripts/terminal-agent.js` 中：
  - 仅在全新拉起 PTY (`spawnPty`) 且为第一次初始化时，才在需要时发 reset；普通网络掉线重连不再发送 `reset` 控制包。

### 2.3 前端回放静音窗口保护 (`frontend/src/components/WebTerminalView.tsx`)
- 在建立 WebSocket 并接收历史数据的头 `600ms` 回放保护期内：
  - `isReplayingRef.current = true`；
  - `term.onData` 强力过滤任何 `isSyntheticTerminalReport` 与 `isUnsolicitedShellDeviceReport`，严禁在回放期间向 WebSocket 写入任何机器生成的应答码；
  - 回放窗口结束后，执行 `scrollToBottomSafe(term)`。

---

## 3. 边界情况 (Edge Cases)

1. **PTY 真正退出重启**：
   - 若 Agent 端的 Shell 进程真正退出（如输入 `exit` 或被杀），Agent 重新 spawn 时会通知服务器重置会话，属于正常退出重置。
2. **多客户端同时附加 (Multi-Client Attach)**：
   - 任何新打开的网页客户端连入，均通过 `sanitizeReplayHistory` 获取无乱码的纯净历史，互不影响。

---

## 4. 验证标准 (Verification Criteria)

1. **单元测试**:
   - `tests/terminalSyntheticEchoProtection.test.ts` 覆盖 `sanitizeReplayHistory` 样式注入与查询剥离；
   - `tests/terminalAgentReconnectReset.test.ts` 验证 Agent 重连时历史记录不被清空。
2. **构建与全量回归**:
   - `npm run build` 成功。
   - `npm test` 全量测试套件 100% 绿灯。
