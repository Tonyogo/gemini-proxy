# Design Spec: gt.js 交互式终端命令卡死修复与多层级 PTY 降级系统

## 1. 背景与现状

在 Gemini Terminal CLI (`gt`) 中，用户使用 `gt exec -it <host> <command>` 发起远程交互式终端会话（例如 `gt exec -it f709ff3fad51 bash`）。
在部分 Agent 环境中，由于宿主机未安装/未编译 C++ 原生模块 `node-pty`，Agent 会打印如下警告并降级到普通的流式管道模式：
```text
[Warning] node-pty not available on agent; running in streaming pipe mode.
```
在此降级模式下，Agent 启动 `bash` 的实现直接调用了 `child_process.spawn(shell, ['-c', command], { stdio: 'pipe' })`。产生了一系列致命问题：
1. **交互式 Shell 缺少 TTY 环境**：`bash` 在 `pipe` 管道模式下默认以非交互（Non-interactive）模式运行，不会打印任何命令提示符（Prompt），终端呈现静默挂起。
2. **换行符不匹配 (CR vs LF)**：客户端由于处于 Raw Mode，按下回车键输出的是 `0x0d` (`\r`)，而常规 Linux 管道缺少内核终端行规程（termios `ICRNL`），导致底层 Shell 无法识别命令甚至报错 `command not found: \r`。
3. **控制字符失控**：缺少终端回显（Echo���和按键控制（如 Ctrl+C、Ctrl+D、Tab 补全），整个交互流程彻底卡死。

## 2. 目标与设计原则

- **目标**：彻底解决缺失 `node-pty` 时执行 `gt exec -it` 的交互卡死问题，实现平滑、稳定、零外部 npm 依赖的高可用交互终端体验。
- **设计原则**：
  1. **零外部依赖 (Zero Dependency)**：不增加任何额外的 npm 生产包，仅依靠系统现有环境平滑降级。
  2. **多层级无感降级 (Multi-tier Graceful Fallback)**：优先使用最高性能、最完整的 PTY 方案，逐层降级。
  3. **生命周期严谨 (Strict Lifecycle & Cleanup)**：超时、断开或中断时通过进程组（Process Group）干净清理，严防僵尸/孤儿进程。
  4. **向后兼容 (Backward Compatibility)**：对已有非交互式命令（`gt exec host uptime`）和带有 `node-pty` 的生产节点保持 100% 行为一致。

## 3. 架构设计与三层驱动体系

将 `scripts/gt.js` 中的 `StreamSessionManager` 演进为支持多层级驱动的架构：

```text
                    [gt exec -it <host> <cmd>]
                               │
                      WebSocket: exec-ws
                               │
                   TerminalExecBridge (Server)
                               │
                    WebSocket: agent-ws
                               │
                  Agent StreamSessionManager
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
     [Layer 1: NodePty]  [Layer 2: PosixPty]  [Layer 3: PipeFallback]
       (node-pty 原生)      (Python3 pty 内置)    (交互式 Pipe 兜底)
```

### Layer 1: NodePtyDriver (首选)
- **触发条件**：当前环境中成功加载了 `node-pty`。
- **特点**：高性能原生 C++ 绑定，完整的终端模拟和 resize 支持。

### Layer 2: PosixPtyDriver (轻量系统级 PTY 降级)
- **触发条件**：缺失 `node-pty`，运行在 POSIX 环境（Linux / macOS）且系统存在 `python3`（拥有内置标准库 `pty`, `termios`, `fcntl`, `select`）。
- **实现原理**：
  - 由 Agent 启动轻量内联 Python3 进程。Python 进程调用 `pty.openpty()` 创建真实的 master/slave 伪终端对。
  - 从进程端执行 `setsid()` 成为新的会话领头进程，将 slave 重定向到标准输入/输出/错误，通过 `execvp` 启动目标 shell（如 `bash`）。
  - 主进程端通过 `select` 在 Node.js 管道与 master pty fd 之间双向流转数据，自动享有操作系统内核的 termios ��规程、回显、Ctrl+C 拦截和按键转换。
  - 支持向内部传递 resize 指令或通过系统调用重置终端窗口尺寸。

### Layer 3: InteractivePipeDriver (纯管道交互兜底)
- **触发条件**：缺失 `node-pty` 且缺失系统 PTY 工具（如纯 Node 容器或特殊精简系统）。
- **实现原理与关键修正**：
  1. **交互式参数注入**：检测如果命令属于常见 shell（`bash`, `sh`, `zsh`），将其重构为带交互参数（如 `bash -i`），强制输出交互 Prompt 并接管输入。
  2. **Raw 模式输入规范化 (CRLF Normalization)**：
     - 当收到按键流时，将单独的 `0x0d` (`\r`) 替换为 `0x0a` (`\n`)，确保命令能够触发执行。
     - 识别控制字符：检测到 `0x03` (Ctrl+C) 时主动向子进程组发送 `SIGINT`；检测到 `0x04` (Ctrl+D) 且无前置字符时向 stdin 写入 EOF 触发退出。
  3. **输出友好标识**：在建立连接之初向前端打印非阻塞提示：
     `[Notice] node-pty/python pty not found; running in interactive pipe fallback mode.`

## 4. 数据流与协议设计

### 4.1 输入流规范
- 客户端（`gt.js runInteractiveExec`）：在检测到 `tty` 时，通过 `process.stdin.setRawMode(true)` 开启原始模式，按字节通过 WebSocket 二进制帧发往服务端。
- 服务端（`TerminalExecBridge`）：将数据透传包装为 `{ type: 'cmd_stream_input', taskId, data: base64 }`。
- Agent 端：
  - Layer 1 & 2：直接写入 PTY master，操作系统终端驱动负责行变换。
  - Layer 3：经过按键规范化后写入子进程的 `stdin` 管道。

### 4.2 输出流规范
- 子进程（PTY 或 Pipe）输出通过 `cmd_stream_data`（base64 编码）经由服务端转发至客户端，客户端使用 `process.stdout.write(chunk)` 实时输出，不加任何额外缓冲或延迟。

### 4.3 退出与信号规范
- 当用户执行 `exit` 或子进程终止时，Agent 触发 `cmd_stream_exit`，携带真实的 `exitCode`，清理当前 session 映射并释放定时器。

## 5. 错误处理、超时与清理策略

1. **进程树级终止 (Process Tree Kill)**：
   - 所有的驱动均在独立的进程组中启动（设置 `detached: true` 或 `setsid()`）。
   - 在接收到客户端断开、SIGINT、超时的场景下，统一调用 `killProcessTree`，通过 `process.kill(-pid, signal)` 向负 PID 发送信号，确保彻底清理孙子进程（例如 bash 内部派生的命令）。
2. **超时机制 (Timeout Guard)**：
   - 如果传递了 `timeoutMs > 0`，启动定时器。超时触发时先发送 `SIGTERM`，如果在 1000ms 内未退出，则追加发送 `SIGKILL`。

## 6. 测试与验证方案

1. **单元测试与集成测试 (`tests/gtAgentPtyFallback.test.ts`)**：
   - 验证在模拟没有 `node-pty` 的情况下，`StreamSessionManager` 能够自动切换至系统内置 PTY 运行交互命令并捕获交互输出与退出码。
   - 验证在没有 `node-pty` 且没有 `python3` 的极端情况下，`InteractivePipeDriver` 能够自动将 `\r` 转换为 `\n` 并支持 `echo` 和 `exit`。
2. **回归测试**：
   - 运行 `tests/gtCli.test.ts`、`tests/gtAgentStream.test.ts`、`tests/terminalExecBridge.test.ts` 确保现有功能不受影响。
