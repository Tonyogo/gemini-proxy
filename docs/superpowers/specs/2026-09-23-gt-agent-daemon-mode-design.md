# Design Spec: gt agent 后台守护进程运行与 Docker 风格生命周期管理

## 1. 背景与现状

Gemini Terminal CLI (`gt`) 包含一个核心逆向代理守护进程命令 `gt agent`。该命令用于在远程节点或宿主机上启动反向代理 Agent，建立长连接 WebSocket 并上报主机状态与接受执行指令。

目前存在两个主要问题：
1. **仅支持前台运行**：启动后进程持续占用终端 Standard I/O，一旦关闭终端窗口或 SSH 断开，进程就会收到 SIGHUP 并退出。用户需要借助外部工具（如 `nohup`、`screen`、`tmux` 或 `pm2`）才能使其在后台常驻运行，缺乏类似 `docker run -d` 那样原生的后台启动、状态查询、日志排查和停止控制能力。
2. **认证源冲突风险**：原有 `gt agent` 允许独立传递 `--server` 和 `--key`，这与 `gt auth login`（持久化在 `~/.gt/config.json` 中的全局认证凭据）以及环境变量存在多头冲突，易导致节点接入错误集群或凭证漂移。

## 2. 目标与设计原则

- **核心目标**：
  1. 使 `gt agent` 具备原生、自包含、全平台的 Docker-style 后台守护进程（Daemon）管理能力，支持后台启动、状态监控、日志跟踪与生命��期控制。
  2. **统一认证源，彻底移除 `--server` 与 `--key` 参数**：Agent 统一走 `gt auth login` 认证体系（读取 `ConfigStore`），无有效认证时明确阻断并引导登录，彻底杜绝配置冲突。
- **设计原则**：
  1. **单一信源 (Single Source of Truth)**：`gt agent` 强制统一依赖登录凭证（`gt auth login`），若未登录则提示 `Error: No authenticated server found. Please run 'gt auth login <server> <key>' first.` 并以状态码 1 退出。
  2. **零外部依赖 (Zero Dependency)**：纯 Node.js 标准库实现（`child_process.spawn` + `detached: true` + `unref()`），随 `scripts/gt.js` 单文件即开即用，无需额外安装 npm 包或依赖特定系统工具。
  3. **Docker 风格子命令直觉 (Docker-Style Ergonomics)**：提供 `start` / `-d`、`stop`、`restart`、`status` (或 `ps`)、`logs` (`-f`) 等直观命令。
  4. **严密的状态与进程组管理 (Robust State Management)**：统一持久化于 `~/.gt/agent.json` 与 `~/.gt/agent.log`，具备防重复启动锁定与优雅退出机制。

## 3. CLI 语法与命令规范

### 3.1 语法形式

```bash
gt agent [SUBCOMMAND|OPTIONS] [OPTIONS...]
```

### 3.2 支持的子命令与参数

| 指令 | 作用与说明 | 典型行为 |
| :--- | :--- | :--- |
| `gt agent [options]` | **默认前台运行**：日志实时直出到终端，Ctrl+C 退出 | 从登录配置读取 server/key，保持实时输出 |
| `gt agent -d [options]`<br>`gt agent start [options]` | **后台守护进程启动**：主进程派生独立子进程并记录状态后立即以退出码 0 返回 | 打印后台 PID、主机名称及日志文件位置，提示 `gt agent logs -f` |
| `gt agent status`<br>`gt agent ps` | **查看后台 Agent 状态**：检查进程存活状态与元数据 | 格式化表格显示：状态 (Running/Stopped)、PID、名称、主机 ID、运行时长、Hub 地址 |
| `gt agent stop` | **优雅停止后台 Agent**：读取状态，发送 SIGTERM，超时发送 SIGKILL，并清理状态 | 等待退出并输出 `Agent (PID: ...) stopped.` |
| `gt agent restart [options]` | **重启后台 Agent**：停止现有运行中的实例，并重新以后台模式拉起 | 先优雅停止再重新派生新进程 |
| `gt agent logs [-f] [-n <lines>]` | **查看后台日志**：输出尾部 `n` 行（默认 50），支持 `-f` 实时跟踪日志流 | Ctrl+C 退出跟踪，不影响后台进程运行 |

### 3.3 参数清理与支持列表
- **彻底废除与禁止参数**：
  - ❌ `--server`, `-s`：已移除。若传入则报错提示：`Error: '--server' is removed. Please use 'gt auth login <server> <key>' to authenticate.`
  - ❌ `--key`, `-k`：已移除。若传入则报错提示：`Error: '--key' is removed. Please use 'gt auth login <server> <key>' to authenticate.`
- **支持的 Agent 参数**：
  - `--name <hostName>`：指定节点展示名称（默认由 hostname+随机串生成）
  - `--id <hostId>`：指定节点唯一 ID（默认由随机字节生成）
  - `--log-file <path>`：自定义后台标准输出日志路径（默认 `~/.gt/agent.log`）
  - `-d, --detach`：触发后台守护进程模式启动

## 4. 认证机制与启动前置检查

在启动 Agent（无论前台还是后台模式）时，执行严格的认证凭证校验流程：

```text
gt agent [start/-d]
       │
       ▼
读取 ConfigStore.getEffectiveConfig()
       │
       ├─► 是否有有效 server URL？ ──[否]──► 抛错并提示 'gt auth login <server> <key>'，退出码 1
       │
       ├─► 是否有有效 key？ ─────────[否]──► 抛错并提示 'gt auth login <server> <key>'，退出码 1
       │
       ▼ [校验通过]
继续执行前台/后台启动逻辑
```

## 5. 架构与进���解耦设计

```text
[用户输入: gt agent -d / gt agent start ...]
                   │
                   ▼
     [前置认证检查: ConfigStore 是否已登录]
                   │
       [检查 ~/.gt/agent.json 状态锁]
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
  [检测到存活 PID]        [无存活 Agent / 过期锁]
 输出"已在运行", 退出1       清理过期文件, 准备启动
                               │
                               ▼
               [打开/创建 ~/.gt/agent.log (append fd)]
                               │
                               ▼
               [child_process.spawn 派生]
               • execPath: process.execPath (node)
               • script: scripts/gt.js
               • args: ['agent', '--internal-daemon', ...filteredArgs]
               • stdio: ['ignore', logFd, logFd]
               • detached: true
                               │
                               ▼
               [childProcess.unref()] (解除事件循环引用)
                               │
                               ▼
               [写入 ~/.gt/agent.json (记录 PID, 启动时间, server 等)]
                               │
                               ▼
               [主进程终端打印 Agent PID 与提示, exit 0]
```

### 关键细节说明：
1. **脱离前台会话 (Decoupling Session)**：
   - 设置 `detached: true`。在 Linux/macOS 上将创建新的独立 session (`setsid()`)，彻底断开与父终端会话及 SIGHUP 的关联。
   - `stdio: ['ignore', logFd, logFd]` 将后台的标准输出和标准错误全部无阻塞追加写入日志文件，避免因管道缓冲区填满导致后台挂起。
   - `child.unref()` 释放 Node.js 对子进程事件循环的持有，让启动 CLI 在数毫秒内干净退出。
2. **内部守护进程标记 (`--internal-daemon`)**：
   - 派生的子进程通过私有参数 `--internal-daemon` 识别自身为后台实例，并在进程异常崩溃时确保写回日志。

## 6. 状态存储与日志规范

状态文件和日志统一存放于 `ConfigStore.getConfigDir()`（默认为 `~/.gt/`，可通过环境变量 `GT_CONFIG_DIR` 自定义以方便隔离测试）：

### 6.1 `~/.gt/agent.json` (状态文件)
```json
{
  "pid": 58210,
  "hostId": "agent-f709ff3fad51",
  "name": "srv-beijing-01",
  "server": "http://127.0.0.1:3000",
  "startedAt": 1727092800000,
  "logFile": "/Users/yogo/.gt/agent.log",
  "args": ["--name=srv-beijing-01"]
}
```

### 6.2 状态检测与生命周期控制
- **存活探测**：使用 `process.kill(pid, 0)` 无害探测信号；若抛出 `ESRCH` 则表示进程已不存在；若存活则继续判断。
- **停止逻辑 (`stop`)**：
  1. 向目标 PID 发送 `SIGTERM`。
  2. 循环轮询状态（100ms 间隔，最大超时 3000ms）。
  3. 若 3000ms 未退出，使用 `killProcessTreeSync(pid, 'SIGKILL')` 强制终止。
  4. 进程退出后，安全删除 `agent.json`。

### 6.3 日志查看与跟随 (`logs`)
- `gt agent logs -n 50`：读取日志文件末尾 50 行并打印到终端。
- `gt agent logs -f`：使用流式读取，在打印已有尾部内容后建立文件变更轮询与追加输出，捕获 `SIGINT` 时安全退出并不影响后台 agent。

## 7. 测试与验证方案

1. **测试套件 (`tests/gtAgentDaemon.test.ts`)**：
   - 验证在未登录时执行 `gt agent` / `gt agent -d` 被正确拦截并提示 `gt auth login`。
   - 验证传入 `--server` 或 `--key` 时明确报错并提示移除。
   - 验证登录后 `gt agent -d` 能在秒级完成后台派生并在 `agent.json` 中记录存活 PID 与统一 Server 配置。
   - 验证 `gt agent status` / `gt agent ps` 的格式化输出与状态判定。
   - 验证重复执行 `gt agent -d` 时触发状态保护并以非 0 退出。
   - 验证 `gt agent logs` 能正常抓取到已追加输出的连接日志。
   - 验证 `gt agent stop` 能够成功终止后台进程并清理状态文件。
   - 验证 `gt agent restart` 能完成旧实例替换并更新元数据。
2. **回归测试**：
   - 运行 `tests/gtCli.test.ts`、`tests/gtAgentPtyFallback.test.ts`，确保对现有其它子命令零破坏。
