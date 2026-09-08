# 统一多主机终端与文件管理为纯反向 Agent 架构设计规范

- **状态**: Approved
- **日期**: 2026-09-08
- **模块**: 
  - 后端：`src/admin/services/terminalHostManager.ts`, `src/admin/services/terminalFileService.ts`, `src/admin/routes/terminalWs.ts`, `src/admin/controllers/terminalFileController.ts`
  - 前端：`frontend/src/components/UnifiedTerminalView.tsx`, `frontend/src/components/WebTerminalView.tsx`, `frontend/src/components/terminal/TerminalHostSelector.tsx`, `frontend/src/components/terminal/TerminalFileManagerView.tsx`
  - 脚本与文档：`scripts/terminal-agent.js`, `README.md`, `CLAUDE.md`

---

## 1. 背景与重构动机

### 1.1 现状与问题
- **双轨制架构**：当前系统同时维护了两种终端运行模式：
  1. 宿主机本地模式：由主后端进程通过 `terminalService.ts`（`node-pty`）直接在后端服务器创建常驻 PTY 进程；
  2. 远程 Agent 模式：由独立的 `scripts/terminal-agent.js` 通过反向 WebSocket（`/api/admin/terminal/agent-ws`）接入。
- **行为不一致隐患**：两套 PTY 创建逻辑具有不同的环境变量传递（例如 `TERM_PROGRAM`、`COLUMNS`、`LINES`）和缓冲区管理机制，导致 Claude Code 等 TUI 交互式程序在移动端触摸滚动时表现出模式分化（备用屏 AltScreen vs 普通行滚动 Normal Buffer）。
- **进程耦合度高**：主后端进程直接运行宿主机 PTY 存在资源消耗与权限安全风险。

### 1.2 重构目标
- **架构彻底纯粹化**：主代理服务（Gemini-Proxy Hub）完全只作为网关与反向隧道中心，彻底移除后端内部的本地 `node-pty` spawn 逻辑。
- **全节点平等 Agent 接入**：宿主机和所有远程机器均通过启动 `terminal-agent.js` 统一接入。
- **文件管理全面 RPC 化**：移除服务端本地 `fs` 操作降级逻辑，所有文件管理统一通过 WebSocket `file_rpc` 由 Agent 自治执行。
- **极致的空态与自动切换体验**：无在线节点时呈现清晰的引导卡片与一键启动命令；有节点接入时自动平滑选中首个可用节点。

---

## 2. 架构设计与核心组件变更

```text
┌──────────────────────────────────────────────────────────────┐
│                    Web Browser (PC / 移动端)                  │
│   WebTerminal 交互终端 / 文件管理器 / 节点选择器              │
└──────────────────────────────▲───────────────────────────────┘
                               │  /api/admin/terminal/ws?hostId=...
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    Gemini-Proxy Hub (纯网关)                  │
│  - TerminalHostManager: 纯动态 Agent 节点生命周期与会话管理     │
│  - /api/admin/terminal/agent-ws: 远程与本机 Agent 反向 WebSocket│
│  - TerminalFileService: 统一通过 RPC 转发至对应 Agent 执行     │
└───────────────▲──────────────────────────────▲───────────────┘
                │ 反向 WebSocket 通道           │ 反向 WebSocket 通道
                │ (双向 stdio + file_rpc)       │ (双向 stdio + file_rpc)
┌───────────────┴──────────────┐ ┌─────────────┴───────────────┐
│       局域网/远程主机 A        │ │   宿主机 (运行 terminal-agent) │
│ node scripts/terminal-agent.js │ │ node scripts/terminal-agent.js │
└──────────────────────────────┘ └─────────────────────────────┘
```

### 2.1 后端精简与解耦 (`src/admin/`)

1. **废弃并移除 `terminalService.ts`**：
   - 彻底删除本地 PTY 创建与管理的 `PersistentTerminalSession`，解除主服务对本地直接调起 shell 的依赖。
2. **重构 `TerminalHostManager` (`src/admin/services/terminalHostManager.ts`)**：
   - 移除 `LocalTerminalSessionWrapper` 类；
   - 移除构造函数中的 `this.initLocalHost()`；
   - `this.hosts` 和 `this.sessions` 初始化为空 `Map`，仅在收到 Agent WebSocket 连接注册时动态添加；
   - `getSession(hostId)`：若查询的主机未连接或已离线，直接返回 `null`。
3. **全面 RPC 化的 `TerminalFileService` (`src/admin/services/terminalFileService.ts`)**：
   - 移除 `resolveLocalPath`、本地 `fs.promises` 读取/写入/遍历文件逻辑；
   - 所有文件操作方法（`listFiles`, `readFileContent`, `saveFileContent`, `createDirectory`, `renamePath`, `deletePath`, `uploadFileChunk`, `downloadFileChunk`）直接校验目标 `hostId` 是否在线，若在线则通过 `rpcAgent` 转发给 Agent 进程执行，否则返回错误 `{ success: false, error: 'Host is offline or unavailable' }`。
4. **WebSocket 终端网关更新 (`src/admin/routes/terminalWs.ts`)**：
   - 当客户端连接 `/api/admin/terminal/ws?hostId=...` 时，若未提供 `hostId` 或对应节点离线，向客户端发送格式化的离线状态信息并优雅断开。

### 2.2 前端体验与空态引导 (`frontend/src/`)

1. **主机选择器 (`TerminalHostSelector.tsx`)**：
   - 移除写死的 `localHostFallback`；
   - 当 `hosts` 列表更新时：
     - 若当前记录的 `activeHostId` 存在于在线列表，保持选中；
     - 若当前记录的 `activeHostId` 不在线但存在其他在线主机，自动平滑切换至第一个在线主机，并持久化到 `localStorage`；
     - 若没有任何在线主机，`activeHostId` 置空（`''`）；
   - 在选择器右侧和弹出层清晰展示“暂无在线节点”并提供添加节点命令。
2. **WebTerminal 视口空态卡片 (`WebTerminalView.tsx`)**：
   - 当 `activeHostId` 为空或当前选中的节点离线时，隐藏 xterm 终端画布，展示现代化毛玻璃质感的**空态引导面板 (Terminal Empty State)**：
     - 图标与标题：`TerminalSquare` 图标，`当前暂无在线终端节点`；
     - 说明文案：告知用户通过启动 `terminal-agent.js` 将本机或远程服务器接入；
     - 快捷代码块：展示一键启动命令（包含当前服务端 IP/端口与自动填充的 admin-key），附带一键复制按钮；
     - 刷新检测按钮：手动触发节点状态重新轮询。
3. **文件管理器空态卡片 (`TerminalFileManagerView.tsx`)**：
   - 当没有在线节点时，同理展示友好的空态提示，引导用户启动 Agent 连接。

---

## 3. 测试与验证策略

1. **后端单元与集成测试重构**：
   - 更新 `tests/terminalHostManager.test.ts`：测试纯动态 Agent 的注册、注销、心跳检测与会话获取，确保移除 `local` 默认节点后逻辑完整。
   - 更新 `tests/terminalWs.test.ts`：测试客户端连接未注册主机时的离线处理与连接已注册 Agent 时的数据互通。
   - 更新 `tests/terminalHostsApi.test.ts`：验证 `/api/admin/terminal/hosts` 接口正确反映动态注册的 Agent 列表。
   - 更新 `tests/terminalFileManager.test.ts`：验证文件管理纯 RPC 转发逻辑。
2. **前端与编译验证**：
   - 运行 `npx jest` 确保全量测试套件通过；
   - 运行 `npm run build:frontend` 验证 React/TypeScript 零警告与零编译错误；
   - 运行 `npm run build:backend` 验证 TypeScript 后端编译通过。

---

## 4. 迁移与兼容性说明

- 开发者在本地或服务器启动项目后，若需要使用 WebTerminal，只需在宿主机后台或另外的终端窗口执行：
  ```bash
  npm run terminal-agent
  ```
  该脚本会自动读取 `.env` 中的 `ADMIN_SECRET_KEY` 和服务端口，秒级自动接入并命名为当前机器 Hostname。
