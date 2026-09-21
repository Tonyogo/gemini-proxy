# gt 终端 CLI 与 Agent 脚本优化及缺陷修复设计规范 (gt CLI Improvements & Bugfixes Design)

## 1. 概述与目标 (Overview & Goals)
`scripts/gt.js` 是统一的 Docker 风格终端客户端与反向 Agent 守护脚本。经过深入审查，发现其与 Rust 原生版（`agent-rs`）以及设计文档相比存在若干严重缺陷与功能缺失：
1. **增量输出切片逻辑错误**：`getTask` 将基于混合流 `output` 的偏移量直接用于 `stdout` 和 `stderr` 的切片，导致长命令轮询时输出丢失；
2. **孤儿进程泄漏**：未创建独立进程组，`kill` 或超时时只能杀死外层 shell，无法终止其派生的子孙进程（如后台编译、开发服务器）；
3. **缺失登录与配置持久化命令**：缺少 `gt login`、`gt logout`、`gt config` 命令以及 `~/.gt/config.json` 的自动持久化与查找继承逻辑；
4. **安全与性能隐患**：WebSocket 连接时在 URL Query String 中暴露敏感 Key，大输出时全量 Buffer 转换带来不必要开销。

本次设计的核心目标是：
- **完全对齐 `agent-rs` 与项目文档**；
- 彻底修复输出截断与进程孤儿问题；
- 保持纯 Node.js 原生实现（零外部额外重量级依赖）。

---

## 2. 详细设计 (Detailed Design)

### 2.1 配置管理与命令支持 (`ConfigStore` & `login/logout/config`)
- **配置文件路径**：`~/.gt/config.json`
- **安全权限控制**：
  - 目录 `~/.gt/`：权限严格设为 `0700`；
  - 文件 `~/.gt/config.json`：权限严格设为 `0600`。
- **配置覆盖继承链 (Hierarchy)**：
  `CLI Flags (-s, -k) > 环境变量 (TERMINAL_SERVER, ADMIN_SECRET_KEY) > ~/.gt/config.json > 默认值 (http://localhost:3000 / 空)`
- **新增命令**：
  1. `gt login [server] [key]`：
     - 若未提供参数，使用交互式提示输入；
     - 自动格式化补全 `http://` 前缀；
     - 调用目标服务器的 `GET /api/terminal/hosts` 进行鉴权连通性校验；
     - 验证成功后保存到 `~/.gt/config.json`；
  2. `gt logout`：
     - 删除 `~/.gt/config.json`，清除本地凭证；
  3. `gt config <list|get|set> [key] [val]`：
     - `list`：展示当前生效配置（Key 支持遮蔽如 `secr***`）；
     - `get <key>`：读取配置字段；
     - `set <key> <val>`：持久化设置配置字段。

---

### 2.2 执行引擎增量偏移修复 (`TaskManager.getTask`)
- **根因修复**：
  在 `taskRecord` 中维护按时间递增的 chunk 日志列表：
  ```javascript
  {
    type: 'stdout' | 'stderr',
    text: string,
    startOffset: number,
    endOffset: number,
  }
  ```
- **切片逻辑**：
  当调用 `getTask(taskId, offset)` 时：
  - 以当前请求的字节 `offset` 过滤出 `endOffset > offset` 的所有 chunks；
  - 汇总拼接过滤出的 chunks：
    - `stdout`: 仅拼接增量中属于 stdout 的部分；
    - `stderr`: 仅拼接增量中属于 stderr 的部分；
    - `output`: 拼接增量中的全部内容；
    - `outputOffset`: 最新总字节数 `totalBytes`。
- **客户端联动 (`gt exec`)**：
  客户端轮询只依赖返回的 `outputOffset` 进行下一次增量拉取，避免在客户端按字符串长度猜测引发的多字节 UTF-8 错位。

---

### 2.3 进程树生命周期与彻底清理 (Process Group Tree Kill)
- **进程启动**：
  - POSIX 环境设置 `detached: true`，使子进程成为独立进程组的 Leader；
- **进程销毁 (`killTask`)**：
  - POSIX：执行 `process.kill(-task.child.pid, signal)`，将信号向整个进程组广播；
  - 3 秒后超时未退出，执行 `process.kill(-task.child.pid, 'SIGKILL')`；
  - Windows：使用 `taskkill /pid ${task.child.pid} /T /F` 进行树状强杀。

---

### 2.4 安全优化与鉴权传输
- 在 `resolveWebSocketUrl` 中，移除 URL query 参数中的 `key=${adminKey}`；
- 统一通过 WebSocket 建立连接时的 Header `x-admin-key: ${adminKey}` 传递凭据，杜绝反向代理访问日志泄露密钥。

---

## 3. 测试与验证方案 (Testing Plan)
1. **配置存储与命令测试 (`tests/gtConfig.test.ts`)**：
   - 验证 `ConfigStore` 文件的创建与 0600 权限；
   - 验证 `login` 验证失败拦截与成功持久化；
   - 验证配置查找继承链优先级。
2. **增量输出测试 (`tests/terminalTaskManager.test.ts`)**：
   - 模拟同时输出 stdout 和 stderr 的命令，验证多轮 incremental polling 输出 100% 完整且无丢失。
3. **进程组强杀测试 (`tests/terminalTaskManager.test.ts`)**：
   - 启动派生后台子孙进程的命令，执行 `killTask` 后确认所有子孙进程均被彻底杀死。
4. **回归测试**：
   - 运行 `npx jest tests/gtCli.test.ts`、`npx jest tests/terminalAgentCommandExec.test.ts` 与全量测试套件。
