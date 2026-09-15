# WebTerminal 主机选择器交互优化与离线节点清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决 WebTerminal 主机选择器超过 3 个节点时被父容器截断无法选中的问题，并实现 24 小时过期离线节点自动清理及前端一键手动清理离线节点与离线时间友好展示。

**Architecture:** 
- 后端：在 `terminalHostManager.ts` 中引入 `pruneOfflineHosts(maxAgeMs)` 方法与 24 小时自动淘汰定时器，并在 `getHosts()` 中实行惰性超期过滤，新增 `DELETE /api/admin/terminal/hosts/offline` 手动清空接口。
- 前端：使用 `createPortal` 将 `TerminalHostSelector` 的 Popover 挂载到 `document.body` 彻底脱离父级 `overflow-hidden` 截断，通过 `getBoundingClientRect()` 计算绝对位置并适配滚动；增加相对离线时间格式化展示以及一键清理离线节点按钮。

**Tech Stack:** TypeScript, Node.js, Express, React, Tailwind CSS, Lucide Icons, Jest, Supertest.

## Global Constraints

- 保持严格 TypeScript 类型安全与既���代码注释与风格。
- 绝不硬编码静态主机。
- 接口鉴权严格沿用 `adminAuthMiddleware`（`x-admin-key`）。
- 离线过期阈值严格采用 24 小时（`24 * 60 * 60 * 1000` ms）。

---

### Task 1: 后端：实现 24 小时离线节点自动淘汰与手动清理服务方法

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts`
- Test: `tests/terminalHostsApi.test.ts`

**Interfaces:**
- Produces: `terminalHostManager.pruneOfflineHosts(maxAgeMs?: number): string[]`

- [ ] **Step 1: 在 `tests/terminalHostsApi.test.ts` 中编写自动淘汰与手动清理的单元测试**

在 `tests/terminalHostsApi.test.ts` 中添加针对 `pruneOfflineHosts` 和超期自动清理的断言：

```typescript
  test('prunes offline hosts older than 24 hours automatically on getHosts()', async () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: 'expired-offline-node',
      name: 'Expired Node',
      ip: '10.0.0.99',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('expired-offline-node');
    const host = terminalHostManager.getHost('expired-offline-node');
    if (host) {
      // Backdate lastSeen to 25 hours ago
      host.lastSeen = Date.now() - (25 * 60 * 60 * 1000);
    }

    terminalHostManager.registerAgent({
      hostId: 'fresh-offline-node',
      name: 'Fresh Node',
      ip: '10.0.0.98',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('fresh-offline-node');

    const hosts = terminalHostManager.getHosts();
    expect(hosts.find(h => h.id === 'expired-offline-node')).toBeUndefined();
    expect(hosts.find(h => h.id === 'fresh-offline-node')).toBeDefined();
  });

  test('pruneOfflineHosts(0) manually removes all offline hosts while preserving online hosts', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: 'still-online-node',
      name: 'Online Node',
      ip: '10.0.0.97',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.registerAgent({
      hostId: 'manual-offline-node',
      name: 'Manual Offline Node',
      ip: '10.0.0.96',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('manual-offline-node');

    const pruned = terminalHostManager.pruneOfflineHosts(0);
    expect(pruned).toContain('manual-offline-node');
    expect(terminalHostManager.getHost('manual-offline-node')).toBeNull();
    expect(terminalHostManager.getHost('still-online-node')).not.toBeNull();
  });
```

- [ ] **Step 2: 运行测试验证失败**

运行：`npm test tests/terminalHostsApi.test.ts`
预期：FAIL（`pruneOfflineHosts` 尚不存在或 `getHosts()` 未过滤超期节点）

- [ ] **Step 3: 在 `src/admin/services/terminalHostManager.ts` 中实现 `pruneOfflineHosts` 与定时/惰性清理**

在 `TerminalHostManager` 类中增加：

```typescript
  public static readonly OFFLINE_HOST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private pruneTimer: NodeJS.Timeout | null = null;
```

在构造函数中开启定时巡检（例如每小时执行一次），并在 `getHosts()` 中先执行 `this.pruneOfflineHosts(TerminalHostManager.OFFLINE_HOST_TTL_MS);`。

实现 `pruneOfflineHosts(maxAgeMs: number = TerminalHostManager.OFFLINE_HOST_TTL_MS): string[]`：
```typescript
  public pruneOfflineHosts(maxAgeMs: number = TerminalHostManager.OFFLINE_HOST_TTL_MS): string[] {
    const now = Date.now();
    const prunedIds: string[] = [];

    for (const [id, host] of this.hosts.entries()) {
      if (host.status === 'offline') {
        const age = now - (host.lastSeen || 0);
        if (maxAgeMs <= 0 || age >= maxAgeMs) {
          prunedIds.push(id);
          const session = this.sessions.get(id);
          if (session) {
            session.destroy();
            this.sessions.delete(id);
          }
          this.clearPendingRpcForHost(id);
          this.hosts.delete(id);
          logger.info(`[TerminalHostManager] Pruned offline host: ${id} (lastSeen: ${new Date(host.lastSeen).toISOString()})`);
        }
      }
    }

    return prunedIds;
  }
```

- [ ] **Step 4: 运行测试验证通过**

运行：`npm test tests/terminalHostsApi.test.ts`
预期：PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/admin/services/terminalHostManager.ts tests/terminalHostsApi.test.ts
git commit -m "feat(terminal): implement 24h offline host pruning and manual prune method"
```

---

### Task 2: 后端：新增清空离线主机 REST API (`DELETE /api/admin/terminal/hosts/offline`)

**Files:**
- Modify: `src/admin/controllers/adminController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/terminalHostsApi.test.ts`

**Interfaces:**
- Consumes: `terminalHostManager.pruneOfflineHosts(0)`
- Produces: `DELETE /api/admin/terminal/hosts/offline` -> `{ success: true, prunedCount: number, prunedIds: string[] }`

- [ ] **Step 1: 在 `tests/terminalHostsApi.test.ts` 中编写 DELETE 路由与控制器测试**

```typescript
  test('DELETE /api/admin/terminal/hosts/offline rejects requests without admin key', async () => {
    const res = await request(app).delete('/api/admin/terminal/hosts/offline');
    expect(res.status).toBe(401);
  });

  test('DELETE /api/admin/terminal/hosts/offline prunes all offline hosts and returns prunedIds', async () => {
    const key = config.adminSecretKey || 'test-key';
    const mockWs = { readyState: 1, send: jest.fn() };

    terminalHostManager.registerAgent({
      hostId: 'node-to-delete-1',
      name: 'Delete Node 1',
      ip: '10.0.0.91',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('node-to-delete-1');

    const res = await request(app)
      .delete('/api/admin/terminal/hosts/offline')
      .set('x-admin-key', key);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      prunedCount: expect.any(Number),
      prunedIds: expect.arrayContaining(['node-to-delete-1']),
    });
    expect(terminalHostManager.getHost('node-to-delete-1')).toBeNull();
  });
```

- [ ] **Step 2: 运行测试验证失败**

运行：`npm test tests/terminalHostsApi.test.ts`
预期：FAIL（404 Route Not Found）

- [ ] **Step 3: 在 `adminController.ts` 与 `adminRoutes.ts` 中添加路由实现**

在 `src/admin/controllers/adminController.ts` 中添加：
```typescript
  public async pruneOfflineTerminalHosts(req: Request, res: Response): Promise<void> {
    const prunedIds = terminalHostManager.pruneOfflineHosts(0);
    res.json({
      success: true,
      prunedCount: prunedIds.length,
      prunedIds,
    });
  }
```

在 `src/admin/routes/adminRoutes.ts` 中注册：
```typescript
router.delete('/terminal/hosts/offline', (req, res) => adminController.pruneOfflineTerminalHosts(req, res));
```

- [ ] **Step 4: 运行测试验证通过**

运行：`npm test tests/terminalHostsApi.test.ts`
预期：PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/admin/controllers/adminController.ts src/admin/routes/adminRoutes.ts tests/terminalHostsApi.test.ts
git commit -m "feat(terminal): add DELETE /api/admin/terminal/hosts/offline endpoint"
```

---

### Task 3: 前端：国际化文案补充与相对时间工具函数实现

**Files:**
- Create: `frontend/src/utils/timeHelpers.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/timeHelpers.test.ts`

**Interfaces:**
- Produces: `formatRelativeTime(timestamp: number, lang: 'zh' | 'en'): string`
- Produces: 新增 i18n 键值：`webTerminal.hostSelector.clearOffline`, `webTerminal.hostSelector.clearOfflineSuccess`, `webTerminal.hostSelector.offlineJustNow`, `webTerminal.hostSelector.offlineAgo`

- [ ] **Step 1: 编写 `tests/timeHelpers.test.ts` 测试相对时间计算**

```typescript
import { formatRelativeTime } from '../frontend/src/utils/timeHelpers';

describe('timeHelpers - formatRelativeTime', () => {
  const now = 1726400000000;

  test('formats less than 1 minute as just now', () => {
    expect(formatRelativeTime(now - 30 * 1000, 'zh', now)).toBe('刚刚离线');
    expect(formatRelativeTime(now - 30 * 1000, 'en', now)).toBe('Just now');
  });

  test('formats minutes correctly', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, 'zh', now)).toBe('离线于 5分钟前');
    expect(formatRelativeTime(now - 5 * 60 * 1000, 'en', now)).toBe('Offline 5m ago');
  });

  test('formats hours correctly', () => {
    expect(formatRelativeTime(now - 3 * 3600 * 1000, 'zh', now)).toBe('离线于 3小时前');
    expect(formatRelativeTime(now - 3 * 3600 * 1000, 'en', now)).toBe('Offline 3h ago');
  });

  test('formats days correctly', () => {
    expect(formatRelativeTime(now - 2 * 86400 * 1000, 'zh', now)).toBe('离线于 2天前');
    expect(formatRelativeTime(now - 2 * 86400 * 1000, 'en', now)).toBe('Offline 2d ago');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：`npm test tests/timeHelpers.test.ts`
预期：FAIL（找不到模块）

- [ ] **Step 3: 实现 `frontend/src/utils/timeHelpers.ts` 并更新中英文语言包**

创建 `frontend/src/utils/timeHelpers.ts`：
```typescript
export function formatRelativeTime(timestamp: number, lang: 'zh' | 'en' = 'zh', currentNow: number = Date.now()): string {
  if (!timestamp || isNaN(timestamp)) return '';
  const diffMs = Math.max(0, currentNow - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) {
    return lang === 'zh' ? '刚刚离线' : 'Just now';
  }
  if (diffHour < 1) {
    return lang === 'zh' ? `离线于 ${diffMin}分钟前` : `Offline ${diffMin}m ago`;
  }
  if (diffDay < 1) {
    return lang === 'zh' ? `离线于 ${diffHour}小时前` : `Offline ${diffHour}h ago`;
  }
  return lang === 'zh' ? `离线于 ${diffDay}天前` : `Offline ${diffDay}d ago`;
}
```

在 `zh.ts` 和 `en.ts` 的 `webTerminal.hostSelector` 下加入对应翻译文本：
- `clearOffline`: '清理离线' / 'Clear Offline'
- `clearOfflineConfirm`: '确定清除所有离线节点吗？' / 'Clear all offline nodes?'
- `clearOfflineTooltip`: '清除当前所有已离线的主机节点' / 'Remove all currently offline host nodes'
- `offlineAt`: '最后离线时间: ' / 'Last seen: '

- [ ] **Step 4: 运行测试验证通过**

运行：`npm test tests/timeHelpers.test.ts`
预期：PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/utils/timeHelpers.ts frontend/src/i18n/locales/ tests/timeHelpers.test.ts
git commit -m "feat(terminal): add formatRelativeTime utility and offline prune i18n locales"
```

---

### Task 4: 前端：重构 `TerminalHostSelector.tsx` 浮层使用 `createPortal` 挂载、解决截断与展示离线时间

**Files:**
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Modify: `tests/terminalHostSelector.test.ts`

**Interfaces:**
- Consumes: `formatRelativeTime`, `createPortal`, `DELETE /api/admin/terminal/hosts/offline`
- Produces: 彻底解决 `overflow-hidden` 截断、全视口自适应 Portal 浮层、平滑滚动、显示离线相对时间与一键清空离线按钮

- [ ] **Step 1: 在 `tests/terminalHostSelector.test.ts` 中编写结构与交互断言**

更新 `tests/terminalHostSelector.test.ts`，增加对 `createPortal` 挂载主机下拉菜单、清理离线节点按钮逻辑以及 `formatRelativeTime` 调用的断言：

```typescript
  test('uses createPortal to mount host dropdown popover to document.body preventing overflow clipping', () => {
    expect(content).toContain('dropdownPortal');
    // Ensure dropdown popover itself is mounted via createPortal
    expect(content).toMatch(/createPortal\s*\(\s*[\s\S]*popoverContent[\s\S]*document\.body\s*\)/);
  });

  test('renders clear offline hosts button when offline hosts exist', () => {
    expect(content).toContain('/api/admin/terminal/hosts/offline');
    expect(content).toContain('hasOfflineHosts');
  });

  test('formats and displays offline relative time for offline hosts', () => {
    expect(content).toContain('formatRelativeTime');
  });
```

- [ ] **Step 2: 运行测试验证失败**

运行：`npm test tests/terminalHostSelector.test.ts`
预期：FAIL（新断言未命中）

- [ ] **Step 3: 修改 `TerminalHostSelector.tsx`**

1. 引入 `createPortal` 挂载 Popover，定义 `triggerRef = useRef<HTMLButtonElement>(null)` 与 `popoverRef = useRef<HTMLDivElement>(null)`。
2. 状态增加 `dropdownPos: { top: number; left: number; width?: number; maxHeight?: number }`。在 `isOpen` 打开时以及 `window.addEventListener('resize' / 'scroll')` 时，测量 `triggerRef.current.getBoundingClientRect()`：
   - `left = Math.max(8, Math.min(rect.left, window.innerWidth - 320 - 8))`；
   - `top = rect.bottom + 6`；若 `window.innerHeight - rect.bottom < 280` 且 `rect.top > 280`，则翻转至上方 `top = Math.max(8, rect.top - popoverHeight - 6)`。
   - `maxHeight = Math.min(380, window.innerHeight - 32)`。
3. 增加手部清理函数 `handleClearOfflineHosts`：
   - 发起 `fetch('/api/admin/terminal/hosts/offline', { method: 'DELETE', headers: { 'x-admin-key': effectiveKey } })`；
   - 成功后自动调用 `fetchHosts()` 刷新节点列表。
4. 在浮层 Header 中，当 `hosts.some(h => h.status === 'offline')` 时，渲染「清理离线」按钮（图标：`Trash2`，微按钮风格）。
5. 在节点列表项的子信息行渲染：
   - 若在线：`{h.ip} · {h.platform}`
   - 若离线：`{h.ip} · {formatRelativeTime(h.lastSeen, lang)}`，并为整行加上 `title={new Date(h.lastSeen).toLocaleString()}`。
6. 列表容器类名确保：`max-h-64 sm:max-h-80 overflow-y-auto overscroll-contain pb-2`，每个条目确保完整显示，最后一项不被裁切。

- [ ] **Step 4: 运行测试验证通过**

运行：`npm test tests/terminalHostSelector.test.ts`
预期：PASS

- [ ] **Step 5: 提交代码**

```bash
git add frontend/src/components/terminal/TerminalHostSelector.tsx tests/terminalHostSelector.test.ts
git commit -m "feat(terminal): mount host dropdown via portal and add offline time and prune actions"
```

---

### Task 5: 端到端回归测试与全功能构建验证

**Files:**
- Run: `npm test`
- Run: `npm run build`

- [ ] **Step 1: 运行全量测试套件**

运行：`npm test`
预期：全部测试用例 PASS。

- [ ] **Step 2: 运行前后端完整编译构建**

运行：`npm run build`
预期：`dist/frontend` 和 `dist/src` 均编译构建成功无错误。

- [ ] **Step 3: 提交并推送工作分支（如需要）**

```bash
git status
```

---

## Plan Self-Review Check

1. **Spec coverage**:
   - 超过 3 个节点显示不全/选不到 -> Task 4 (Portal 挂载 + 精准定位 + 滚动与高度优化)
   - 长期离线节点不自动消失（24 小时清理） -> Task 1 (后端定时清理 + 惰性过滤)
   - 手动清空离线节点 -> Task 2 (DELETE 接口) + Task 4 (Header 清除按钮)
   - 显示最后离线时间 -> Task 3 (formatRelativeTime) + Task 4 (节点列表渲染)
2. **No Placeholders**: 所有代码块、测试、命令皆包含具体实现。
3. **Type Consistency**: 方法名 `pruneOfflineHosts` 与接口 `DELETE /api/admin/terminal/hosts/offline` 在各任务间完全一致。
