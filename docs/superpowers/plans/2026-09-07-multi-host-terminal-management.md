# WebTerminal 多机器内网纳管与反向 Agent 桥接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 WebTerminal 支持反向 Agent 客户端注册与多机器内网集中管理，通过双向 WebSocket 桥接网关打通私有机器 PTY 与 Web 终端，支持前端顶部节点切换器无缝切换各内网机器会话。

**Architecture:** 
Proxy 网关端构建单例 `TerminalHostManager` 统一管理宿主机（localhost）及反向注册的 Agent 节点，抽象 `ITerminalSession` 接口隔离本地 PTY 与远程代理 PTY；在 WebSocket 网关中支持 `agent-ws` 反向长连接与带有 `hostId` 路由的前端连接；开发极简同构 Node.js Agent 客户端 `scripts/terminal-agent.js`；在前端 `WebTerminalView` 增加节点选择器组件与会话平滑切换逻辑。

**Tech Stack:** Node.js, Express, WebSocket (`ws`), `node-pty`, React 18, Tailwind CSS, Jest.

## Global Constraints

- **安全第一**: Agent 注册与前端连接均须通过现有的 `ADMIN_SECRET_KEY` 强校验，鉴权失败立即拒绝连接并断开 socket。
- **天然内网穿透**: 由 Agent 主动发起反向连接到 Proxy 网关，内网机器无需配置公网 IP 或开放 SSH 端口。
- **向后兼容**: 默认不带 `hostId` 或 `hostId=local` 时，完全等价于现有的本机终端体验，已有功能零破坏。
- **心跳自愈**: Hub 定期发送 ping 检测存活，Agent 端具备断线指数退避自动重连。

---

### Task 1: 终端会话抽象与主机管理器 (`terminalHostManager.ts`)

**Files:**
- Create: `src/admin/services/terminalHostManager.ts`
- Test: `tests/terminalHostManager.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ManagedHost {
    id: string;
    name: string;
    hostname: string;
    ip: string;
    platform: string;
    status: 'online' | 'offline';
    lastSeen: number;
    type: 'local' | 'agent';
  }

  export interface ITerminalSession {
    attach(ws: any): void;
    detach(ws: any): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    reset(): void;
    destroy(): void;
  }

  export class TerminalHostManager {
    public registerAgent(metadata: {
      hostId: string;
      name?: string;
      hostname?: string;
      ip?: string;
      platform?: string;
      agentWs: any;
    }): ManagedHost;
    public unregisterAgent(hostId: string): void;
    public getHosts(): ManagedHost[];
    public getSession(hostId?: string): ITerminalSession | null;
    public handleAgentData(hostId: string, data: any): void;
  }

  export const terminalHostManager: TerminalHostManager;
  ```

- [x] **Step 1: 编写失败的单元测试**

Create `tests/terminalHostManager.test.ts`:
```ts
import { TerminalHostManager } from '../src/admin/services/terminalHostManager';

describe('TerminalHostManager', () => {
  let manager: TerminalHostManager;

  beforeEach(() => {
    manager = new TerminalHostManager();
  });

  test('initializes with a default local host', () => {
    const hosts = manager.getHosts();
    expect(hosts.length).toBeGreaterThanOrEqual(1);
    const local = hosts.find((h) => h.id === 'local');
    expect(local).toBeDefined();
    expect(local?.type).toBe('local');
    expect(local?.status).toBe('online');
  });

  test('can register an agent host and retrieve its session', () => {
    const mockAgentWs = {
      readyState: 1,
      send: jest.fn(),
      on: jest.fn(),
    };

    const host = manager.registerAgent({
      hostId: 'agent-01',
      name: 'Test Worker Node',
      hostname: 'worker-ubuntu',
      ip: '192.168.1.100',
      platform: 'linux',
      agentWs: mockAgentWs,
    });

    expect(host.id).toBe('agent-01');
    expect(host.status).toBe('online');
    expect(host.type).toBe('agent');

    const session = manager.getSession('agent-01');
    expect(session).not.toBeNull();

    // Writing to remote session pipes to agentWs
    session?.write('ls -la\n');
    expect(mockAgentWs.send).toHaveBeenCalledWith('ls -la\n');

    // Resizing session pipes control frame to agentWs
    session?.resize(100, 30);
    expect(mockAgentWs.send).toHaveBeenCalledWith('JSON:{"type":"resize","cols":100,"rows":30}');
  });

  test('relays agent data to attached client websockets and records buffer history', () => {
    const mockAgentWs = {
      readyState: 1,
      send: jest.fn(),
      on: jest.fn(),
    };

    manager.registerAgent({
      hostId: 'agent-02',
      agentWs: mockAgentWs,
    });

    const session = manager.getSession('agent-02');
    const mockClientWs = {
      readyState: 1,
      send: jest.fn(),
    };

    session?.attach(mockClientWs);

    // Incoming output from agent
    manager.handleAgentData('agent-02', 'terminal-prompt $ ');
    expect(mockClientWs.send).toHaveBeenCalledWith('terminal-prompt $ ');

    // Detach client
    session?.detach(mockClientWs);
    manager.handleAgentData('agent-02', 'new line');
    expect(mockClientWs.send).not.toHaveBeenCalledWith('new line');
  });

  test('marks host offline on unregister or agent disconnect', () => {
    const mockAgentWs = { readyState: 1, send: jest.fn(), on: jest.fn() };
    manager.registerAgent({ hostId: 'agent-03', agentWs: mockAgentWs });
    expect(manager.getHost('agent-03')?.status).toBe('online');

    manager.unregisterAgent('agent-03');
    expect(manager.getHost('agent-03')?.status).toBe('offline');
  });
});
```

- [x] **Step 2: 运行测试并验证测试失败**

Run: `npx jest tests/terminalHostManager.test.ts`
Expected: FAIL with "Cannot find module '../src/admin/services/terminalHostManager'"

- [x] **Step 3: 实现 `terminalHostManager.ts`**

Create `src/admin/services/terminalHostManager.ts`:
- 定义 `ManagedHost` 与 `ITerminalSession` 接口；
- 实现 `RemoteAgentTerminalSession`，包含环形历史回放 buffer、attached WebSockets 列表与向 Agent 发送的透传；
- 实现 `LocalTerminalSessionWrapper`，包装现有的 `getDefaultTerminalSession()`；
- 实现 `TerminalHostManager`：
  - 管理内置的 `local` 节点与动态注册的 `agent` 节点；
  - 维护各主机的心跳探测定时器与断线超时清理。

- [x] **Step 4: 运行测试并验证测试通过**

Run: `npx jest tests/terminalHostManager.test.ts`
Expected: PASS with all tests passing.

- [x] **Step 5: 提交更改**

```bash
git add src/admin/services/terminalHostManager.ts tests/terminalHostManager.test.ts
git commit -m "feat(terminal): implement TerminalHostManager and session abstraction"
```

---

### Task 2: 服务端 WebSocket 网关升级与主机 REST API

**Files:**
- Modify: `src/admin/routes/terminalWs.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Modify: `src/admin/controllers/adminController.ts`
- Test: `tests/terminalHostsApi.test.ts`

**Interfaces:**
- Consumes:
  - `terminalHostManager` from `../services/terminalHostManager`
- Produces:
  - `GET /api/admin/terminal/hosts` REST API
  - `/api/admin/terminal/agent-ws` 反向 Agent 注册通道
  - `/api/admin/terminal/ws?hostId=...` 多机器终端网关

- [ ] **Step 1: 编写 REST API 与 WebSocket 路由的测试用例**

Create `tests/terminalHostsApi.test.ts`:
```ts
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

describe('Admin Terminal Hosts API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  test('rejects GET /api/admin/terminal/hosts without valid admin key', async () => {
    const res = await request(app).get('/api/admin/terminal/hosts');
    expect(res.status).toBe(401);
  });

  test('returns hosts list including localhost with valid admin key', async () => {
    const key = config.adminSecretKey || 'test-key';
    const res = await request(app)
      .get('/api/admin/terminal/hosts')
      .set('x-admin-key', key);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hosts');
    expect(Array.isArray(res.body.hosts)).toBe(true);
    const local = res.body.hosts.find((h: any) => h.id === 'local');
    expect(local).toBeDefined();
    expect(local.status).toBe('online');
  });
});
```

- [ ] **Step 2: 运行测试并验证测试失败**

Run: `npx jest tests/terminalHostsApi.test.ts`
Expected: FAIL with 404 (Route not found).

- [ ] **Step 3: 添加 REST API 路由与控制器方法**

In `src/admin/controllers/adminController.ts`:
```ts
  public async getTerminalHosts(req: Request, res: Response): Promise<void> {
    const hosts = terminalHostManager.getHosts();
    res.json({ hosts });
  }
```
In `src/admin/routes/adminRoutes.ts`:
```ts
router.get('/terminal/hosts', (req, res) => adminController.getTerminalHosts(req, res));
```

- [ ] **Step 4: 升级 `terminalWs.ts` 支持 `agent-ws` 与多机路由**

In `src/admin/routes/terminalWs.ts`:
1. 监听 `/api/admin/terminal/agent-ws`：
   - 验证 `x-admin-key`；
   - 提取 `hostId`, `name`, `hostname`, `ip`, `platform`；
   - 注册至 `terminalHostManager.registerAgent(...)`；
   - 处理 agent 发送的终端流与 `JSON:` 控制帧；
   - 监听 `close` / `error` 事件注销或标记离线。
2. 升级 `/api/admin/terminal/ws`：
   - 解析 URL Query `hostId`（未提供时默认为 `'local'`）；
   - 从 `terminalHostManager.getSession(hostId)` 获取对应的终端会话并 `session.attach(ws)`。

- [ ] **Step 5: 运行测试并验证通过**

Run: `npx jest tests/terminalHostsApi.test.ts`
Expected: PASS.

- [ ] **Step 6: 提交更改**

```bash
git add src/admin/routes/terminalWs.ts src/admin/routes/adminRoutes.ts src/admin/controllers/adminController.ts tests/terminalHostsApi.test.ts
git commit -m "feat(terminal): add agent-ws endpoint and terminal hosts REST API"
```

---

### Task 3: 轻量 Agent 客户端实现 (`scripts/terminal-agent.js`)

**Files:**
- Create: `scripts/terminal-agent.js`
- Modify: `package.json` (添加启动脚本 `terminal-agent`)
- Test: `tests/terminalAgent.test.ts`

**Interfaces:**
- Produces:
  - 命令行可执行 Node 脚本: `node scripts/terminal-agent.js --server=... --key=... --name=...`
  - 自动获取内网 IPv4 与操作系统平台
  - 创建本地 PTY 进程并将 stdio 与 WebSocket 进行双向 Pipe

- [ ] **Step 1: 编写 Agent 逻辑测试用例**

Create `tests/terminalAgent.test.ts`:
```ts
import fs from 'fs';
import path from 'path';

describe('Terminal Agent Script', () => {
  const agentPath = path.resolve(__dirname, '../scripts/terminal-agent.js');

  test('terminal-agent script exists and is executable', () => {
    expect(fs.existsSync(agentPath)).toBe(true);
    const content = fs.readFileSync(agentPath, 'utf-8');
    expect(content).toContain('node-pty');
    expect(content).toContain('WebSocket');
    expect(content).toContain('--server');
    expect(content).toContain('--key');
  });

  test('package.json includes terminal-agent script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.scripts['terminal-agent']).toBeDefined();
    expect(pkg.scripts['terminal-agent']).toContain('scripts/terminal-agent.js');
  });
});
```

- [ ] **Step 2: 运行测试并验证失败**

Run: `npx jest tests/terminalAgent.test.ts`
Expected: FAIL because `scripts/terminal-agent.js` does not exist yet.

- [ ] **Step 3: 编写 `scripts/terminal-agent.js`**

Create `scripts/terminal-agent.js`:
- 参数解析（`--server`, `--key`, `--name`, `--id`, `--shell`）；
- 内网 IP 自动检测（过滤 127.0.0.1，挑选有效局域网地址）；
- 使用 `node-pty` 根据系统类型（Linux/macOS bash/zsh, Windows powershell）拉起 PTY；
- 建立 WebSocket 客户端连接到 `${server}/api/admin/terminal/agent-ws`；
- 监听并处理来自 Hub 的 resize / reset / ping 控制信令；
- 实现指数退避自动重连机制（网络抖动时 2s, 4s, 8s 重试）。
并在 `package.json` 添加 `"terminal-agent": "node scripts/terminal-agent.js"`。

- [ ] **Step 4: 运行测试并验证通过**

Run: `npx jest tests/terminalAgent.test.ts`
Expected: PASS.

- [ ] **Step 5: 提交更改**

```bash
git add scripts/terminal-agent.js package.json tests/terminalAgent.test.ts
git commit -m "feat(terminal): add standalone terminal-agent script for intranet hosts"
```

---

### Task 4: 前端节点选择器（Node Selector）与会话切换组件

**Files:**
- Create: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Modify: `frontend/src/components/WebTerminalView.tsx`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Test: `tests/terminalHostSelector.test.ts`

**Interfaces:**
- Produces:
  - `TerminalHostSelector`: 顶部下拉选择器组件
  - 前端支持带 `hostId` 参数连接 WebSocket
  - 本地缓存记住最后选中的节点 (`localStorage.getItem('terminal_active_host')`)
  - “接入新节点向导” 弹窗（一键复制 Agent 运行命令）

- [ ] **Step 1: 编写前端组件的失败测试**

Create `tests/terminalHostSelector.test.ts`:
```ts
import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('Terminal Host Selector & Multi-host Frontend Integration', () => {
  const selectorPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalHostSelector.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  test('TerminalHostSelector component exists', () => {
    expect(fs.existsSync(selectorPath)).toBe(true);
  });

  test('WebTerminalView integrates hostId state and host switching', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');
    expect(content).toContain('activeHostId');
    expect(content).toContain('TerminalHostSelector');
    expect(content).toContain('hostId=');
  });

  test('i18n locales contain multi-host translations', () => {
    expect((en as any).webTerminal.hostSelector).toBeDefined();
    expect((zh as any).webTerminal.hostSelector).toBeDefined();
    expect((zh as any).webTerminal.hostSelector.localhost).toBe('本地宿主机');
  });
});
```

- [ ] **Step 2: 运行测试并验证失败**

Run: `npx jest tests/terminalHostSelector.test.ts`
Expected: FAIL because `TerminalHostSelector.tsx` and i18n keys are missing.

- [ ] **Step 3: 添加多机器中英文翻译字典**

In `frontend/src/i18n/locales/en.ts` and `frontend/src/i18n/locales/zh.ts`:
- 添加 `hostSelector`: `localhost`, `addNode`, `copyCommand`, `online`, `offline`, `switchHostPrompt`, `filterPlaceholder` 等。

- [ ] **Step 4: 实现 `TerminalHostSelector.tsx`**

Create `frontend/src/components/terminal/TerminalHostSelector.tsx`:
- 紧凑的胶囊触发按钮，显示当前选中的主机图标、主机名与在线绿点；
- 下拉浮层：展示机器列表（按在线优先排序）、过滤输入框；
- 接入指引对话框（展示基于当前 URL 和 key 自动生成的 Agent 一键运行命令）。

- [ ] **Step 5: 将选择器接入 `WebTerminalView.tsx`**

In `frontend/src/components/WebTerminalView.tsx`:
- 增加 `activeHostId` 状态（初始化从 `localStorage.getItem('terminal_active_host') || 'local'` 读取）；
- 在 `initWebSocket` 中将 `&hostId=${activeHostId}` 附加到 ws 连接 URL；
- 节点切换回调 `handleHostChange(newHostId)`：更新状态、更新 localStorage、清空当前终端并重连 WebSocket（服务端将自动重放该机器的终端 history buffer）。

- [ ] **Step 6: 运行测试并验证通过**

Run: `npx jest tests/terminalHostSelector.test.ts`
Expected: PASS.

- [ ] **Step 7: 提交更改**

```bash
git add frontend/src/components/terminal/TerminalHostSelector.tsx frontend/src/components/WebTerminalView.tsx frontend/src/i18n/locales/ tests/terminalHostSelector.test.ts
git commit -m "feat(terminal): add TerminalHostSelector and multi-host switching in WebTerminal"
```

---

### Task 5: 整体集成验证与生产构建测试

**Files:**
- All touched files
- Test: All tests

- [ ] **Step 1: 运行完整单元测试套件**

Run: `npx jest tests/terminal*.test.ts tests/mobileViewport*.test.ts`
Expected: PASS with 100% tests passing.

- [ ] **Step 2: 执行前后端全量生产构建**

Run: `npm run build`
Expected: `dist/frontend` 和 `dist/src` 全部无报错编译生成。

- [ ] **Step 3: 提交最终文档与代码**

```bash
git status
git commit -m "chore: verify and complete multi-host terminal implementation"
```
