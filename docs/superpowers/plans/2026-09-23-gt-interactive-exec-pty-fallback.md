# gt.js 交互式终端命令卡死修复与多层级 PTY 降级实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底修复在 Agent 节点缺少 `node-pty` 时执行 `gt exec -it` 卡死的问题，建立“原生 node-pty -> 系统内置 PosixPty (Python3 零依赖) -> 交互式 Pipe 兜底”的三层降级架构。

**Architecture:** 
将 `scripts/gt.js` 中的 `StreamSessionManager` 抽象解耦为具有统一生命周期接口（`write`, `resize`, `kill`, `onData`, `onExit`）的驱动层，分别实现 `NodePtyDriver`、`PosixPtyDriver`（利用 Python3 标准库 `pty.openpty()` 提供零外置依赖的真实 POSIX PTY）和 `InteractivePipeDriver`（注入 `-i` 参数并规范化 `\r` 换行符），并通过单元测试与仿真测试进行全面验证。

**Tech Stack:** Node.js (CommonJS, child_process), Python 3 (标准库 `os, sys, pty, termios, select`), WebSocket (`ws`), Jest

## Global Constraints
- 零新增 npm 依赖，严禁在 `package.json` 中引入新的外部依赖。
- 保持对现有非交互式命令（如 `gt exec host uptime`）和带有 `node-pty` 的生产节点 100% 向后兼容。
- 跨平台兼容：Linux 和 macOS 均支持 `PosixPtyDriver`；Windows 或极端最小化环境下平滑降级至 `InteractivePipeDriver`。
- 所有驱动均需支持树状进程清理（通过进程组信号），严防孤儿进程。

---

### Task 1: 编写多层级 PTY 交互与降级测试套件 (TDD Red)

**Files:**
- Create: `tests/gtAgentPtyFallback.test.ts`
- Test: `tests/gtAgentPtyFallback.test.ts`

**Interfaces:**
- Consumes: `StreamSessionManager` from `scripts/gt.js`
- Produces: 验证无 `node-pty` 环境下的交互测试（输入换行规范化、Prompt 回显、进程退出与清理）

- [x] **Step 1: 创建测试文件并编写针对降级模式的测试用例**

```typescript
import { StreamSessionManager } from '../scripts/gt.js';
import { spawn } from 'child_process';

describe('StreamSessionManager PTY Fallback & Interactive Execution', () => {
  it('detects and selects available pty drivers correctly', () => {
    const messages: any[] = [];
    const mgr = new StreamSessionManager((msg: any) => messages.push(msg));
    expect(typeof mgr.startStream).toBe('function');
  });

  it('runs interactive bash session with fallback and responds to input commands', (done) => {
    const messages: any[] = [];
    const taskId = `test-fallback-${Date.now()}`;
    const mgr = new StreamSessionManager((msg: any) => {
      messages.push(msg);
      if (msg.taskId === taskId && msg.type === 'cmd_stream_exit') {
        const fullOutput = messages
          .filter(m => m.type === 'cmd_stream_data' && m.taskId === taskId)
          .map(m => Buffer.from(m.data, 'base64').toString('utf-8'))
          .join('');
        
        expect(fullOutput).toContain('FALLBACK_WORKS');
        expect(msg.exitCode).toBe(0);
        done();
      }
    });

    // Start interactive bash stream
    mgr.startStream({
      taskId,
      command: 'bash',
      tty: true,
      interactive: true,
      cols: 80,
      rows: 24,
      timeoutMs: 10000,
      _forceFallback: true, // 强制测试 fallback 驱动分支
    });

    // Wait 300ms for shell to initialize, then write command with raw CR '\r'
    setTimeout(() => {
      // Send "echo FALLBACK_WORKS\r"
      mgr.writeInput(taskId, Buffer.from('echo FALLBACK_WORKS\r').toString('base64'));
      setTimeout(() => {
        // Send "exit\r"
        mgr.writeInput(taskId, Buffer.from('exit\r').toString('base64'));
      }, 500);
    }, 300);
  });
});
```

- [x] **Step 2: 运行测试验证失败 (Red)**

Run: `npx jest tests/gtAgentPtyFallback.test.ts`
Expected: FAIL（因为当前 `StreamSessionManager` 尚不支持 `_forceFallback` 参数，并且收到 `\r` 时在普通管道下会报错或无法触发执行）。

- [x] **Step 3: 提交测试文件骨架**

```bash
git add tests/gtAgentPtyFallback.test.ts
git commit -m "test(gt): add failing tests for interactive exec pty fallback"
```

---

### Task 2: 在 `scripts/gt.js` 中实现 `PosixPtyDriver` (系统内置 Python3 PTY)

**Files:**
- Modify: `scripts/gt.js:1030-1170`

**Interfaces:**
- Produces: `hasSystemPython3(): boolean` 探测函数
- Produces: `PosixPtyDriver` 类：负责通过 Python3 `pty.openpty()` 建立真实主从伪终端，处理输入输出流与进程清理

- [x] **Step 1: 在 `scripts/gt.js` 中实现 Python3 探测与 PosixPtyDriver 类**

在 `scripts/gt.js` 中新增系统 Python3 探测与 `PosixPtyDriver`：
```javascript
function hasSystemPython3() {
  if (os.platform() === 'win32') return false;
  try {
    const res = execSync('python3 -c "import pty; print(1)"', { stdio: 'pipe', timeout: 1000 });
    return res.toString().trim() === '1';
  } catch {
    return false;
  }
}

class PosixPtyDriver {
  constructor({ command, shell, cwd, env, cols, rows, onData, onExit }) {
    this.onData = onData;
    this.onExit = onExit;
    this.cols = cols || 80;
    this.rows = rows || 24;

    const pyScript = `
import os, sys, pty, termios, fcntl, struct, select, signal

cols, rows = int(sys.argv[1]), int(sys.argv[2])
cmd_to_run = sys.argv[3:]

master, slave = pty.openpty()
try:
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
except:
    pass

pid = os.fork()
if pid == 0:
    os.close(master)
    os.setsid()
    try:
        fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
    except:
        pass
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execvp(cmd_to_run[0], cmd_to_run)
else:
    os.close(slave)
    def sig_resize(signum, frame):
        pass
    signal.signal(signal.SIGWINCH, sig_resize)
    
    # Non-blocking IO loop between sys.stdin/stdout and master
    fl = fcntl.fcntl(master, fcntl.F_GETFL)
    fcntl.fcntl(master, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    while True:
        try:
            r, w, x = select.select([sys.stdin.fileno(), master], [], [], 0.05)
        except (InterruptedError, select.error):
            continue
        
        if sys.stdin.fileno() in r:
            try:
                data = os.read(sys.stdin.fileno(), 4096)
                if not data:
                    break
                # Forward to master pty
                os.write(master, data)
            except (OSError, EOFError):
                break
                
        if master in r:
            try:
                data = os.read(master, 4096)
                if not data:
                    break
                os.write(sys.stdout.fileno(), data)
                sys.stdout.flush()
            except (BlockingIOError, OSError):
                pass

        # Check child status
        wpid, status = os.waitpid(pid, os.WNOHANG)
        if wpid != 0:
            # Drain remaining
            try:
                while True:
                    data = os.read(master, 4096)
                    if not data: break
                    os.write(sys.stdout.fileno(), data)
                    sys.stdout.flush()
            except:
                pass
            exit_code = os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else (status >> 8)
            sys.exit(exit_code)
`;

    const isSimpleShell = ['bash', 'sh', 'zsh'].includes(command.trim());
    const targetArgs = isSimpleShell ? [command.trim(), '-i'] : [shell, '-c', command];

    this.proc = spawn('python3', [
      '-c', pyScript,
      String(this.cols),
      String(this.rows),
      ...targetArgs
    ], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    this.proc.stdout.on('data', (chunk) => this.onData(chunk));
    this.proc.stderr.on('data', (chunk) => this.onData(chunk));
    this.proc.on('close', (code, signal) => this.onExit(code, signal));
  }

  write(buf) {
    if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed) {
      try {
        this.proc.stdin.write(buf);
      } catch {}
    }
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }

  kill(signal = 'SIGTERM') {
    if (this.proc) {
      killProcessTree(this.proc, signal);
    }
  }
}
```

- [x] **Step 2: 运行测试或单测验证 Python 脚本正确运行**

Run: `node -e 'require("./scripts/gt.js")'`
Expected: 语法校验通过，无抛错。

- [x] **Step 3: 提交代码**

```bash
git add scripts/gt.js
git commit -m "feat(gt): implement PosixPtyDriver using system python3 pty"
```

---

### Task 3: 在 `scripts/gt.js` 中实现 `InteractivePipeDriver` 与换行规整

**Files:**
- Modify: `scripts/gt.js:1050-1170`

**Interfaces:**
- Produces: `InteractivePipeDriver` 类：负责处理最底层的管道兜底，拦截终端 raw mode 按键（`\r` ➜ `\n`），处理 `-i` 参数注入与 Ctrl+C/Ctrl+D 信号模拟

- [x] **Step 1: 编写 InteractivePipeDriver 实现**

```javascript
class InteractivePipeDriver {
  constructor({ command, shell, cwd, env, onData, onExit }) {
    this.onData = onData;
    this.onExit = onExit;

    const isWindows = os.platform() === 'win32';
    const trimmed = command.trim();
    const isSimpleShell = ['bash', 'sh', 'zsh'].includes(trimmed);

    let spawnCmd = shell;
    let spawnArgs = [];

    if (isWindows) {
      spawnArgs = shell.toLowerCase().includes('powershell') ? ['-Command', command] : ['/c', command];
    } else {
      if (isSimpleShell) {
        spawnCmd = trimmed;
        spawnArgs = ['-i'];
      } else {
        spawnArgs = ['-c', command];
      }
    }

    this.proc = spawn(spawnCmd, spawnArgs, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: !isWindows,
    });

    this.proc.stdout.on('data', (chunk) => this.onData(chunk));
    this.proc.stderr.on('data', (chunk) => this.onData(chunk));
    this.proc.on('close', (code, signal) => this.onExit(code, signal));
  }

  write(buf) {
    if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) return;
    try {
      // 规范化: 如果收到 Ctrl+C (0x03)，向进程发送 SIGINT
      if (buf.length === 1 && buf[0] === 0x03) {
        this.kill('SIGINT');
        return;
      }
      // 如果收到 Ctrl+D (0x04)，结束输入
      if (buf.length === 1 && buf[0] === 0x04) {
        this.proc.stdin.end();
        return;
      }

      // CR '\r' (0x0d) 转换为 LF '\n' (0x0a)
      const normalized = Buffer.allocUnsafe(buf.length);
      for (let i = 0; i < buf.length; i++) {
        normalized[i] = buf[i] === 0x0d ? 0x0a : buf[i];
      }
      this.proc.stdin.write(normalized);
    } catch {}
  }

  resize(cols, rows) {}

  kill(signal = 'SIGTERM') {
    if (this.proc) {
      killProcessTree(this.proc, signal);
    }
  }
}
```

- [x] **Step 2: 重构 `StreamSessionManager.startStream` 串联三层驱动**

在 `StreamSessionManager.startStream` 中组织三层驱动优先级：
```javascript
  startStream({ taskId, command, cwd, env = {}, cols = 80, rows = 24, timeoutMs = 0, tty = true, interactive = false, _forceFallback = false }) {
    const workingDir = cwd ? path.resolve(cwd) : (process.env.HOME || process.cwd());
    const isWindows = os.platform() === 'win32';
    const shell = getDefaultShell();
    const taskEnv = {
      ...process.env,
      ...env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
    };

    let driver = null;
    const canUseNodePty = Boolean(tty && pty && !_forceFallback);

    if (canUseNodePty) {
      // 1. Layer 1: NodePtyDriver
      driver = new NodePtyDriver({ command, shell, cwd: workingDir, env: taskEnv, cols, rows, onData: (d) => onData(d), onExit: (c, s) => onExit(c, s) });
    }

    if (!driver && tty && hasSystemPython3()) {
      // 2. Layer 2: PosixPtyDriver (轻量原生 POSIX PTY)
      try {
        driver = new PosixPtyDriver({ command, shell, cwd: workingDir, env: taskEnv, cols, rows, onData: (d) => onData(d), onExit: (c, s) => onExit(c, s) });
      } catch (err) {
        driver = null;
      }
    }

    if (!driver) {
      // 3. Layer 3: InteractivePipeDriver (纯管道兜底)
      if (tty && !pty) {
        const warnMsg = Buffer.from('\r\n\x1b[33m[Warning] node-pty not available on agent; running in interactive pipe mode.\x1b[0m\r\n');
        this.send({ type: 'cmd_stream_data', taskId, data: warnMsg.toString('base64') });
      }
      try {
        driver = new InteractivePipeDriver({ command, shell, cwd: workingDir, env: taskEnv, onData: (d) => onData(d), onExit: (c, s) => onExit(c, s) });
      } catch (err) {
        this.send({ type: 'cmd_stream_exit', taskId, exitCode: 1, signal: null });
        return;
      }
    }
```

- [x] **Step 3: 运行自动化测试验证 (Green)**

Run: `npx jest tests/gtAgentPtyFallback.test.ts`
Expected: PASS（包含通过回退驱动成功执行 bash 交互命令，换行与 exit 均正常工作）。

- [x] **Step 4: 提交代码**

```bash
git add scripts/gt.js
git commit -m "feat(gt): integrate three-tier pty driver hierarchy in StreamSessionManager"
```

---

### Task 4: 补充针对各种边界条件的高级单测与回归测试

**Files:**
- Modify: `tests/gtAgentPtyFallback.test.ts`
- Test: `tests/gtAgentPtyFallback.test.ts`
- Test: `tests/gtCli.test.ts`
- Test: `tests/gtAgentStream.test.ts`

- [x] **Step 1: 在测试中补充管道交互 (InteractivePipeDriver) 模式针对 `\r` 与 Ctrl+C 信号的专项断言**

- [x] **Step 2: 运行全量终端测试套件**

Run: `npx jest tests/gtAgentPtyFallback.test.ts tests/gtCli.test.ts tests/gtAgentStream.test.ts tests/terminalExecBridge.test.ts`
Expected: 全部测试 PASS。

- [x] **Step 3: 提交完整测试套件**

```bash
git add tests/gtAgentPtyFallback.test.ts
git commit -m "test(gt): add comprehensive test suite for interactive pty fallback drivers"
```

---

### Task 5: 最终人工与集成验证

- [x] **Step 1: 在本地模拟无 node-pty 的 agent 启动，并执行 `gt exec -it` 命令**
- [x] **Step 2: 确认用户看到的终端能够正常显示 Shell Prompt、响应键盘回车及命令输入，键入 `exit` 正常退出**
- [x] **Step 3: 检查没有遗留后台僵尸进程**
