# PTY Fallback 动态尺寸自适应修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复移动端连接处于兼容兜底模式（Layer 2 `PosixPtyDriver` Python 3 仿真虚拟终端）的 Agent 节点时，终端尺寸无法动态适配移动端屏幕的缺陷，实现全平台全自动自适应。

**Architecture:** 在 `PosixPtyDriver` 中利用 Node.js `child_process.spawn` 的第 4 个标准 I/O 管道（`stdio[3]`）建立 Node.js 与 Python 3 伴生进程之间的双向/控制通信信道。当客户端发出终端 resize 时，通过该信道发送控制指令，Python 进程在 `select` 事件循环中接收后，对虚拟终端 `master` 描述符执行 `ioctl(TIOCSWINSZ)` 系统调用，触发 Linux 内核向目标 Shell 发送 `SIGWINCH` 信号，从而让远程 Shell 动态且完美适配移动端视口宽度与高度。

**Tech Stack:** Node.js (`child_process`), Python 3 (`pty`, `termios`, `fcntl`, `struct`, `select`), Jest / TypeScript.

---

## 1. 目标与背景 (Goal Description)

### 背景与问题根因
在目前的 `scripts/gt.js` 中，Agent 的 PTY 驱动具备三层降级机制：
1. **Layer 1: `NodePtyDriver`**（原生 `node-pty` C++ 扩展）：支持原生 `resize`，通过系统底层 `ioctl(TIOCSWINSZ)` 响应移动端尺寸调整。
2. **Layer 2: `PosixPtyDriver`**（Python 3 `pty.openpty()` 兼容模式）：针对未安装 `node-pty` 的机器（如通过 `install-gt.sh` 单脚本直接安装的机器），利用 Python 标准库模拟 PTY。
3. **Layer 3: `InteractivePipeDriver`**（纯标准 I/O 管道兜底）：当既无 `node-pty` 又无 `python3` 时使用。

**问题根因：**
在 Layer 2 [`PosixPtyDriver`](file:///home/liyatao001/gemini-proxy/scripts/gt.js#L1476) 中，`resize(cols, rows)` 仅更新了 JavaScript 内存中的 `this.cols` 和 `this.rows`，**并未与底层的 Python 伴生进程建立尺寸同步通道**；同时 Python 脚本内部启动时按固定的 80x24 初始化，导致终端视口被永久锁定在 80 列，移动端浏览器即使调用了 `fitAddon.fit()` 并发送了 resize 帧，远端 Shell（bash/zsh）也无法感知，出现文字溢出、换行错乱与光标漂移。

### 预期达成效果
通过修复 `PosixPtyDriver` 的控制通道与 Python 内部的 `ioctl(TIOCSWINSZ)`，使得所有仅安装了 Python 3（无需任何 C++ 编译器与额外 npm 模块）的 Linux 机器在移动端打开终端时，均能自动按手机屏幕列数/行数重新排版并实时自适应。

---

## 2. 用户审核重点 (User Review Required)

> [!NOTE]
> - **零第三方依赖侵入**：采用 Linux/POSIX 原生管道文件描述符 `stdio[3]` 与 Python 标准库（`fcntl`/`termios`/`struct`），不需要在目标机上额外安装任何 npm 包或 Python pip 包。
> - **完全向下兼容**：已有运行在原生 `node-pty` 的机器行为保持不变；兼容模式下的标准输入输出（stdin/stdout/stderr）二进制流不受任何影响。

---

## 3. 待讨论或澄清问题 (Open Questions)

- **Q1: 是否需要优化 `install-gt.sh`？**
  - **建议**：在 `install-gt.sh` 安装完成后输出提示，明确告知当前运行环境检测结果（如已检测到 Python 3，将自动提供完整的动态自适应 PTY 功能）。

---

## 4. 拟定代码改动 (Proposed Changes)

### Component: Backend Agent CLI (`scripts/gt.js`)

#### [MODIFY] `scripts/gt.js`
- **改造 `PosixPtyDriver`**：
  1. 在 `this.proc = spawn('python3', ...)` 的 `stdio` 配置中增加第 4 个管道：
     ```javascript
     stdio: ['pipe', 'pipe', 'pipe', 'pipe'] // stdin, stdout, stderr, ctlPipe (fd 3)
     ```
  2. 保存 `this.ctlStream = this.proc.stdio[3]`，并在 JS 侧实现健壮的 `resize(cols, rows)`：
     ```javascript
     resize(cols, rows) {
       this.cols = Math.max(10, Math.min(500, cols || 80));
       this.rows = Math.max(5, Math.min(200, rows || 24));
       if (this.ctlStream && !this.ctlStream.destroyed && !this.ctlStream.writableEnded) {
         try {
           this.ctlStream.write(`RESIZE ${this.cols} ${this.rows}\n`);
         } catch {}
       }
     }
     ```
  3. 在内嵌的 `pyScript` Python 代码中：
     - 在父进程初始化中声明 `ctl_fd = 3`，设置 `os.O_NONBLOCK`；
     - 将 `ctl_fd` 加入 `select.select([master, stdin_fileno, ctl_fd], ...)` 读就绪监听集合中；
     - 收到控制数据后，逐行解析 `RESIZE <cols> <rows>`；
     - 调用 `fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))` 动态刷新虚拟终端窗口；
     - 处理 `ctl_fd` 的 EOF 和异常安全释放。
  4. 在 `PosixPtyDriver.kill()` 中关闭 `ctlStream`。
- **改造 `InteractivePipeDriver`**：
  - 维护 `this.cols` 和 `this.rows`，避免未定义属性访问。

---

### Component: Automated Tests (`tests/gtAgentPtyFallback.test.ts`)

#### [MODIFY] `tests/gtAgentPtyFallback.test.ts`
- 增加专门的 `PosixPtyDriver` 动态 `resize` 测试用例：
  - 启动强制兼容模式（`_forceFallback: true`）的交互式 bash 任务，初始尺寸设为 80x24；
  - 延时发送 `mgr.resize(taskId, 45, 18)`；
  - 写入 `stty size\r`；
  - 断言输出结果中准确包含 `18 45`（证明内核 PTY 窗口与 bash 已成功同步新尺寸）。

---

## 5. 验证计划 (Verification Plan)

### 自动化测试 (Automated Tests)
- 运行针对 PTY 兜底驱动的专项测试集：
  ```bash
  npm test tests/gtAgentPtyFallback.test.ts
  ```
- 运行整体测试套件确保无回归：
  ```bash
  npm test
  ```

### 手动验证 (Manual Verification)
1. 在终端中模拟移动端视口触发 resize：
   - 使用 Node.js 启动 `gt.js` 的 `PosixPtyDriver` 并监听控制帧，发送移动端典型分辨率尺寸（如 38 列 x 25 行）；
   - 在远程终端中执行 `stty size` 与 `echo $COLUMNS $LINES`，确认其值立即变为 `25 38`；
   - 输入长命令测试折行，验证是否在第 38 列正常折行而非溢出。
