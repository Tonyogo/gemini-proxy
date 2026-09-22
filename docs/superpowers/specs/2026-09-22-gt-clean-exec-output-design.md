# gt exec 纯净输出与服务端审计日志设计规范

**日期**: 2026-09-22  
**状态**: Approved  
**设计目标**: 全面优化 `gt exec` CLI 输出体验，对齐 Docker 的零污染纯净管道标准（默认去除 `>>>` 和 `<<<` 前后缀打印），并将命令派发与完成生命周期完整记录在服务端审计日志中。

---

## 1. 客户端输出规则规范 (CLI Stream Rules)

### 1.1 默认输出行为 (Default: Pure Stream)
- 默认情况下，`gt exec <host> <cmd...>` 不打印任何 CLI 自行添加的 Banner（如 `>>> [host] $ cmd`、`<<< [host] Command completed`）。
- 控制台只输出目标进程实时产生的 `stdout`（至标准输出）与 `stderr`（至标准错误）。
- 当进程结束时，直接以目标进程实际返回的退出码退出 (`process.exit(exitCode)`)。

### 1.2 可选调试模式 (`--verbose`)
- 当用户显式传入 `--verbose` 时：
  - 在 `stderr` 输出命令启动 Banner：`>>> [host] $ <fullCommand>\n`
  - 在 `stderr` 输出命令结束 Banner：`<<< [host] Command completed with code <exitCode> (took <duration>s)\n`
- 原 `-q, --quiet` 选项保持参数兼容（无操作 no-op）。

---

## 2. 服务端审计日志规范 (Server Audit Logs)

在 `src/terminal/services/terminalExecService.ts` 中集成 `terminalLogService` 与 `logger`，对所有命令执行进行结构化审计记录：

### 2.1 审计事件定义

1. **任务启动 (Task Start)**：
   - 级别: `info`
   - 格式: `[Exec] Started task <taskId> on [<hostId>]: <command>` (附带 `cwd` 与 `timeoutMs`)
2. **任务启动异常 (Task Start Error)**：
   - 级别: `error`
   - 格式: `[Exec] Failed to start command on [<hostId>]: <error> (cmd: <command>)`
3. **任务结束 (Task Finished)**：
   - 级别: 成功为 `info`，非零/异常为 `warn`
   - 格式: `[Exec] Task <taskId> on [<hostId>] finished: status=<status>, exitCode=<exitCode>, duration=<durationMs>ms`
   - 机制: 在状态轮询进入终态时单次触发，通过 Set 或内存标识防止重复记录。
4. **任务强杀 (Task Kill)**：
   - 级别: `warn`
   - 格式: `[Exec] Sent kill signal <signal> to task <taskId> on [<hostId>]`

---

## 3. 测试与验证计划

1. **CLI 纯净输出单测** (`tests/gtExecPureStream.test.ts`)：
   - 测试默认执行下不包含 `>>>` 与 `<<<` 字符。
   - 测试传入 `--verbose` 时包含启动与结束 Banner。
   - 测试标准输出管道消费（如 `gt exec host echo "foo" | grep foo`）输出完全干净。
2. **服务端审计日志单测** (`tests/terminalExecAuditLogs.test.ts`)：
   - 模拟启动任务与状态轮询，验证 `terminalLogService` 能够正确捕获 `[Exec] Started task` 与 `[Exec] Task ... finished`。
3. **回归测试**：
   - 确保现有所有 135+ 个测试套件保持 100% 通过。
