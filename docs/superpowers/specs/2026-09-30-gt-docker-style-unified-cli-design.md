# Design Spec: gt CLI 统一 Docker 风格简洁命令体系设计

## 1. 概述与设计背景 (Overview)

Gemini Terminal CLI (`gt`) 现存命令在设计上存在一定的心智分裂：
1. 针对远程 Hub 上的节点与命令执行，采用了一级动词（如 `gt ps`、`gt exec`、`gt cp`、`gt prune`）。
2. 针对当前机器本身的 Agent 实例生命周期管理，此前被收敛在 `gt agent <run|ps|logs|stop|restart|rm|prune>` 二级命名空间下，用户直接敲直觉的 `gt run`、`gt stop` 时会被退出码 125 拦截。
3. 现有的 `gt logs` 语义此前绑定在远程单次任务执行日志上（`gt logs <node> [taskId]`），违背了 Docker 中 `docker logs` 专指容器/服务自身进程日志的心智模型。

本设计旨在**全面对标 Docker 经典扁平简洁命令体系（方案 A）**：
- 将本地 Agent 生命周期全面提升为顶级一级命令：`gt run`、`gt ps`、`gt logs`、`gt stop`、`gt restart`、`gt rm`、`gt prune`。
- 将远程异步执行任务规整到专职的 `gt task` 命名空间下（`gt task ls`、`gt task logs`、`gt task kill`）。
- 对原有用户习惯保持 100% 向后兼容与智能参数容错重定向，实现零心智负担、极度精简的统一体验。

---

## 2. 命令矩阵与交互规范 (Command Matrix)

### 2.1 本地 Agent 生命周期（扁平一级命令）

| 命令 | 参数/选项 | 功能说明 | 对标 Docker |
| :--- | :--- | :--- | :--- |
| **`gt run`** | `[-d\|--detach] [--name=NAME] [NAME]` | 启动本地反向终端 Agent。默认前台控制台直出；加 `-d` 以后台守护进程模式运行并打印 PID | `docker run -d` |
| **`gt ps`** | `[-a\|--all]`<br>`[-l\|--local]` | 默认列出已连接的远端节点；加 `-l`/`--local` 列出当前机器上运行的本地 Agent 实例（PID、状态、Hub、运行时长） | `docker ps` |
| **`gt logs`** | `[-f\|--follow] [-n 50] [NAME]` | **专职查看本地 Agent 自身的连接、PTY 与进程日志**（缺省名称时自动推导唯一定位实例） | `docker logs -f` |
| **`gt stop`** | `[NAME] [--all]` | 优雅停止本地 Agent 进程（SIGTERM ➔ 3秒超时 SIGKILL） | `docker stop` |
| **`gt restart`** | `[NAME]` | 重启指定的本地 Agent 守护进程 | `docker restart` |
| **`gt rm`** | `[NAME] [--all]` | 清理已停止（Stopped/Stale）的 Agent 状态文件及日志记录 | `docker rm` |
| **`gt prune`** | `[-l\|--local]`<br>`[-a\|--all]` | 默认清理远端离线主机节点；带 `-l` 清理本地已停止的 Agent 记录；带 `-a` 同时清理远端与本地 | `docker system prune` |

### 2.2 远程节点与任务管理 (Remote Nodes & Tasks)

| 命令 | 参数/选项 | 功能说明 |
| :--- | :--- | :--- |
| **`gt exec`** | `[-it] [-d] [-w <dir>] <node> <cmd...>` | 在远程节点上执行指令。若带 `-d`，打印任务 ID 并友好引导 `gt task logs` |
| **`gt cp`** | `<src> <dest>` | 本地与远程节点之间双向传输文件（支持 `<node>:<path>` 格式） |
| **`gt task ls`** | `<node> [--format <tpl>] [--json]` | 列出目标远程节点上最近执行的任务历史、状态与退出码 |
| **`gt task logs`** | `[-f] <node> [taskId]` | **专职查看/实时跟踪远程节点上的具体任务执行输出** |
| **`gt task kill`** | `[--signal <SIG>] <node> <taskId>` | 终止远程节点上运行中的特定任务 |

### 2.3 认证与配置 (Auth & Config)

| 命令 | 参数/选项 | 功能说明 |
| :--- | :--- | :--- |
| **`gt login`** | `[SERVER] [KEY]` | 验证并持久化凭据至 `~/.gt/config.json`（权限 0600） |
| **`gt logout`** | - | 清除本地存储的凭据信息 |
| **`gt config`** | `<list\|get\|set> [key] [val]` | 查看或修改本地客户端持久化配置项 |

---

## 3. 智能推导与向后兼容设计 (Smart Dispatching & Compatibility)

为确保从现有版本无缝升级且不打破任何已写入脚本的自动化行为，设计以下双向兼容与智能重定向机制：

1. **`gt logs` 智能分流**：
   - 当参数为：`gt logs [-f] [-n] [NAME]`（1 个目标名称或仅有标志位）：
     - 判定为本地 Agent 进程日志，调度 `AgentDaemonManager.getLogs()`。
   - 当参数为：`gt logs <node> <taskId>`（具有 2 个非选项位置参数，或明确带有远程特征）：
     - 自动检测并友好提示：`[Notice] Redirecting to 'gt task logs <node> <taskId>'...`，无缝转交至 `handleRemoteLogs()`，绝不阻断报错。
2. **`gt kill` 便捷保留**：
   - 顶层 `gt kill <node> <taskId>` 作为 `gt task kill <node> <taskId>` 的一级直通快捷方式继续完全支持。
3. **`gt agent <subcmd>` 完整命名空间兼容**：
   - 依然完整保留 `gt agent <run|ps|logs|stop|restart|rm|prune>` 作为规范命名空间别名，原有文档、CI 脚本与系统服务无需修改即可正常运转。
4. **`exec -d` 闭环交互引导**：
   - 当执行 `gt exec -d my-node <cmd...>` 返回任务 ID 时，追加一行提示：
     ```text
     Task started: 8f9b2a1c
     Run 'gt task logs -f my-node 8f9b2a1c' to follow output.
     ```

---

## 4. 架构实现与代码修改点 (Implementation Details)

### 4.1 `scripts/gt.js`
- **解除 `commandMigrationMap` 拦截**：
  - 移除原先在 `commandMigrationMap` 中将 `run`, `stop`, `restart`, `rm` 拦截报错的逻辑。
- **主调度器分流更新 (`main()`)**：
  - `case 'run'`: 映射至 `runAgent(['run', ...cmdArgs], { server, key, cliServer, cliKey })`。
  - `case 'stop'`: 直接调用本地停止逻辑 `AgentDaemonManager.stop(...)`。
  - `case 'restart'`: 直接调用本地重启逻辑。
  - `case 'rm'`: 直接调用本地移除逻辑 `AgentDaemonManager.remove(...)`。
  - `case 'ps'`: 检查 `cmdArgs` 是否含 `-l` / `--local`：
    - 若有：调用 `AgentDaemonManager.formatTable(...)` 显示本地实例；
    - 若无：调用 `handleRemotePs(...)` 显示远端主机。当本地存在运行中的 Agent 时输出提示：`Tip: Local daemon running. Run 'gt ps -l' to view local agents.`。
  - `case 'logs'`:
    - 检查位置参数个数，若为本地 Agent 语法（1 个参数以内或针对本地实例），调用 `AgentDaemonManager.getLogs(...)`。
    - 若包含 2 个位置参数，桥接至 `handleRemoteLogs(...)`。
  - `case 'prune'`:
    - 检查是否带 `-l` / `--local`：执行本地 Agent 清理；
    - 检查是否带 `-a` / `--all`：同时执行远端节点清理与本地已停止实例清理；
    - 默认执行远端离线节点清理。
  - `case 'task'`:
    - 强化对 `task logs`、`task kill`、`task ls` 的支持与错误提示。
- **帮助信息更新 (`printHelp()`)**：
  - 更新为全新 Docker 风格一级命令列表及分组说明。

### 4.2 前端与配置指引
- **`frontend/src/components/terminal/TerminalHostSelector.tsx`**：
  - 将空状态下的引导命令从 `gt login ... && gt agent run -d --name="my-server"` 简化为：
    ```bash
    gt login "<server>" "<key>" && gt run -d --name="my-server"
    ```

### 4.3 文档与测试套件
- **`CLAUDE.md` / `README.md`**：更新命令说明与示例。
- **`tests/gtManagementCommands.test.ts`**：
  - 移除断言 `gt run / stop / restart / rm` 返回 125 错误的旧测试用例；
  - 替换为断言其作为一级命令能够成功调度与执行。
- **`tests/gtAgentDaemon.test.ts`**：
  - 增加对一级命令 `gt run -d`、`gt ps -l`、`gt logs`、`gt stop`、`gt restart`、`gt rm`、`gt prune -l` 的完整覆盖。

---

## 5. 验��标准与测试计划 (Acceptance Criteria & Test Plan)

1. **基本命令直通验收**：
   - 执行 `gt run --help` 或 `gt run -d <name>`，不再提示 `Error: 'gt run' has been moved`，而是正常启动 Agent。
   - 执行 `gt stop <name>`、`gt restart <name>`、`gt rm <name>` 能正常管理本地 Agent。
2. **`gt ps` 与 `gt ps -l` 模式验收**：
   - `gt ps` 输出远程连接主机表格。
   - `gt ps -l` 输出本地 Agent 守护进程表格。
3. **`gt logs` 与 `gt task logs` 验收**：
   - `gt logs` 或 `gt logs <agent-name>` 输出本地 Agent 守护进程日志。
   - `gt task logs <node> <taskId>` 输出远程执行的任务输出。
   - `gt logs <node> <taskId>` 自动重定向并输出远程任务日志。
4. **清理命令验收**：
   - `gt prune -l` 成功清理本地停止的 Agent 记录。
   - `gt prune` 成功清理远端离线节点。
5. **回归测试保证**：
   - 全局 Jest 测试套件 `npm test` 全部通过，无回归破坏。
