# Gemini-Proxy: Claude API to Gemini API Stateless Proxy

一个轻量、无状态、高性能、使用 **TypeScript** 全盘重构的 API 代理服务器。它作为 Anthropic Claude Messages API 的无缝替代品，接收 Claude 格式的 API 请求，并自动将其翻译并转发至 Google AI Studio (Gemini) 官方 API，最后将生成的流式（SSE）或非流式响应转换回 Claude 格式返回给客户端。

---

## 🌟 核心特性

- **全协议双向代理与直传**：
  - **Claude 协议转译模式**：接收 Anthropic Claude 协议请求（`/v1/messages`、`/v1/models`、`/v1/messages/count_tokens`），转译为 Gemini 协议并把结果还原为 Claude SSE 流式/非流式响应。
  - **原生 Gemini 协议透传模式**：完整支持官方 Google Gemini 协议路径（`/v1beta/*` 与 `/v1/models/*:*`），可作为官方 API 代理直连，自带模型别名映射（`MODEL_MAPPINGS`）、负载均衡策略、客户端断连中止管理与全量审计日志记录。
- **TypeScript 强类型支持**：全盘采用严格模式（strict）的 TypeScript 开发，提供极致的安全性和健壮性，杜绝因 JSON Schema 繁琐键值定位引发的运行时崩溃。
- **轻量且无状态**：无任何数据库、浏览器实例（Playwright/Puppeteer）或账户轮询队列，所有请求完全在内存中高效处理。
- **纯透传定位 (无配置密钥泄露风险)**：服务器本身**不保存任何官方 API 密钥**。客户端请求必须在 Header 中携带 `x-api-key`、`Authorization: Bearer <key>` 或 `x-goog-api-key` 作为官方 Gemini 密钥。代理端在翻译完参数后直接透传并访问下游 Google 接口，完全零运营与配额消耗。
- **自定义 Base URL 支持 (`GEMINI_BASE_URL`)**：支持通过环境变量自定义 Google Gemini 接口的请求地址，完美适配自建反代、国内网络中转（如 Cloudflare Workers、Nginx 等），并内建智能斜杠合并与纠错机制。
- **数据与逻辑完美解耦 (`models.json`)**：将所有 Claude 的模型详细信息以及其到 Gemini 的映射关系高度整合在 `config/models.json` 配置文件中。未来增加新模型映射、添加别名，均只需在此单文件里增改一行，**无需改动并重新编译任何逻辑代码**。
- **全功能翻译转换**：
  - 系统提示词（System Prompt）映射与自定义控制：支持 `SYSTEM_ROLE_TO_INSTRUCTION` 开关控制将 `role: 'system'` 消息映射至 Gemini 的 `systemInstruction` 中，并自动按标题前缀进行增量去重（仅保留最新版系统指令）。
  - 可配置的运行时上下文标签：支持通过 `RUNTIME_CONTEXT_TAG` 环境变量（默认 `system-context`）自定义系统提示词的包裹标签。
  - 多轮复杂对话及角色（User / Assistant / Tool）自动映射。
  - 多模态与文档支持：支持 Base64 图片及 PDF/文档类型（`type === 'document'`）数据的自动抽取与转换，完美支持包含文档与图片的 `tool_result` 工具执行结果。
  - 智能思考（Thinking Mode）：支持 Claude `thinking` 参数与 Gemini 思考预算的自动映射与 Token 统计。
  - 完备的工具调用（Tools / Function Calling）：支持 Claude 工具格式到 Gemini 声明的自动大写转换、Draft 不兼容属性递归剔除，以及多轮对话下 `tool_use_id` 到原始函数名的 Map 还原和非标参数类型兼容。
- **流式 SSE 实时传输与生命周期管理**：支持毫秒级、低延迟 Server-Sent Events 流式生成，并集成客户端中断检测与超时取消机制（`UPSTREAM_TIMEOUT_MS`）。
- **Token 计数与模型查询**：完整实现 `/v1/messages/count_tokens` 与 `/v1/models`、`/v1/models/:model_id` 接口。
- **现代可视化 Web 管理控制台 (`/ui`)**：开箱即用的现代化前端控制台，提供实时 QPS/耗时/错误率仪表盘、Chrome DevTools 级交易日志详情查看器（JSON 树形预览与 SSE 打字机流式汇编），以及集成 Monaco Editor 的 API 测试 Playground。
- **全功能 Web 交互终端 (WebTerminal)**：免 SSH 密钥直接在浏览器中操作 Linux/macOS Shell 及实时追踪系统日志，会话常驻后台并自动回放 1MB 屏幕历史。
- **移动端绝佳终端体验**：独创基于 Visual Viewport 动态计算的虚拟键盘平滑推顶补偿（零遮挡底部命令行、零白屏）、专属移动端辅助按键栏（Accessory Bar：Esc/Tab/Ctrl/Alt/Shift/方向键）、常用命令抽屉（Snippets Drawer）与全屏沉浸模式。
- **多局域网主机内网集中管理 (Reverse Agent)**：无需内网主机拥有公网 IP 或放行防火墙端口，只需单命令启动轻量反向 Agent 脚本，即可在 Web 控制台统一秒级切换、纳管多台内网机器/虚拟机/树莓派/NAS 终端。

---

## 📂 项目结构

```text
gemini-proxy/
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions: 基于 Gemini Terminal (gt) 的自动化部署流水线
├── config/
│   ├── default.ts             # 配置文件读取、基础默认配置项与热重载
│   └── models.json            # 核心配置文件：受支持的模型列表及到 Gemini 的映射规则
├── frontend/                  # React + Vite + Tailwind 前端 Admin Web 控制台
│   └── src/
│       ├── components/        # DashboardView, LogsView, PlaygroundView, WebTerminalView
│       │   └── terminal/      # TerminalHostSelector, TerminalAccessoryBar, TerminalSnippetsDrawer
│       ├── i18n/              # 中英文国际化语言包 (zh / en)
│       └── utils/             # 移动端视口计算、按键编码器、终端过滤器等
├── scripts/
│   ├── deploy.sh              # 统一步署脚本 (Git 拉取、依赖安装、前后端编译、PM2 平滑重载)
│   └── gt.js                  # 统一 Docker 风格终端 CLI 与反向 Agent 引擎 (gt ps / exec / logs / kill / cp / login / agent)
├── src/
│   ├── admin/                 # 管理控制台后端逻辑 (状态、统计、日志审计、全局配置、账号)
│   │   ├── controllers/       # AdminController, AccountController
│   │   ├── middlewares/       # AdminAuth (管理员密钥鉴权)
│   │   ├── routes/            # AdminRoutes (/api/admin/* 及向下兼容别名)
│   │   └── services/          # MetricsService, LogService, AccountService
│   ├── proxy/                 # 核心 API 代理��转译系统
│   │   ├── controllers/       # ClaudeController, GeminiController (协议转译与转发)
│   │   ├── routes/            # ClaudeRoutes, GeminiRoutes (/v1/*, /v1beta/*)
│   │   └── services/          # ClaudeTranslator (转译核心), PayloadLogger (报文审计)
│   ├── terminal/              # 独立终端与运维子系统
│   │   ├── controllers/       # TerminalHost, File, Exec, Log 控制器
│   │   ├── routes/            # TerminalRoutes (/api/terminal/*), TerminalWs (双通道网关)
│   │   └── services/          # TerminalHostManager, TerminalExec, File, Log 服务
│   ├── types/
│   │   └── index.ts           # 强类型定义声明 (Claude 与 Gemini API REST 协议载荷接口)
│   ├── utils/
│   │   ├── logger.ts          # 工具类：支持日志级别的定制化控制台日志输出
│   │   ├── requestHelper.ts   # 请求头与基址辅助工具
│   │   └── streamLifecycleManager.ts # 工具类：流式传输超时控制与客户端断开检测管理
│   ├── app.ts                 # Express 应用注册、中间件绑定
│   └── index.ts               # 服务监听主启动入口
├── tests/                     # 包含 64 个测试套件、316+ 断言的高覆盖自动化测试集
├── dist/                      # (Git-ignored) 经构建输出的 CommonJS 生产代码与静态前端
├── ecosystem.config.js        # PM2 进程守护及平滑重载配置
├── .env                       # 本地环境变量配置（端口、中转基址、管理密钥等）
├── tsconfig.json              # TypeScript 编译选项配置文件
├── package.json               # 项目依赖、TypeScript 工具链及 npm 运行脚本
└── README.md                  # 本使用说明文档
```

---

## ⚙️ 快速上手

### 1. 安装依赖

需要确保本地安装了 **Node.js (v18+)**。

```bash
# 安装所需依赖包（自动加载并搭建 TypeScript 工具链）
npm install
```

### 2. 配置环境变量

在项目根目录下创建 `.env` 文件（或复制 `.env.example`），进行以下配置：

```env
# 代理服务器监听端口
PORT=3000

# 自定义 Gemini Upstream API 基础地址 (可选项。默认指向官方地址)
GEMINI_BASE_URL=https://generativelanguage.googleapis.com

# 管理控制台 (/ui) 与 Web 终端鉴权密钥 (强烈建议配置)
ADMIN_SECRET_KEY=your_secure_admin_key_here

# 是否启用 Web 管理控制台前端托管 (默认 true，访问地址 /ui)
ENABLE_UI=true

# 日志输出级别: error, warn, info, debug
LOG_LEVEL=info

# 交易日志存储目录 (按日期/小时自动分卷存储)
TRANSACTION_LOGS_DIR=logs

# 交易日志保留天数 (默认 3 天，0 表示不自动清理)
LOG_RETENTION_DAYS=3

# 时区配置 (默认 Asia/Shanghai)
TIME_ZONE=Asia/Shanghai

# 是否将消息中的 role='system' 路由至 systemInstruction 并按标题去重 (默认 false)
SYSTEM_ROLE_TO_INSTRUCTION=false

# 运行时上下文包裹标签名 (默认 system-context)
RUNTIME_CONTEXT_TAG=system-context

# 上游 Gemini 请求超时毫秒数 (默认 180000ms / 3分钟)
UPSTREAM_TIMEOUT_MS=180000

# 全局追加的自定义 System 提示词 (可选项)
CUSTOM_SYSTEM_INSTRUCTION=
```

### 3. 运行服务

#### A. 生产环境全量编译运行：
```bash
# 1. 一键编译前端静态资源 (Vite) 与后端代码 (tsc)
npm run build

# 2. 启动生产服务
npm start
```

#### B. 极速开发模式：
```bash
# 后端：使用 ts-node-dev 动态监控更改并免编译热重载
npm run dev

# 前端：启动 Vite 独立调试热重载服务 (端口 5173，自动转发 /api, /v1 请求至后端 3000 端口)
npm run dev:frontend
```

服务启动后，默认会在 `http://localhost:3000` 监听 API 请求，管理控制台可在浏览器直接访问 `http://localhost:3000/ui`。

---

## 🚀 生产部署与 CI/CD 自动化流水线

项目支持 **PM2 零停机平滑部署** 与 **GitHub Actions (基于 Gemini Terminal `gt` 命令) 自动化流水线**。

### 1. 服务器端一键部署 (PM2)

项目已提供统一步署脚本 `scripts/deploy.sh`，在服务器项目根目录下执行：

```bash
# 一键拉取最新代码、安装依赖、编译前后端并平滑重启 PM2 进程
npm run deploy
```

常用 PM2 管理命令：
```bash
pm2 start ecosystem.config.js    # 启动 PM2 守护进程
pm2 reload ecosystem.config.js   # 零停机平滑热重载
pm2 stop gemini-proxy            # 停止进程
pm2 logs gemini-proxy            # 查看实时运行日志
```

### 2. GitHub Actions 自动部署流水线

项目内置了 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)，支持在代码推送到 `main` 分支或手动点击 `workflow_dispatch` 时，通过项目内置的 **Gemini Terminal (`gt exec`)** 自动化远程触发服务器部署，完全无需配置 SSH 密钥或 Cloudflare SSH 隧道。

流水线内置并发队列控制（`concurrency`），同一时间仅允许一个流水线执行部署，并自带 PM2 reload 期间的断线自动重连容错（容忍最多 30 次轮询重试）。

#### GitHub Repository Secrets 配置

在 GitHub 仓库中进入 **Settings -> Secrets and variables -> Actions -> New repository secret** 配置以下变量（与服务器端 `.env` 保持一致）：

| Secret 变量名 | 必填 | 说明与示例 |
| :--- | :--- | :--- |
| `TERMINAL_SERVER` | **是** | Gemini Proxy Hub 服务访问地址（如 `https://proxy.yourdomain.com`） |
| `ADMIN_SECRET_KEY` | **是** | 管理员密钥（与服务器端 `.env` 中配置的 `ADMIN_SECRET_KEY` 相同） |
| `DEPLOY_PATH` | **是** | 目标服务器上的部署绝对路径（如 `/home/yogo/gemini-proxy`） |
| `GT_HOST` | 否 | 目标 Agent 主机标识/名称（选填，默认约定固定为 `gemini-proxy-server`） |

配置完成后，推送代码到 `main` 分支即可全自动触发构建、平滑热重载并在 GitHub Actions 中实时回显部署流式日志。

---

## 🖥️ Web 管理控制台与 API 调试器 (/ui)

项目内置了现代化的单页 Web 控制台，在浏览器中访问 `http://localhost:3000/ui`（或您部署的域名后加 `/ui`）即可进入。

- **安全鉴权**：在 `.env` 中配置 `ADMIN_SECRET_KEY`，前端通过 Header `x-admin-key` 鉴权，支持记住登录状态与多语言无缝切换（简体中文 / English）。
- **实时监控仪表盘 (Dashboard)**：
  - 呈现系统运行时间、总调用量、平均响应耗时、错误率及实时活跃连接数；
  - 动态展示各模型调用占比环形图、近期 QPS 趋势图与各错误类型分布。
- **Chrome DevTools 级交易日志检查器 (Logs Inspector)**：
  - 左右分栏设计，左侧展示请求流列表（状态码、模型、耗时、时间戳、客户端 IP），支持按状态与关键词实时搜索；
  - 右侧详情面板支持查看原始请求/响应 Header 与 Body；
  - 内置交互式 **JSON 树形组件**，支持键值搜索与展开折叠；
  - 针对流式传输特别集成 **SSE 打字机预览组件**，直观回放流式事件时间轴与事件块内容。
- **API 实时测试 Playground**：
  - 内置基于 Monaco Editor（VS Code 同款）的请求体编辑器，提供一键格式化与常用模板；
  - 支持即时发送请求并以流式（打字机）或完整 JSON 格式输出，排查 API 问题零等待。
- **模型动态映射与调度策略**：
  - 支持给 Claude 模型配置目标 Gemini 模型别名，并支持选择负载调度策略（`least-used` 最小负载、`round-robin` 轮询、`weighted` 权重）。

---

## 💻 WebTerminal 终端与多局域网主机集中管理 (全新)

为方便日常运维与无 SSH 密钥环境下的服务器维护，Gemini-Proxy 采用**纯反向 Agent 统一架构**（Pure Reverse Agent Architecture），彻底解耦 Proxy 网关进程与系统 PTY，所有节点（宿主机与远程内网节点）均通过轻量 Agent 统一反向接入。

### 1. 架构原理

```text
┌──────────────────────────────────────────────────────────────┐
│                    Web Browser (PC / 移动端)                  │
│   WebTerminal 交互终端 + 文件管理 + 主机切换器 (HostSelector)  │
└──────────────────────────────▲───────────────────────────────┘
                               │  /api/admin/terminal/ws?hostId=...
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                       Gemini-Proxy Hub                       │
│  - TerminalHostManager: 纯动态 Agent 会话与节点注册管理中心   │
│  - /api/admin/terminal/agent-ws: 统一反向 Agent WebSocket 通道│
│  - TerminalFileService: 全面 RPC 化远程文件管理与分块流传输   │
│  - GET /api/admin/terminal/hosts: 动态节点状态与心跳查询接口 │
└───────────────▲──────────────────────────────▲───────────────┘
                │ 反向 WebSocket 隧道           │ 反向 WebSocket 隧道
                │ (双向 stdio + 文件 RPC)       │ (双向 stdio + 文件 RPC)
┌───────────────┴──────────────┐ ┌─────────────┴───────────────┐
│ 局域网/远程主机 A (Agent)    │ │   宿主机节点 (gt agent)     │
│ Ubuntu / Debian / 树莓派 / NAS│ │  当前服务器所在系统独立运行   │
└──────────────────────────────┘ └─────────────────────────────┘
```

### 2. 核心特性

- **纯反向 Agent 统一网关**：
  - Proxy 网关本身零内置宿主机 PTY 生成与本地 `fs` 降级，避免后端臃肿与本地特权风险；
  - 宿主机与所有远程内网服务器平权，均通过执行 `gt agent`（`scripts/gt.js agent` 或 Rust 原生二进制）反向建立长连接。
- **后台常驻与断线无损重放**：
  - 终端 PTY 进程由 Agent 维护，关闭网页或网络波动不会中断后台任务；
  - 服务端维护 200KB 环形历史回放缓冲区，重新进入时秒级恢复最近屏幕输出。
- **纯 RPC 远程文件管理**：
  - 支持多主机目录实时浏览、文件查看与编辑（集成 Monaco Editor）、文件夹新建、重命名、批量上传与下载。
- **独立异步命令执行引擎 (AI 与自动化部署对接)**：
  - **进程级绝对隔离**：基于独立子进程（`child_process.spawn`）执行，不占用或干扰交互式 PTY 终端会话；
  - **非阻塞异步生命周期**：触发执行即刻返回全局唯一 `taskId`，支持按字节偏移（`offset`）增量拉取输出、超时守卫（SIGTERM/SIGKILL 强杀）与任务自动垃圾回收。
- **优雅空态与自动切换**：
  - 当暂无在线主机时，自动展示毛玻璃空态引导卡片，提供当前服务地址的一键启动命令；
  - 当主机上线时平滑自动连接并装载 xterm 终端，多节点自动自愈切换。
- **移动端深度交互优化**：
  - **软键盘平滑推顶**：基于 Visual Viewport 动态跟踪与双向缓动补偿算法，键盘弹起时光标与输入行平滑上推，杜绝键盘遮挡与页面白屏；
  - **移动端辅助按键栏 (Accessory Bar)**：在手机端提供快捷键条，一键输入 `Esc`、`Tab`、`Ctrl`、`Alt`、`Shift`、方向键及常用字符（`|`, `/`, `-`, `~`, `$` 等），支持长按连续触发；
  - **运维命令抽屉 (Snippets Drawer)**：内置一键查看系统负载 (`top`)、磁盘空间 (`df -h`)、内存使用 (`free -m`)、网络连接等常用运维指令；
  - **自由框选与复制**：专为触屏设计的选择模式，便于在移动端复制日志和终端文本。

### 3. 主机节点反向 Agent 接入

无需为服务器配置公网 IP 或配置 NAT 端口映射，宿主机或目标机器只需执行轻量级 Agent 脚本即可反向注册至控制台。

#### A. 一键接入命令
在宿主机或局域网内任意 Linux、macOS 或 Windows 主机上执行：

```bash
# 1. 登录并持久化连接凭据 (像 docker login 一样，保存在 ~/.gt/config.json)
gt login http://<proxy-ip>:3000 <ADMIN_SECRET_KEY>

# 2. 启动 Agent 节点 (Docker 风格多实例运行，-d 代表后台守护进程)
gt agent run -d Ubuntu-GPU-Server

# 3. 常用生命周期操作
gt agent ps                               # 查看本机运行的 Agent 实例状态 (支持 -a 查看所有)
gt agent logs -f Ubuntu-GPU-Server        # 实时跟踪 Agent 运行日志
gt agent stop Ubuntu-GPU-Server           # 停止 Agent
gt agent restart Ubuntu-GPU-Server        # 重启 Agent
gt agent prune                            # 一键清理所有已停止的本地 Agent 记录与日志
gt agent rm Ubuntu-GPU-Server             # 清理指定的已停止 Agent 记录
```

#### B. Agent 守护进程命令与参数说明
| 命令 / 选项 | 说明 | 示例 |
| :--- | :--- | :--- |
| `gt agent run [-d] [NAME]` | 运行 Agent (前台控制台输出，或 `-d` / `--detach` 后台常驻；默认使用系统 hostname) | `gt agent run -d` / `gt agent run -d worker-1` |
| `gt agent ps [-a\|--all]` | 列出本地 Agent 实例状态 (默认仅活跃，`-a` 列出全部含 Stopped) | `gt agent ps` / `gt agent ps -a` |
| `gt agent logs [-f] [-n 50] [NAME]` | 查看或实时跟踪 (`-f`) Agent 运行日志 | `gt agent logs -f worker-1` |
| `gt agent stop [NAME] [--all]` | 优雅终止 Agent 进程 (支持 `--all` 停止全部) | `gt agent stop worker-1` |
| `gt agent restart [NAME]` | 重启指定的 Agent 守护进程 | `gt agent restart worker-1` |
| `gt agent prune` | 一键清理所有已停止的本地 Agent 状态文件及日志记录 | `gt agent prune` |
| `gt agent rm [NAME] [--all]` | 删除已停止的 Agent 状态文件及日志记录 (支持 `--all`) | `gt agent rm worker-1` |
| `--name=<name>` | 显式指定 Agent 名称 (优先级高于位置参数 `NAME`) | `--name="my-box"` |
| `--id=<id>` | 主机唯一标识 | 默认为固化在本地的稳定 Machine ID (12位十六进制) |
| `--shell=<path>` | 指定调起的 Shell 程序路径 | 自动检测 (bash/zsh/PowerShell) |

#### C. 特性保障
- **自动检测内网 IP**：Agent 自动探测并上报主机的真实局域网 IPv4 地址与操作系统平台；
- **自愈重连机制**：遇网络波动或代理重启，Agent 会自动采用指数退避算法（2s, 4s, 8s...）无限重连保活；
- **零额外编译开销**：基于纯 Node.js 运行时，直接复用标准 `ws` 和 `node-pty`。

#### D. 自动化命令执行 API (对接 AI / 部署脚本 / CI/CD)

通过反向隧道连接的每个 Agent 节点，均支持通过标准 HTTP REST API 异步执行 Shell 命令，与人工交互的 WebTerminal 会话完全隔离。

##### 1. 提交执行任务
- **接口：** `POST /api/admin/terminal/exec/:hostId`
- **说明：** 立即在目标节点派发独立子进程（`child_process.spawn`），返回 202 Accepted 与 `taskId`，避���长连接 HTTP 超时。
- **请求示例 (cURL)：**
```bash
curl -X POST "http://localhost:3000/api/admin/terminal/exec/Ubuntu-GPU-Server" \
     -H "Content-Type: application/json" \
     -H "x-admin-key: YOUR_ADMIN_SECRET_KEY" \
     -d '{
       "command": "git pull origin main && npm run build",
       "cwd": "/opt/apps/gemini-proxy",
       "timeoutMs": 300000,
       "env": { "NODE_ENV": "production" }
     }'
```
- **响应示例：**
```json
{
  "success": true,
  "taskId": "task-1726671234000-a9b2c3",
  "hostId": "Ubuntu-GPU-Server",
  "status": "running",
  "command": "git pull origin main && npm run build",
  "cwd": "/opt/apps/gemini-proxy",
  "startTime": 1726671234000
}
```

##### 2. 轮询任务状态与增量输出
- **接口：** `GET /api/admin/terminal/exec/:hostId/:taskId?offset=0`
- **说明：** 支持按字节偏移量 `offset` 获取未读增量输出，AI Agent 或自动化脚本可根据返回的 `offset` 持续轮询直至任务结束（`status` 变为 `completed` / `failed` / `timeout` / `killed`）。
- **请求示例 (cURL)：**
```bash
curl "http://localhost:3000/api/admin/terminal/exec/Ubuntu-GPU-Server/task-1726671234000-a9b2c3?offset=0" \
     -H "x-admin-key: YOUR_ADMIN_SECRET_KEY"
```
- **响应示例：**
```json
{
  "success": true,
  "taskId": "task-1726671234000-a9b2c3",
  "hostId": "Ubuntu-GPU-Server",
  "status": "completed",
  "exitCode": 0,
  "stdout": "Updating a981fb7..81b8f5b\nFast-forward\nBuild success.\n",
  "stderr": "",
  "output": "Updating a981fb7..81b8f5b\nFast-forward\nBuild success.\n",
  "offset": 58,
  "totalBytes": 58,
  "durationMs": 4200,
  "startTime": 1726671234000,
  "endTime": 1726671238200
}
```

##### 3. 中断 / 强杀运行中的任务
- **接口：** `POST /api/admin/terminal/exec/:hostId/:taskId/kill`
- **说明：** 向指定任务进程发送 `SIGTERM`（可选 `SIGKILL`）中断信号。
- **请求示例 (cURL)：**
```bash
curl -X POST "http://localhost:3000/api/admin/terminal/exec/Ubuntu-GPU-Server/task-1726671234000-a9b2c3/kill" \
     -H "Content-Type: application/json" \
     -H "x-admin-key: YOUR_ADMIN_SECRET_KEY" \
     -d '{"signal": "SIGTERM"}'
```

##### 4. 获取节点最近历史任务列表
- **接口：** `GET /api/admin/terminal/exec/:hostId?limit=20`
- **请求示例 (cURL)：**
```bash
curl "http://localhost:3000/api/admin/terminal/exec/Ubuntu-GPU-Server?limit=20" \
     -H "x-admin-key: YOUR_ADMIN_SECRET_KEY"
```

#### E. `gt` 命令行工具 (Docker 风格统一客户端)

除了 HTTP REST API，本项目提供了类似 Docker 的标准终端管理工具 `gt`。

##### 一键全局安装：
任何安装了 Node.js (v18+) 的机器，只需执行以下命令之一即可一键安装 `gt`：

```bash
# 方式 1: 从 GitHub 官方仓库一键安装
curl -fsSL https://raw.githubusercontent.com/Tonyogo/gemini-proxy/main/scripts/install-gt.sh | bash

# 方式 2: 从您已部署的 Gemini-Proxy 服务节点一键安装
curl -fsSL http://<your-proxy-server>:3000/install.sh | bash
```

##### 核心指令与示例：
```bash
# 1. 认证与远程节点管理 (类似 docker login / docker ps)
gt login [server] [key]     # 校验凭据并保存至 ~/.gt/config.json
gt logout                   # 清理本地凭据缓存
gt ps                       # 查看当前在线的远程节点 (类似 docker ps，加 -a 显示全部)
gt ps -a --format "table {{.ID}}\t{{.Name}}\t{{.IP}}\t{{.Status}}" # 自定义表格格式
gt prune                    # 清理离线的节点记录 (类似 docker container prune)

# 2. 远程命令执行 (纯净流式输出，支持短 ID 解析与 Stdin 管道)
gt exec my-host uptime
gt exec -w /var/www my-host ls -la
gt exec --verbose my-host echo "hello"        # 详细模式 (显示开始与耗时 Banner)
cat deploy.sh | gt exec -i my-host bash          # 标准输入流管道支持
gt exec -d my-host "sleep 60 && echo done"       # 后台异步执行并返回 Task ID

# 3. 任务与日志追踪 (支持缺省 taskId 自动推断最近任务)
gt logs -f my-host                            # 实时跟踪节点最近任务的日志流 (智能推断)
gt logs my-host task-1726671234000            # 指定任务 ID 查看日志
gt kill my-host task-1726671234000            # 中断或强杀节点上的任务 (支持 --signal SIGKILL)
gt task ls my-host                            # 查看节点上的所有任务历史

# 4. 双向文件拷贝 (类似 docker cp)
gt cp my-host:/var/log/app.log ./local.log       # 远程文件下载到本地
gt cp ./config.json my-host:/app/config.json     # 本地文件上传到远程

# 5. 本地 Agent 守护进程管理 (gt agent 命名空间)
gt agent run -d worker-1                         # 启动后台常驻 Agent 守护进程
gt agent ps                                      # 查看本地所有 Agent 实例状态 (Running / Stopped)
gt agent logs -f worker-1                        # 实时查看/跟踪 Agent 运行日志
gt agent stop worker-1                           # 停止指定的 Agent (支持 --all 停止全部)
gt agent restart worker-1                        # 重启指定的 Agent
gt agent rm worker-1                             # 清理已停止的 Agent 记录与日志 (支持 --all)
```

---

## 🧭 模型配置与映射关系 (`config/models.json`)

系统受支持的模型列表在 **`config/models.json`** 中动态生成和读取。所有支持内容生成的 Google 原生模型都可以通过其原生 `id`（去除 `models/` 前缀后）被直接调用：

| 客户端请求传入的模型 (ID) | 描述 / 说明 |
| :--- | :--- |
| **`gemini-3.5-flash`** | 直接映射并调度最新的 Gemini 3.5 Flash 模型 |
| **`gemini-2.5-pro`** | 映射至 Google 强大的 2.5 Pro 模型 |
| **`gemini-2.5-flash`** | 映射至高速 2.5 Flash 推理 |
| `gemini-flash-latest` | 动态映射至最新可用 Flash |
| 其它 Gemini 模型名 | 只要是在 models.json 中定义的模型名均支持纯透传调度 |

您只需传入目标 Gemini 模型名称，即可实现完全等价的无缝代理转换。

---

## 🚀 API 接口使用说明

所有请求必须在请求头中带上您的 Gemini API Key 作为鉴权密钥。

### 1. 模型列表与详情查询

#### a. 获取支持的所有模型列表：
**接口：** `GET /v1/models`

**请求示例 (cURL)：**
```bash
curl http://localhost:3000/v1/models \
     -H "x-api-key: YOUR_GEMINI_API_KEY"
```

---

### 2. 创建消息 (非流式响应)

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "x-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "max_tokens": 1024,
       "messages": [
         {"role": "user", "content": "你好，请用一句话介绍你自己。"}
       ]
     }'
```

---

### 3. 创建流式消息 (Server-Sent Events)

通过将 `stream` 设置为 `true`，代理会自动以实时打字机流式输出：

**接口：** `POST /v1/messages`

**请求示例 (cURL)：**
```bash
curl -X POST http://localhost:3000/v1/messages \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
     -d '{
       "model": "gemini-3.5-flash",
       "max_tokens": 1024,
       "stream": true,
       "messages": [
         {"role": "user", "content": "写一首赞美晴天的四言绝句。"}
       ]
     }'
```

---

### 4. 原生 Gemini 协议调用 (免转译直连)

客户端（Google Gen AI SDK、Python `google-generativeai` 或 cURL）可将 `baseUrl` 直接指定为本服务：

#### a. 非流式内容生成
**接口：** `POST /v1beta/models/:model:generateContent`

```bash
curl -X POST "http://localhost:3000/v1beta/models/gemini-2.0-flash:generateContent" \
     -H "Content-Type: application/json" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "contents": [{ "parts": [{ "text": "你好，Gemini！" }] }]
     }'
```

#### b. SSE 流式内容生成
**接口：** `POST /v1beta/models/:model:streamGenerateContent?alt=sse`

```bash
curl -N -X POST "http://localhost:3000/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse" \
     -H "Content-Type: application/json" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY" \
     -d '{
       "contents": [{ "parts": [{ "text": "写一篇关于人工智能发展的短文" }] }]
     }'
```

#### c. 原生模型列表查询
**接口：** `GET /v1beta/models`

```bash
curl "http://localhost:3000/v1beta/models" \
     -H "x-goog-api-key: YOUR_GEMINI_API_KEY"
```

---

## 🛡️ 交易 payload 审计日志 (`logs/YYYY-MM-DD/HH/`)

系统会自动将完整的请求和响应交易数据以**绝对异步、非阻塞（0 延迟阻碍）**的形式分区写入本地文件系统。保存路径支持通过环境变量 `TRANSACTION_LOGS_DIR` 进行自定义配置，按日期与小时自动分层隔离管理。

---

## 🧪 测试验证

本项目包含一套基于 `ts-jest` 驱动的严苛自动化测试集，涵盖翻译协议、流式生命周期、鉴权中间件、Web 控制台组件、多主机终端网关及移动端视口算法：

```bash
# 运行全量单元测试
npm test

# 运行终端与多主机管理专属测试
npx jest tests/terminal*.test.ts

# 单线程模式运行 (规避并发端口占用)
npx jest --runInBand
```

测试执行结果：
```text
PASS tests/terminalWs.test.ts
PASS tests/terminalHostsApi.test.ts
PASS tests/terminalHostManager.test.ts
PASS tests/terminalHostSelector.test.ts
PASS tests/terminalAgent.test.ts
PASS tests/terminalMobileSmoothPush.test.ts
PASS tests/terminalAccessoryBar.test.ts
PASS tests/terminalPersistence.test.ts
PASS tests/claudeTranslator.test.ts
PASS tests/claudeController.test.ts
PASS tests/claudeControllerStreamLifecycle.test.ts
PASS tests/claudeStreaming.test.ts
PASS tests/payloadLogger.test.ts
PASS tests/adminController.test.ts
PASS tests/metricsService.test.ts
...

Test Suites: 64 passed, 64 total
Tests:       1 skipped, 316 passed, 317 total
Snapshots:   0 total
Time:        3.808 s
Ran all test suites.
```
