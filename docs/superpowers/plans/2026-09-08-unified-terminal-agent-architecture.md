# 统一多主机终端与文件管理为纯反向 Agent 架构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将系统终端与文件管理架构彻底重构为纯反向 Agent 统一架构，移除 Proxy 后端内置的宿主机本地 PTY 生成与本地直接 `fs` 降级，所有主机（宿主机与远程节点）统一通过 `scripts/terminal-agent.js` 反向接入，并在 Web 前端提供优雅的空态引导与多节点自动切换。

**Architecture:** 
1. **后端纯网关化 (`src/admin/`)**: 移除 `terminalService.ts` 中的本地 PTY 创建与 `LocalTerminalSessionWrapper`，`TerminalHostManager` 仅管理动态连接注册的 Agent；`TerminalFileService` 全面 RPC 化，所有文件请求通过 WebSocket 路由至对应 Agent 执行。
2. **前端无状态自适应与空态卡片 (`frontend/src/`)**: 移除硬编码的 `local` 假定；当没有节点在线时，在终端和文件管理器区域展示精美毛玻璃空态引导卡片，提供当前服务地址的一键启动命令与刷新检测；当节点上线时平滑自动选中并连接。
3. **测试重构与全量验证 (`tests/`)**: 适配纯动态 Agent 测试断言，确保全量测试套件 100% 通过及生产构建零错误。

**Tech Stack:** TypeScript, Node.js, Express, WebSocket (`ws`), node-pty, React 18, Tailwind CSS, Lucide React, Jest.

## Global Constraints

- **零内置本地 PTY**: 服务端后端进程严禁直接 spawn 本地 Shell，所有终端连接必须由对应 Agent 提供 PTY 支持。
- **纯 RPC 文件管理**: `TerminalFileService` 不包含任何针对服务端的本地 `fs` 操作，所有文件操作均通过 `file_rpc` 派发。
- **空态零崩溃与自愈**: 无任何 Agent 在线时，前端各视图平稳渲染引导卡片，不抛出任何 WebSocket 崩溃或未捕获异常。
- **全量测试与构建通过**: 确保 `npm test`、`npm run build:frontend` 与 `npm run build:backend` 均 100% 通过。

---

### Task 1: 重构 `TerminalHostManager` 与废弃 `terminalService` 本地会话

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts`
- Modify: `src/admin/services/terminalService.ts`
- Test: `tests/terminalHostManager.test.ts`
- Test: `tests/terminalService.test.ts`
- Test: `tests/terminalPersistence.test.ts`

**Interfaces:**
- `ManagedHost`: `{ id: string; name: string; hostname: string; ip: string; platform: string; status: 'online' | 'offline'; lastSeen: number; type: 'agent' }` (type 仅为 `'agent'`)
- `terminalHostManager.getHosts()`: 返回已注册的 Agent 列表（初始为空数组）
- `terminalHostManager.getSession(hostId)`: 若 hostId 存在且在线返回 `RemoteAgentTerminalSession`，否则返回 `null`

- [x] **Step 1: 编写/更新 `tests/terminalHostManager.test.ts` 测试用例**

```ts
import { TerminalHostManager, RemoteAgentTerminalSession } from '../src/admin/services/terminalHostManager';

describe('TerminalHostManager (Pure Dynamic Agent)', () => {
  let manager: TerminalHostManager;

  beforeEach(() => {
    manager = new TerminalHostManager();
  });

  test('initializes with empty hosts list', () => {
    const hosts = manager.getHosts();
    expect(hosts).toEqual([]);
    expect(manager.getSession('local')).toBeNull();
    expect(manager.getSession('non-existent')).toBeNull();
  });

  test('registers and unregisters remote agent correctly', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    const host = manager.registerAgent({
      hostId: 'agent-1',
      name: 'Test-Node',
      hostname: 'test-node',
      ip: '192.168.1.50',
      platform: 'linux',
      agentWs: mockWs,
    });

    expect(host.id).toBe('agent-1');
    expect(host.status).toBe('online');
    expect(manager.getHosts().length).toBe(1);

    const session = manager.getSession('agent-1');
    expect(session).toBeInstanceOf(RemoteAgentTerminalSession);

    manager.unregisterAgent('agent-1');
    expect(manager.getHost('agent-1')?.status).toBe('offline');
  });
});
```

- [x] **Step 2: 运行测试并验证失败**

Run: `npx jest tests/terminalHostManager.test.ts`
Expected: FAIL (because manager currently initializes `'local'` host).

- [x] **Step 3: 修改 `src/admin/services/terminalHostManager.ts`**

移除 `LocalTerminalSessionWrapper`，移除 `this.initLocalHost()`，确保 `hosts` 与 `sessions` 初始为空，仅通过 Agent 动态注册。

- [x] **Step 4: 清理 `src/admin/services/terminalService.ts` 并更新相关测试**

移除不再需要的 `getDefaultTerminalSession`、`destroyDefaultTerminalSession`、`PersistentTerminalSession`，保留 `TerminalSessionOptions` 导出（供工具函数或测试引用）。更新 `tests/terminalService.test.ts` 与 `tests/terminalPersistence.test.ts`。

- [x] **Step 5: 运行测试并验证通过**

Run: `npx jest tests/terminalHostManager.test.ts tests/terminalService.test.ts`
Expected: PASS.

- [x] **Step 6: 提交更改**

```bash
git add src/admin/services/terminalHostManager.ts src/admin/services/terminalService.ts tests/terminalHostManager.test.ts tests/terminalService.test.ts tests/terminalPersistence.test.ts
git commit -m "refactor(terminal): remove local host hardcoding and make terminal host manager pure dynamic agent"
```

---

### Task 2: 全面 RPC 化 `TerminalFileService` 与控制器

**Files:**
- Modify: `src/admin/services/terminalFileService.ts`
- Modify: `src/admin/controllers/terminalFileController.ts`
- Test: `tests/terminalFileManager.test.ts`

**Interfaces:**
- `terminalFileService.listFiles(hostId: string, path?: string)`: 必须接收有效 `hostId`，若节点未连接直接返回 `{ success: false, error: 'Host is offline or unavailable' }`，否则通过 `rpcAgent` 转发。
- `terminalFileController.*`: 从 `req.query.hostId` 或 `req.body.hostId` 获取目标主机 ID，若缺失或离线返回对应 400/404/500 JSON。

- [x] **Step 1: 编写/更新 `tests/terminalFileManager.test.ts` 纯 RPC 测试用例**

```ts
import { terminalFileService } from '../src/admin/services/terminalFileService';
import { terminalHostManager } from '../src/admin/services/terminalHostManager';

describe('TerminalFileService Pure RPC', () => {
  test('returns error when hostId is not connected', async () => {
    const res = await terminalFileService.listFiles('offline-host', '/tmp');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/offline|not found|unavailable/i);
  });

  test('routes listFiles via RPC when agent is connected', async () => {
    const mockWs = {
      readyState: 1,
      send: jest.fn((msg: string) => {
        if (msg.startsWith('JSON:')) {
          const parsed = JSON.parse(msg.slice(5));
          if (parsed.type === 'file_rpc') {
            terminalHostManager.handleAgentRpcResponse({
              reqId: parsed.reqId,
              success: true,
              data: {
                currentPath: '/home/user',
                parentPath: '/home',
                separator: '/',
                files: [{ name: 'test.txt', path: '/home/user/test.txt', isDirectory: false, size: 10, updatedAt: Date.now(), extension: 'txt' }],
              },
            });
          }
        }
      }),
    };

    terminalHostManager.registerAgent({
      hostId: 'agent-rpc-test',
      name: 'Agent-RPC',
      agentWs: mockWs,
    });

    const res = await terminalFileService.listFiles('agent-rpc-test', '/home/user');
    expect(res.success).toBe(true);
    expect(res.files.length).toBe(1);
    expect(res.files[0].name).toBe('test.txt');

    terminalHostManager.unregisterAgent('agent-rpc-test');
  });
});
```

- [x] **Step 2: 运行测试并验证失败**

Run: `npx jest tests/terminalFileManager.test.ts`
Expected: FAIL (due to residual local filesystem fallback branches).

- [x] **Step 3: 重构 `src/admin/services/terminalFileService.ts`**

移除 `resolveLocalPath` 与服务端 `fs` 操作，将所有方法收归至统一的 `this.rpcAgent(hostId, action, path, params)` 调用。

- [x] **Step 4: 更新 `src/admin/controllers/terminalFileController.ts`**

移除 `hostId = 'local'` 默认值，直接提取 `hostId`，若为空则返回 400 错误 `{ success: false, error: 'hostId is required' }`。

- [x] **Step 5: 运行测试并验证通过**

Run: `npx jest tests/terminalFileManager.test.ts`
Expected: PASS.

- [x] **Step 6: 提交更改**

```bash
git add src/admin/services/terminalFileService.ts src/admin/controllers/terminalFileController.ts tests/terminalFileManager.test.ts
git commit -m "refactor(terminal): make terminal file service 100% RPC-driven across all hosts"
```

---

### Task 3: 更新 WebSocket 终端网关与相关测试

**Files:**
- Modify: `src/admin/routes/terminalWs.ts`
- Test: `tests/terminalWs.test.ts`
- Test: `tests/terminalHostsApi.test.ts`
- Test: `tests/terminalReplayMute.test.ts`

**Interfaces:**
- 当客户端连接 `/api/admin/terminal/ws?hostId=...` 且 `hostId` 不存在或离线时：向客户端发送友好提示 `\r\n\x1b[33m[Host Offline] Host "${hostId}" is offline or unavailable.\x1b[0m\r\n`，并关闭连接 (1008)。
- 收到有效 agent 连接时动态注册，断开时注销。

- [x] **Step 1: 更新 `tests/terminalWs.test.ts` 和 `tests/terminalHostsApi.test.ts`**

更新测试用例，使测试通过注册模拟 Agent 来验证终端 WebSocket 转发与 Hosts API 响应。

- [x] **Step 2: 修改 `src/admin/routes/terminalWs.ts`**

优化未指定 `hostId` 时的防护与离线提示。

- [x] **Step 3: 运行网关测试集**

Run: `npx jest tests/terminalWs.test.ts tests/terminalHostsApi.test.ts tests/terminalReplayMute.test.ts`
Expected: PASS.

- [x] **Step 4: 提交更改**

```bash
git add src/admin/routes/terminalWs.ts tests/terminalWs.test.ts tests/terminalHostsApi.test.ts tests/terminalReplayMute.test.ts
git commit -m "refactor(terminal): update terminal websocket gateway for dynamic agent sessions"
```

---

### Task 4: 前端语言包与 `TerminalHostSelector` 优化

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Test: `tests/terminalHostSelector.test.ts`

**Interfaces:**
- 新增 i18n 键：`webTerminal.emptyState.title`、`webTerminal.emptyState.desc`、`webTerminal.emptyState.copyCmd`、`webTerminal.emptyState.checkAgain`、`webTerminal.emptyState.noOnlineHosts` 等。
- `TerminalHostSelector`: 移除 `localHostFallback`；当 `hosts` 变动时，若当前 `activeHostId` 不在列表中，自动切换为第一个在线 host 并触发 `onSelectHost`；若列表为空，传递 `''`。

- [x] **Step 1: 编写/更新 `tests/terminalHostSelector.test.ts`**

```ts
import fs from 'fs';
import path from 'path';

describe('TerminalHostSelector Pure Agent Tests', () => {
  const selectorPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalHostSelector.tsx');
  const content = fs.readFileSync(selectorPath, 'utf-8');

  test('does not hardcode localHostFallback object with localhost', () => {
    expect(content).not.toContain('localHostFallback');
  });

  test('auto selects first online host when current host is absent', () => {
    expect(content).toContain('onSelectHost');
  });
});
```

- [x] **Step 2: 扩展中英文语言包 (`zh.ts`, `en.ts`)**

增加终端与文件管理器空态文案、一键命令提示文案。

- [x] **Step 3: 修改 `frontend/src/components/terminal/TerminalHostSelector.tsx`**

移除 `localHostFallback`，优化节点列表选择逻辑与节点计数徽章。

- [x] **Step 4: 运行测试并验证通过**

Run: `npx jest tests/terminalHostSelector.test.ts`
Expected: PASS.

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/terminal/TerminalHostSelector.tsx tests/terminalHostSelector.test.ts
git commit -m "feat(terminal): update host selector for pure agent architecture and add empty state i18n"
```

---

### Task 5: 前端 WebTerminal 与 UnifiedView 空态卡片与自动连接

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/components/UnifiedTerminalView.tsx`
- Test: `tests/terminalEmptyState.test.ts`

**Interfaces:**
- 当 `!activeHostId` 或当前节点离线且无在线节点时：
  - 渲染 `TerminalEmptyState` 组件：毛玻璃容器、`TerminalSquare` 图标、标题“当前暂无在线终端节点”、说明文本、包含当前 `window.location.origin` 与 `adminKey` 的一键启动命令、一键复制按钮、重新检测刷新按钮。
- 当有可用节点时：平滑挂载 xterm 终端画布并初始化 WebSocket。

- [x] **Step 1: 编写 `tests/terminalEmptyState.test.ts`**

```ts
import fs from 'fs';
import path from 'path';

describe('WebTerminal Empty State Tests', () => {
  const terminalViewPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const content = fs.readFileSync(terminalViewPath, 'utf-8');

  test('contains empty state rendering when no active host is connected', () => {
    expect(content).toContain('webTerminal.emptyState');
    expect(content).toContain('npm run terminal-agent');
    expect(content).toContain('terminal-empty-state');
  });
});
```

- [x] **Step 2: 运行测试并验证初始失败**

Run: `npx jest tests/terminalEmptyState.test.ts`
Expected: FAIL.

- [x] **Step 3: 在 `WebTerminalView.tsx` 中实现空态组件与渲染逻辑**

在未连接有效 Host 时渲染空态卡片，阻止无效 WebSocket 轮询；在有 Host 时正常启动 xterm 实例。

- [x] **Step 4: 更新 `UnifiedTerminalView.tsx` 联动逻辑**

当 `activeHostId` 切换或离线时保持状态同步。

- [x] **Step 5: 运行测试并验证通过**

Run: `npx jest tests/terminalEmptyState.test.ts`
Expected: PASS.

- [x] **Step 6: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx frontend/src/components/UnifiedTerminalView.tsx tests/terminalEmptyState.test.ts
git commit -m "feat(terminal): implement rich empty state card and smooth auto-switch in WebTerminal"
```

---

### Task 6: 前端 `TerminalFileManagerView` 空态处理

**Files:**
- Modify: `frontend/src/components/terminal/TerminalFileManagerView.tsx`

**Interfaces:**
- 当 `!activeHostId` 时，文件管理器展示空态卡片，提示连接 Agent 后即可远程管理主机文件与上传下载。

- [x] **Step 1: 修改 `TerminalFileManagerView.tsx`**

在无有效 `activeHostId` 时显示空态卡片，避免发出无效的 `/api/admin/terminal/files` 请求。

- [x] **Step 2: 运行构建验证**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

- [x] **Step 3: 提交更改**

```bash
git add frontend/src/components/terminal/TerminalFileManagerView.tsx
git commit -m "feat(terminal): add empty state guard for terminal file manager"
```

---

### Task 7: 全量测试套件验证、编译构建与文档更新

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Test: All tests in `tests/`

- [x] **Step 1: 运行全量自动化测试**

Run: `npm test`
Expected: 60+ Test Suites, 300+ tests ALL PASS.

- [x] **Step 2: 验证前后端全量生产构建**

Run: `npm run build`
Expected: Frontend Vite build and Backend tsc build both succeed cleanly.

- [x] **Step 3: 更新 `README.md` 与 `CLAUDE.md` 架构文档**

更新关于 WebTerminal 启动与多主机反向 Agent 纳管说明（宿主机与远程主机统一通过 `npm run terminal-agent` 启动）。

- [x] **Step 4: 提交最终文档与代码**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update terminal architecture documentation for pure reverse agent model"
```
