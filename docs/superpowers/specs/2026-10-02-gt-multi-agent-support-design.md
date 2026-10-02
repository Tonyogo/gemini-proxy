# Spec: gt.js 多 Agent 实例并发支持与主机名默认回退

## 1. 概述与背景

`gt` (Gemini Terminal CLI & Reverse Agent, `scripts/gt.js`) 目前在启动终端 Agent 守护进程时，仅允许同时运行单个 Agent。当用户尝试启动第二个 Agent，或者在后台运行模式下未指定名称启动时，会遇到两个主要阻碍：
1. **客户端粗暴的全局单例检查**：在 `gt run -d` 或 `gt agent -d` 时，只要检测到当前机器存在任何运行中的 Agent，就会直接抛错退出，拒绝启动。
2. **服务端连接覆盖（抢占）**：所有未显式指定 `--id` 启动的 Agent 均使用本机保存在 `~/.gt/config.json` 中的固定 `machineId`。当启动两个不同名称的 Agent 时，服务端因 `hostId` 完全相同，第二个 Agent 的 WebSocket 连接会直接覆盖替换第一个 Agent 的会话，导致两端无法共存。

本设计旨在解除上述单例限制，支持在一台机器上并发启动任意多个具有独立命名、独立进程、独立日志与独立服务端会话的 Agent 实例，并在未显式传入名称时默认回退为规范化的机��主机名（`os.hostname()`）。

---

## 2. 核心架构与设计决策

### 2.1 命名解析与默认回退 (Name Resolution)

* **默认名称获取**：
  使用本机的主机名并进行安全规范化（小写、剔除特殊字符，仅保留 `[a-z0-9-_]`）：
  ```javascript
  const hostname = os.hostname();
  const sanitizedHostname = hostname.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/^-+|-+$/g, '') || 'host';
  ```
* **名称优先级**：
  `options.name` (命令行 `--name=xxx`) > `positionalName` (命令行位置参数 `gt run [NAME]`) > `sanitizedHostname`。
  得到最终确定的实例名称 `hostName`。

### 2.2 确定性 `hostId` 派生规则 (Deterministic hostId Derivation)

为了保证同一实例在重启后会话一致，同时避免多个不同命名的 Agent 在服务端产生 `hostId` 主键冲突：
* 若命令行显式指定了 `--id` 或 `--hostId`，优先采用指定的 ID；
* 若未指定 ID：
  * 当 `hostName === sanitizedHostname`（默认主机名实例）时：`hostId = machineId`。此策略确保与历史单实例版本的 ID 完全一致，完全向后兼容现存的权限与历史任务记录。
  * 当为其他自定义命名实例时：`hostId = `${machineId}-${hostName}``。这保证���不同命名的 Agent 在服务端拥有唯一的 `hostId`，不会发生连接互踢与会话覆盖。

### 2.3 精细化互斥隔离 (Per-Name Concurrency Control)

* **移除全局限制**：
  删除 `scripts/gt.js` 中关于“若未传名称且已有任何 Agent 运行则报错”的粗暴检查：
  ```javascript
  // 移除旧有逻辑：
  // if (isDaemon && !options.name && !positionalName) {
  //   const running = AgentDaemonManager.getAllAgents().filter(a => a.running);
  //   if (running.length > 0) { ... exit(1); }
  // }
  ```
* **同名互斥，异名共存**：
  仅针对解析后的目标 `hostName` 执行互斥检查：
  ```javascript
  const current = AgentDaemonManager.getAgent(hostName);
  if (current && current.running) {
    console.error(`Error: Agent "${hostName}" is already running (PID: ${current.pid}). Use 'gt stop ${hostName}' or 'gt restart ${hostName}'.`);
    process.exit(1);
  }
  ```
  这意味着：用户可以在后台同时运行 `my-laptop`（默认）、`worker-1`、`worker-2` 等多个实例。

---

## 3. CLI 交互与多实例生命周期协同

本地守护进程管理类 `AgentDaemonManager` 已经天然具备多实例管理机制（每个实例保存于 `~/.gt/agents/<name>.json`，��志写在 `~/.gt/agents/<name>.log`），但在多实例场景下的 CLI 交互需要完善：

### 3.1 启动命令 (`gt run [-d] [NAME]`)
* `gt run -d`：以本机机器名为名称启动后台守护进程（如 `PID: 1234, Host: my-host, ID: 3fa9c10d82e1`）。
* `gt run -d worker-1`：以 `worker-1` 为名称启动后台守护进程（如 `PID: 1235, Host: worker-1, ID: 3fa9c10d82e1-worker-1`）。
* 若再次执行 `gt run -d worker-1`，提示 `Agent "worker-1" is already running` 并退出。

### 3.2 列表查看 (`gt ps -l` / `gt status`)
* `gt ps -l`：列出当前运行中的所有本地 Agent（`NAME`, `STATUS`, `PID`, `TARGET HUB`, `STARTED`）。加 `-a` 可显示已停止的实例。
* `gt status`：遍历展示所有运行中 Agent 的状态信息。

### 3.3 日志查看 (`gt logs [-f] [-n 50] [NAME]`)
* 指定 `NAME` 时直接查看目标 Agent 日志。
* 未指定 `NAME` 时：
  * 若当前只有 1 个 Agent 处于 running 状态，自动直接跟踪该 Agent 日志；
  * 若有多个 Agent 处于 running 状态，输出友好错误并列出可选的运行中 Agent 供用户选择。

### 3.4 停止与重启 (`gt stop` / `gt restart`)
* `gt stop [NAME] [--all]`：
  * 支持 `--all` / `-a`：一键停止本机所有运行中的 Agent。
  * 传入 `NAME` 时：精准停止指定 Agent。
  * 未传 `NAME` 时：若只有 1 个运行中 Agent 则自动停止；若有多个则报错提示必须显式指定目标或使用 `--all`。
* `gt restart [NAME]`：
  * 精准重启指定 Agent，保持该实例的名字、状态文件与参数不变。

---

## 4. 服务端协同保证 (TerminalHostManager)

* 服务端通过 `/api/terminal/agent-ws` 接收建立连接，URL Query 包含 `hostId=${hostId}&name=${hostName}&hostname=${hostname}`。
* 因为每个命名的 Agent 拥有独立的 `hostId`，服务端会为每个 Agent 独立创建 `RemoteAgentTerminalSession`，互不抢占、互不覆盖。
* Web 管理控制台的主机选择列表与终端标签页中将正常出现多个并列在线的 Host，且能够独立打开终端、执行命令与传输文件。

---

## 5. 测试与验证策略

在现有 `tests/gtAgentDaemon.test.ts` 中新增或更新测试用例：
1. **默认主机名回退测试**：不传名字启动后台 Agent，验证其实例名为 `os.hostname()` 规范化结果，其 `hostId` 为 `machineId`。
2. **自定义命名与 hostId 派生测试**：传入自定义名称启动后台 Agent，验证其实例名正确，`hostId` 为 `${machineId}-${hostName}`。
3. **多实例并发启动测试**：同时启动默认实例和自定义实例（如 `worker-test-1` 和 `worker-test-2`），验证各进程同时存活、状态文件各自独立存在且均记录为 running。
4. **同名互斥拦截测试**：在目标 Agent 已经处于 running 状态时尝试再次启动同名 Agent，验证返回非 0 退出码且 stderr 包含提示。
5. **智能停止与生命周期测试**：在存在多个并发 Agent 时测试 `gt stop`（无参）拒绝拦截，测试 `gt stop <name>` 精确停止，以及 `gt stop --all` 停止全部。
