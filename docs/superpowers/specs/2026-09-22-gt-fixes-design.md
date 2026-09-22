# GT.JS 核心缺陷重构设计方案 (Signaling Isolation, Orphan Process Cleanup & CLI Parsing)

**日期**: 2026-09-22  
**状态**: Approved (Design Phase)  
**涉及模块**: `scripts/gt.js`, `src/terminal/routes/terminalWs.ts`, `src/terminal/services/terminalHostManager.ts`, `agent-rs/` (对齐协议)

---

## 1. 背景与目标

`scripts/gt.js` 是 Gemini Terminal (gt) 体系的核心组件，同时承担了轻量 CLI 工具和逆向终端 Agent 守护进程的职责。在经过审查后，发现其在生产环境中存在 3 个关键设计与实现问题：
1. **信令与数据流混淆 (In-band Signaling Ambiguity)**：WebSocket 单一通道中，PTY 原始终端输出与系统控制指令（JSON 信令）混杂，且依赖危险的裸 JSON 文本嗅探，极易因终端输出内容被误判而重置或打断终端会话（DoS 隐患）。
2. **孤儿进程泄漏 (Orphan Process Leaks)**：任务启动时使用独立进程组，但 Agent 关闭或异常退出时仅向顶层 shell 发送信号，未级联杀除衍生子进程，导致后台孤儿进程长期占用系统资源与端口。
3. **命令行参数解析缺陷 (CLI Argument Misparsing)**：`gt exec` 缺乏状态机边界控制，参数被贪婪消费，导致目标远程命令自带的 flags（如 `curl -t 10`）被本地 CLI 错误拦截。

本方案旨在针对这三项核心缺陷提供系统性的重构方案，确保零第三方额外依赖、具备高稳定性和向后兼容性。

---

## 2. 详细设计

### 2.1 模块一：信令与数据流强隔离（Protocol & Signaling Isolation）

#### 核心原则：RFC 6455 原生双类型分帧隔离
利用 WebSocket 标准规范中对两种核心数据帧类型的物理区分：
- **Opcode 0x02 (Binary Frame)**：专用于传输 PTY 原始终端字节流（Terminal Raw Output / Input）。
- **Opcode 0x01 (Text Frame)**：专用于传输系统控制信令与 RPC 调用（Control & RPC Messages）。

#### 改造点与交互契约：
1. **Agent 端发送输出 (Agent -> Server)**：
   - Node Agent (`scripts/gt.js`)：`ptyProcess.onData((data) => { ws.send(Buffer.isBuffer(data) ? data : Buffer.from(data)); });`，强制走二进制帧。
   - Rust Agent (`agent-rs`)：PTY 的输出直接作为 `Message::Binary(vec)` 发送。
2. **服务端接收与转发 (Server / TerminalWS & HostManager)**：
   - 服务端在 `terminalWs.ts` 中根据接收帧类型处理：
     - 若为 **Binary Frame**（或 Buffer��：无条件认定为 PTY 终端数据流，调用 `terminalHostManager.handleAgentData(hostId, message)` 写入历史缓冲区并转发给客户端，**绝不进入任何 JSON 信令解析分支**。
     - 若为 **Text Frame**：且字符串**严格以 `JSON:` 为前缀**，才进入 `JSON.parse(msgStr.slice(5))` 进行控制信令（`ping`/`pong`, `file_rpc_res`, `cmd_exec_res`, `reset`, `registered` 等）分发。
   - **彻底废除裸 JSON 嗅探**：移除 `msgStr.startsWith('{') && msgStr.endsWith('}')` 的逻辑，防止任何巧合文本被误识别。
3. **Web 控制台与客户端兼容性 (Web Frontend)**：
   - 经审查，`frontend/src/components/WebTerminalView.tsx` (591行) 已经内建 `data instanceof ArrayBuffer` 分支（`term?.write(new Uint8Array(data))`），因此服务端向网页端推送 Binary 帧完全无需对前端做破坏性重构，天然直接支持。

---

### 2.2 模块二：孤儿进程治理与子进程生命周期（Process Lifecycle & Group Cleanup）

#### 核心原则：进程组（PGID）级联终止与双阶段退出兜底

#### 改造点与实现：
1. **统一抽象跨平台进程组终止器**：
   - 提取全局安全终止函数 `killProcessTree(child, signal = 'SIGTERM')`：
     - **POSIX 平台**：
       - 利用 `child.pid` 对应的独立进程组（启动时配置了 `detached: true`），通过 `process.kill(-child.pid, signal)` 发送组信号，广播通知包括 shell 派生的所有孙子进程（例如 `npm`, `node`, `python`, `curl` 等）。
       - 捕获异常：对 `ESRCH`（进程组已自然消亡）安全忽略，对 `EPERM` 降级为直接单体 `child.kill(signal)`。
     - **Windows 平台**：
       - 通过 `spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })`，利用 `/T`（Tree）参数递归终止整棵进程树。
2. **双阶段优雅退出（Graceful -> Force Kill）**：
   - 针对单个任务超时终止（Timeout）以及主动命令终止（`gt kill`）：
     - 第 1 步：先发送 `SIGTERM` 组信号；
     - 第 2 步：设立定时器（1000ms），若进程仍然未退出，升级发送 `SIGKILL` 组信号强制回收，彻底避免死锁。
3. **Agent 退出全生命周期拦截与回收 (Agent Cleanup)**：
   - 在 `scripts/gt.js` 的 `cleanup()` 中：
     - 同步遍历 `taskManager.tasks` 中所有处于 `running` 状态的任务，调用组杀逻辑统一终止，杜绝 Agent 停止后留下孤儿执行进程。
     - 如果存在 `ptyProcess`，一并调用其 `kill('SIGTERM')`。
   - 注册 Node.js 进程���件监听：`SIGINT`、`SIGTERM`、`SIGHUP`、`exit`、`uncaughtException`，在异常崩溃时确保尽最大可能清理残留子进程组。

---

### 2.3 模块三：命令行参数解析优化（CLI Argument Parsing & UX）

#### 核心原则：零依赖、严格三阶段状态机解析（Docker / POSIX 规范对齐）

#### 改造点与实现：
1. **解析状态机重构（Three-phase Parser）**：
   在 `gt exec` 处理分支中，将参数扫描重构为两阶段判定：
   - **Phase 1: Options Parsing**（在发现 `HOST` 之前）：
     - 解析 `-d/--detach`, `-q/--quiet`, `-w/--workdir`, `-t/--timeout`, `-e/--env`, `--poll-interval` 等。
     - 若遇到 `--`，立即结束 Options 阶段，下一个参数必须是 `HOST`，之后的全部参数进入 Phase 2。
     - 若遇到第一个不以 `-` 开头的参数，该参数即为 `HOST`，立即结束 Options 阶段，后续剩余参数全部转入 Phase 2。
   - **Phase 2: Remote Command Passthrough**（确定 `HOST` 之后）：
     - **后续剩余的所有参数，不管是否包含 `-`，不管是否以 `--` 开头，全部无条件划入远程命令数组 `commandParts`**。
     - 彻底消除 `curl -t 10` 中的 `-t 10` 被误认为 `gt exec` 的 `--timeout` 的问题。
2. **参数保留与安全转义（Shell Argument Quoting）**：
   - 对 `commandParts` 中的每个元素，若包含空格、换行、双引号、或 shell 元字符（`$`, `&`, `;`, `|`, `>`, `<` 等），自动使用单引号包装转义（例如 `arg.replace(/'/g, "'\\''")`），确保在远端 shell 执行时，保持参数的原生边界，避免二次展开和引号丢失。
3. **`gt logs` 支持 Follow 流式跟随 (`-f / --follow`)**：
   - 扩展 `gt logs HOST TASK_ID [-f|--follow]` 支持。
   - 当携带 `-f` 时，复用 `gt exec` 的增量 offset 轮询机制，实现类似于 `docker logs -f` 的实时输出追踪，直至任务结束。

---

## 3. 测试与验证策略

1. **信令隔离测试**：
   - 编写自动化测试：Agent 运行中输出包含裸 JSON 字符串（如 `{"type":"reset"}`、`{"type":"ping"}`），验证终端会话不会触发重置，数据完整显示在客户端。
   - 验证 `Buffer` 二进制帧在 Node 服务端和前端的正常显示。
2. **孤儿进程清理测试**：
   - 启动派生后台驻留子进程的命令（如 `sh -c "sleep 100 & sleep 100"`），通过 `gt kill` 或终止 Agent 进程，验证 `ps aux | grep sleep` 中所有衍生子进程被全部清理，无僵尸孤儿存活。
3. **CLI 参数解析测试**：
   - 针对 `gt exec my-host curl -t 10 http://example.com` 进行断言测试，确认 `timeoutMs` 保持默认值，而远端收到的完整命令为 `curl -t 10 http://example.com`。
   - 针对带空格的命令如 `gt exec my-host grep "hello world" a.txt`，验证参数引号被正确保留传递。
   - 针对 `gt logs -f my-host <taskId>` 进行持续轮询日志输出测试。
