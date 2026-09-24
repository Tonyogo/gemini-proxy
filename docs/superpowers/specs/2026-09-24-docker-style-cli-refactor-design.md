# Docker 风格命令行体系重构设计规范 (gt CLI Refactoring Spec)

- **创建日期**: 2026-09-24
- **状态**: Approved (待实施)
- **目标组件**: `scripts/gt.js`, `tests/gt*.test.ts`, `CLAUDE.md`, 前端空状态引导组件

---

## 1. 背景与目标

`gt` (Gemini Terminal) 是集成了远程终端管理、多机反向代理、分布式异步任务执行、双向文件传输的统一命令行工具。

在历史演进中，命令层级存在以下心智模型不一致的问题：
1. **核心受众对象（Subject）混淆**：
   - 顶层的 `gt ps` / `gt logs` / `gt run` / `gt stop` 先前指向的是**本地单机 Agent 守护进程**；
   - 而高频使用的 `gt exec` / `gt cp` 指向的却是**远程 Hub 上的分布式 Node 节点**；
   - 查看远���任务日志却被迫写成 `gt task logs <host> <id>`。
2. **命令冗余**：
   - `gt auth login` / `gt auth logout` 比标准的 `docker login` 显得啰嗦。

**重构目标**：
参考 Docker 经典命令设计，**将“远程 Node 节点及远程操作”确立为第一公民**，把本地 Agent 管理收敛在 `gt agent` 命名空间下。实现极致简洁、直��、统一的体验。

---

## 2. 命令设计全景 (Command Hierarchy)

### 2.1 远程管理第一公民 (Top-Level Docker-Style Verbs)

所有一级高频命令均直接作用于远程 Hub 和 Node 节点：

| 命令 | 完整语法与选项 | 对应 Docker 习惯 | 行为描述 |
| :--- | :--- | :--- | :--- |
| **`gt ps`** | `gt ps [-a\|--all] [--json] [--format <tpl>]` | `docker ps` | 列出 Hub 上的远程节点。**默认仅显示 online 节点**；`-a` 或 `--all` 显示全部节点。支持模板和 JSON。 |
| **`gt exec`** | `gt exec [-it] [-d] [-w <dir>] [-e K=V] <node> <cmd...>` | `docker exec` | 在指定远端节点上执行命令。支持交互式终端 (`-it`) 与后台异步任务 (`-d`)。 |
| **`gt logs`** | `gt logs [-f] [--poll-interval <ms>] <node> [taskId]` | `docker logs` | 查看或跟踪远端执行任务的日志。**缺省 `taskId` 时自动解析为该节点最近执行的一个任务**。支持短 ID 模糊前缀匹配。 |
| **`gt kill`** | `gt kill [--signal <SIG>] <node> <taskId>` | `docker kill` | 终止远程节点上运行的任务进程（默认发送 `SIGTERM`）。支持短 ID 模糊匹配。 |
| **`gt cp`** | `gt cp <src> <dest>` | `docker cp` | 在本地与远程节点之间双向复制文件 (`node:/path` 语法)。 |
| **`gt prune`** | `gt prune [--json]` | `docker system prune` | 清理并移除 Hub 上断开连接已离线的所有节点记录。 |
| **`gt task ls`** | `gt task ls <node> [--json] [--format <tpl>]` | `docker service ps` | 列出目标远程节点上的近期任务历史及执行状态。 |

### 2.2 凭据与配置 (Authentication & Configuration)

| 命令 | 完整语法 | 说明 |
| :--- | :--- | :--- |
| **`gt login`** | `gt login [SERVER] [KEY]` | 连接验证并持久化远端 Hub 地址与密钥至 `~/.gt/config.json`（权限 0600）。 |
| **`gt logout`** | `gt logout` | 清除配置文件中的密钥凭据。 |
| **`gt config`** | `gt config <list\|get\|set> [key] [val]` | 查看或设置本地 CLI 配置项。 |

### 2.3 本地 Agent 守护进程 (Local Agent Namespace)

所有针对当前机器作为 Agent 接入 Hub 的常驻守护进程管理，统一收敛在 `gt agent` 下：

| 命令 | 完整语法与选项 | 行为描述 |
| :--- | :--- | :--- |
| **`gt agent run`** | `gt agent run [-d] [NAME]` | 启动本地反向终端 Agent。缺省 `-d` 时在前台运行并输出控制台日志；指定 `-d` 时以守护进程后台运行。 |
| **`gt agent ps`** | `gt agent ps` | 列出当前机器上已记录的本地 Agent 进��、PID、目标 Hub 与运行状态。 |
| **`gt agent logs`** | `gt agent logs [-f] [-n <lines>] [NAME]` | 查看或跟踪本地 Agent 自身的连接、PTY 与守护进程日志。 |
| **`gt agent stop`** | `gt agent stop [NAME] [--all]` | 停止正在运行的本地 Agent 进程（SIGTERM ➔ SIGKILL 超时保护）。 |
| **`gt agent restart`** | `gt agent restart [NAME]` | 重启指定的本地 Agent 守护进程。 |
| **`gt agent rm`** | `gt agent rm [NAME] [--all]` | 清理已停止本地 Agent 的 JSON 状态与 `.log` 文件。 |

---

## 3. 兼容性、迁移拦截与退出码规范

### 3.1 严格迁移拦截 (Strict Migration Interception)
为彻底理清心智模型，防止混淆本地与远端，当用户在顶层输入已被收敛入 `gt agent` 的旧命令时，CLI 返回退出码 `125` 并输出精准引导信息：

```text
Error: 'gt <cmd>' has been moved to 'gt agent <cmd>'.
Run 'gt agent <cmd>' instead.
Run 'gt --help' for modern Docker-style command usage.
```

被拦截重定向的顶层命令清单：
- `gt run` ➔ `gt agent run`
- `gt stop` ➔ `gt agent stop`
- `gt restart` ➔ `gt agent restart`
- `gt rm` ➔ `gt agent rm`
- `gt hosts` / `gt nodes` ➔ `gt ps`

### 3.2 透明无痛别名兼容 (Transparent Silent Aliases)
为确保已有自动化脚本（如 CI/CD 流水线、脚本别名）持续可用：
- `gt host ls` / `gt node ls` ➔ 内部静默转发给 `gt ps` 处理；
- `gt host prune` / `gt node prune` ➔ 内部静默转发给 `gt prune` 处理；
- `gt auth login` ➔ 内部静默转发给 `gt login` 处理；
- `gt auth logout` ➔ 内部静默转发给 `gt logout` 处理；
- `gt task logs` ➔ 内部静默转发给 `gt logs` 处理；
- `gt task kill` ➔ 内部静默转发给 `gt kill` 处理。

### 3.3 退出码规范 (Exit Codes)
- `0`：成功执行完毕。
- `1`：运行时/网络/业务错误（节点离线、短 ID 冲突、命令超时失败等）。
- `125`：CLI 参数解析错误、缺少必选参数、调用迁移命令拦截。
- `130`：用户使用 `Ctrl+C` 中断流式日志或交互式终端退出。

---

## 4. 详细行为实现规范 (Implementation Details)

### 4.1 `gt ps`
- 请求 Hub 接口：`GET /api/terminal/hosts`；
- 过滤机制：
  - 默认过滤 `host.status === 'online'`；
  - 若携带 `-a` 或 `--all`，不过滤直接展示全部；
- 表头样式统一：
  `NODE ID`、`NAME`、`STATUS`、`PLATFORM`、`IP`、`LAST SEEN`。

### 4.2 `gt logs <node> [taskId]` 缺省智能推断
- 如果命令行没有提供 `taskId`：
  1. 调用 `GET /api/terminal/exec/:node` 获取节点任务列表 `tasks`；
  2. 若任务列表为空，输出友好错误并以退出码 `1` 退出：`No tasks found on node [<node>].`；
  3. 取最新任务 `tasks[0].taskId` 作为目标任务；
  4. 继续原有日志打印 / `-f` 增量长轮询逻辑。

### 4.3 `gt kill <node> <taskId>`
- 支持通过 `resolveHost` 解析 `node` 名称或 ID；
- 支持从最近任务列表进行 `taskId` 短 ID 前缀模糊匹配（避免用户手动敲 32 位长字符串）；
- 请求 `POST /api/terminal/exec/:nodeId/:taskId/kill`，支持 `--signal` 参数传递自定义信号。

---

## 5. 改动范围与文件清单

1. **`scripts/gt.js`**：
   - 帮助说明文本更新（`printHelp`）；
   - 主命令解析器分发更新（`main` 函数中添加 `ps`, `logs`, `kill`, `login`, `logout`, `prune` 一级分支，迁移提示列表 `commandMigrationMap`）；
   - 调整 `gt ps` 在线过滤及 `-a` 支持；
   - 调整 `gt logs` 缺省 taskId 自动推断实现；
   - 确保 `agent` 子命令体系完备（`agent run`, `agent ps`, `agent logs`, `agent stop`, `agent restart`, `agent rm`）。
2. **测试用例 (`tests/`)**：
   - `tests/gtManagementCommands.test.ts`：全面更新断言，测试一级 `ps`、`logs`、`login` 以及顶层 `run`/`stop` 触发���移报错 125；
   - `tests/gtCli.test.ts` / `tests/gtAgentDaemon.test.ts`：更新测试脚本中旧的调用习惯；
   - 新增 `gtLogsSmartDefault.test.ts` 或补充现有测试覆盖缺省 `taskId` 的行为。
3. **文档与前端 UI**：
   - `CLAUDE.md`、`README.md`、`scripts/install-gt.sh`：全面同步更新命令使用说明；
   - `frontend/src/components/terminal/TerminalHostSelector.tsx`：更新空状态引导中提示的一键启动命令为 `gt login ... && gt agent run -d ...`。
