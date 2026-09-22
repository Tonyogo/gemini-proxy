# Gemini Terminal CLI (`gt`) Docker 对标演进设计规范

**日期**: 2026-09-22  
**状态**: Approved  
**设计目标**: 全面重构 `scripts/gt.js` CLI 架构，摒弃历史平铺单层命令，对标 Docker CLI 的工业级交互规范（二级管理命令体系、标准输入管道、Go 风格 `--format` 模板、`gt cp` 双向文件传输与短 ID 解析），保持零外部运行时依赖。

---

## 1. 架构与命令组织体系 (Command Hierarchy)

摒弃原有的单层平铺架构（`hosts`, `ps`, `logs`, `kill` 等），全面采用 Docker 风格的 **二级实体管理命令 (Management Commands)** 与高频顶级核心命令结合的架构模式：

```text
gt [GLOBAL_OPTIONS] COMMAND [SUBCOMMAND] [ARGS...]
```

### 1.1 全局参数 (Global Options)

| 参数 | 缩写 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `--server <url>` | `-s` | `TERMINAL_SERVER` 或 `http://localhost:3000` | 代理服务 Hub 地址 |
| `--key <secret>` | `-k` | `ADMIN_SECRET_KEY` 或配置中心 | 管理员 Secret Key 凭据 |
| `--json` | - | `false` | 以结构化 JSON 格式输出结果 |
| `--format <template>` | - | 空 | 使用 Go/Docker 风格模板格式化输出（支持 table） |
| `--version` | `-v` | - | 输出 CLI 版本信息 |
| `--help` | `-h` | - | 打印命令帮助信息 |

### 1.2 命令体系详表

| 顶级对象/命令 | 子命令 | 语法 | 对应 Docker 概念 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| **`host`** | `ls` | `gt host ls [OPTIONS]` | `docker node ls` | 列出所有已连接的 Agent 节点 |
| | `prune` | `gt host prune` | `docker node rm / prune` | 清理已离线的 Agent 节点记录 |
| **`task`** | `ls` | `gt task ls <host>` | `docker ps` | 列出指定节点上的任务列表 |
| | `logs` | `gt task logs [OPTIONS] <host> <task_id>` | `docker logs` | 查看或跟踪任务日志（支持 `-f`） |
| | `kill` | `gt task kill <host> <task_id>` | `docker kill` | 强制终止指定远程任务 |
| **`exec`** | *(顶级)* | `gt exec [OPTIONS] <host> <cmd...>` | `docker exec` | 在远程主机上即时执行命令 |
| **`cp`** | *(顶级)* | `gt cp <src> <dest>` | `docker cp` | 本地与远程节点之间双向复制文件 |
| **`auth`** | `login` | `gt auth login [server] [key]` | `docker login` | 校验凭据并保存到 `~/.gt/config.json` |
| | `logout` | `gt auth logout` | `docker logout` | 清除已持久化的管理员凭据 |
| **`config`** | `list/get/set` | `gt config <action> [key] [val]` | `docker config` / git | 客户端本地持久化配置管理 |
| **`agent`** | *(守护进程)* | `gt agent [OPTIONS]` | `dockerd` | 本机作为反向代理终端守护进程运行 |

> **注意**：本次重构明确**不向下兼容**旧版平铺命令（如 `gt hosts`, `gt ps`, `gt logs`, `gt kill`）。执行旧命令将友好提示对应的标准二级命令。

---

## 2. 核心功能设计

### 2.1 短 ID 与前缀模糊解析 (Short ID / Name Resolution)

在所有接受 `<host>` 与 `<task_id>` 的操作中，引入智能前缀解析算法：
1. **精确匹配**：若输入值完全匹配目标节点/任务的完整 ID 或 Name，直接选中。
2. **前缀匹配**：支持输入 4 位及以上字符的前缀匹配（如 `gt task ls 8f12`）。
   - 若匹配结果**唯一**：自动解析为该完整实体。
   - 若匹配到**多个**结果：返回明确的歧义提示并退出（退出码 `1`）：
     ```text
     Error: ambiguous host identifier '8f': matches multiple hosts (8f12a3, 8f9b0c)
     ```
   - 若**无匹配**结果：报错退出：
     ```text
     Error: no such host: 'xyz'
     ```

### 2.2 `exec` 标准输入管道支持 (`-i` / `--interactive`)

支持将本地的标准输入通过管道或重定向喂给远程执行进程，例如：
```bash
cat script.sh | gt exec -i my-node bash
echo "hello" | gt exec -i my-node tee /tmp/test.txt
```

#### 数据流与协议流转：
1. **输入捕获**：
   - 客户端检测到 `--interactive` / `-i` 或 `!process.stdin.isTTY` 时，自动聚合 stdin 数据。
   - 若远程命令缺省，默认回退至远程系统的默认 Shell（如 `bash` 或 `sh`）。
2. **Payload 扩展**：
   - `POST /api/terminal/exec/:hostId` 增加 `stdin` 字段（UTF-8 字符串或 Base64 编码）：
     ```json
     {
       "command": "bash",
       "cwd": "/root",
       "timeoutMs": 300000,
       "env": {},
       "stdin": "echo 'running pipeline'\\n"
     }
     ```
3. **Agent 执行处理**：
   - Agent 端在派生 `child_process.spawn` 进程后：
     - 若提供 `stdin`：调用 `child.stdin.write(stdin)` 后立即调用 `child.stdin.end()`。
     - 若未提供：按原逻辑关闭子进程 stdin，避免进程挂起等待输入。

### 2.3 Go / Docker 风格 `--format` 模板引擎

无需引入重量级外部模板库，在 CLI 内部实现高效且严谨的模板求值器：

1. **语法格式**：
   - 提取属性：`--format "{{.ID}}"`、`--format "{{.Name}}: {{.IP}}"`
   - 表格模式：`--format "table {{.ID}}\t{{.Name}}\t{{.Status}}"`
2. **支持字段字典**：
   - **Host**: `{{.ID}}`, `{{.Name}}`, `{{.Status}}`, `{{.Platform}}`, `{{.IP}}`, `{{.LastSeen}}`
   - **Task**: `{{.ID}}`, `{{.Status}}`, `{{.ExitCode}}`, `{{.StartTime}}`, `{{.Command}}`
3. **Table 排版引擎**：
   - 自动将占位符转换为表头（例如 `{{.LastSeen}}` -> `LAST SEEN`）。
   - 遍历记录计算每列最大宽度，利用制表符/空格对齐输出。

### 2.4 `gt cp` 双向文件传输 (Local <-> Remote)

支持本地路径与远程路径互传：

```bash
# 远程下载到本地
gt cp my-host:/var/log/app.log ./local-app.log

# 本地上传到远程
gt cp ./dist.tar.gz my-host:/app/dist.tar.gz
```

#### 关键实现逻辑：
1. **参数解析与防冲突**：
   - 区分远程冒号与 Windows 本地盘符（例如排除 `^[a-zA-Z]:[\\/]` 开头的路径）。
   - 提取 `<host>:<remote_path>` 中的 host 经由短 ID 解析器获得唯一 hostId。
2. **下载实现 (Remote -> Local)**：
   - 客户端流式调用 `GET /api/terminal/files/download?hostId=...&path=...`。
   - 落地至本地目标路径，提供进度显示。
3. **上传实现 (Local -> Remote)**：
   - 客户端读取本地文件，构造轻量级 `multipart/form-data` 请求。
   - 调用 `POST /api/terminal/files/upload?hostId=...&path=...` 发送至目标目录。

---

## 3. POSIX 退出码标准与异常处理

严格遵循 Docker CLI 退出码规范：
- `0`: 成功完成。
- `1`: 通用错误（网络不可达、认证失败、文件未找到等）。
- `125`: CLI 自身使用错误（如非法参数、未知子命令、参数缺失）。
- `130`: 用户 `Ctrl+C` (SIGINT) 中断远程任务。
- `N`: `gt exec` 时，若远程任务正常结束并产生非零退出码，CLI **原样返回**该退出码。

---

## 4. 自动化测试计划

1. **命令解析与帮助系统测试**：
   - 测试 `gt host ls`, `gt task ls`, `gt cp --help` 等各二级命令分发。
   - 测试调用废弃旧命令时输出友好的迁移提示信息。
2. **短 ID 解析测试**：
   - 覆盖唯一匹配、多重匹配歧义报错、不存在匹配报错等用例。
3. **`--format` 模板引擎测试**：
   - 测试自定义字段取值及 `table` 模式列宽格式化输出。
4. **`exec -i` Stdin 管道测试**：
   - Mock 测试管道数据注入与远程 Agent stdin 接收。
5. **`cp` 传输测试**：
   - 测试本地文件上传与远程文件下载完整数据流。
