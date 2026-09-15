# 终端列表按名称排序与离线过滤实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 WebTerminal 服务端终端列表按“在线置顶 + 同状态下按主机名称 A-Z 自然排序”返回，并在前端搜索栏内嵌快捷切换按钮支持一键过滤离线终端与状态记忆。

**Architecture:** 
- 后端：在 `TerminalHostManager.getHosts()` 中对过滤 TTL 后的主机列表执行标准双阶排序（状态 `online` 优先，同状态按 `name` 自然语言排序 `localeCompare`���。
- 前端：在 `TerminalHostSelector.tsx` 中增加 `hideOffline` 状态并持久化至 `localStorage`，在搜索输入框右侧内嵌 `Wifi` 切换图标按钮；在 `filteredHosts` 中剔除离线节点并应用同等排序规则；在多语言语言包中补充对应的提示文案。

**Tech Stack:** TypeScript, React, Tailwind CSS, Lucide Icons, Express, Jest.

## Global Constraints

- 保持严格 TypeScript 类型安全与既有代码注释与风格。
- 排序规则必须严格一致：在线节点优先，同状态按主机名称 A-Z 自然升序。
- 搜索框内嵌按钮不破坏现有输入与清除样式，支持 `localStorage` 记忆（键名：`terminal_hide_offline_hosts`）。
- 全量单元测试 `npm test` 与生产构建 `npm run build` 保持 100% 绿灯。

---

### Task 1: 后端：实现 `getHosts()` 双阶排序（在线置顶 + 名称 A-Z 自然排序）

**Files:**
- Modify: `src/admin/services/terminalHostManager.ts:205-215`
- Test: `tests/terminalHostsApi.test.ts`

**Interfaces:**
- Produces: `terminalHostManager.getHosts(): ManagedHost[]`（返回按 `status === 'online'` 优先，次级按 `name` A-Z 排序的数组）

- [ ] **Step 1: 在 `tests/terminalHostsApi.test.ts` 中编写排序断言测试**

```typescript
  test('returns hosts sorted with online hosts first and sorted by name A-Z', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    // Clear and register out of order
    terminalHostManager.registerAgent({
      hostId: 'sort-offline-z',
      name: 'Zeta Node',
      ip: '10.0.0.10',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('sort-offline-z');

    terminalHostManager.registerAgent({
      hostId: 'sort-online-b',
      name: 'Beta Node',
      ip: '10.0.0.11',
      agentWs: mockWs,
    });

    terminalHostManager.registerAgent({
      hostId: 'sort-offline-a',
      name: 'Alpha Offline Node',
      ip: '10.0.0.12',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('sort-offline-a');

    terminalHostManager.registerAgent({
      hostId: 'sort-online-a',
      name: 'Alpha Online Node',
      ip: '10.0.0.13',
      agentWs: mockWs,
    });

    const hosts = terminalHostManager.getHosts();
    const testHostIds = hosts
      .map(h => h.id)
      .filter(id => id.startsWith('sort-'));

    // Expected order: online hosts sorted (Alpha Online, Beta), then offline hosts sorted (Alpha Offline, Zeta)
    expect(testHostIds).toEqual([
      'sort-online-a',
      'sort-online-b',
      'sort-offline-a',
      'sort-offline-z',
    ]);
  });
```

- [ ] **Step 2: 运行测试验证失败**

运行：`npx jest tests/terminalHostsApi.test.ts`
预期：FAIL（返回的是旧的插入顺序）

- [ ] **Step 3: 修改 `src/admin/services/terminalHostManager.ts`**

在 `getHosts()` 中加入排序：
```typescript
  public getHosts(): ManagedHost[] {
    this.pruneOfflineHosts(TerminalHostManager.OFFLINE_HOST_TTL_MS);
    const list = Array.from(this.hosts.values());
    return list.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'online' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
```

- [ ] **Step 4: 运行测试验证通过**

运行：`npx jest tests/terminalHostsApi.test.ts`
预期：PASS

- [ ] **Step 5: 提交代码**

```bash
git add src/admin/services/terminalHostManager.ts tests/terminalHostsApi.test.ts
git commit -m "feat(terminal): sort hosts with online first and alphabetical order"
```

---

### Task 2: 前端：补充多语言文本与内嵌离线过滤及排序交互

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/components/terminal/TerminalHostSelector.tsx`
- Test: `tests/terminalHostSelector.test.ts`

**Interfaces:**
- Produces: 新增 i18n 键值：`showOnlyOnline`, `showAllHosts`, `hiddenOfflineCount`, `clickToShowAll`
- Produces: 搜索框内嵌离线过滤切换按钮、状态持久化至 `terminal_hide_offline_hosts`、`filteredHosts` 排序与离线过滤

- [ ] **Step 1: 在 `tests/terminalHostSelector.test.ts` 中编写离线过滤与排序断言**

```typescript
  test('supports filtering offline hosts and persists state in localStorage', () => {
    expect(content).toContain('terminal_hide_offline_hosts');
    expect(content).toContain('hideOffline');
  });

  test('sorts filtered hosts with online first and alphabetical order', () => {
    expect(content).toContain('localeCompare');
  });

  test('i18n locales contain offline filter translations', () => {
    expect((zh as any).webTerminal.hostSelector.showOnlyOnline).toBeDefined();
    expect((en as any).webTerminal.hostSelector.showOnlyOnline).toBeDefined();
    expect((zh as any).webTerminal.hostSelector.showAllHosts).toBeDefined();
    expect((en as any).webTerminal.hostSelector.showAllHosts).toBeDefined();
  });
```

- [ ] **Step 2: 运行测试验证失败**

运行���`npx jest tests/terminalHostSelector.test.ts`
预期：FAIL（缺少对应键值或状态实现）

- [ ] **Step 3: 更新多语言文件 `zh.ts` 和 `en.ts`**

在 `webTerminal.hostSelector` 下添加：
- `zh.ts`:
  - `showOnlyOnline`: '仅显示在线节点',
  - `showAllHosts`: '显示全部节点 (包含离线)',
  - `hiddenOfflineCount`: '当前已隐藏 {count} 个离线节点',
  - `clickToShowAll`: '显示全部',
- `en.ts`:
  - `showOnlyOnline`: 'Show online only',
  - `showAllHosts`: 'Show all hosts (including offline)',
  - `hiddenOfflineCount`: '{count} offline hosts hidden',
  - `clickToShowAll`: 'Show all',

- [ ] **Step 4: 修改 `frontend/src/components/terminal/TerminalHostSelector.tsx`**

1. 引入 `Wifi` 图标（`import { Wifi, ... } from 'lucide-react'`）。
2. 添加状态：
   ```typescript
   const [hideOffline, setHideOffline] = useState<boolean>(() => {
     if (typeof window !== 'undefined') {
       try {
         return localStorage.getItem('terminal_hide_offline_hosts') === 'true';
       } catch {}
     }
     return false;
   });

   const toggleHideOffline = () => {
     setHideOffline((prev) => {
       const next = !prev;
       try {
         localStorage.setItem('terminal_hide_offline_hosts', String(next));
       } catch {}
       return next;
     });
   };
   ```
3. 更新 `filteredHosts` 的计算，增加离线过滤与名称排序：
   ```typescript
   const filteredHosts = useMemo(() => {
     let list = hosts;
     if (hideOffline) {
       list = list.filter((h) => h.status === 'online');
     }
     if (searchQuery.trim()) {
       const q = searchQuery.toLowerCase();
       list = list.filter(
         (h) =>
           h.name.toLowerCase().includes(q) ||
           h.id.toLowerCase().includes(q) ||
           h.ip.toLowerCase().includes(q) ||
           h.platform.toLowerCase().includes(q)
       );
     }
     return [...list].sort((a, b) => {
       if (a.status !== b.status) {
         return a.status === 'online' ? -1 : 1;
       }
       return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
     });
   }, [hosts, searchQuery, hideOffline]);
   ```
4. 在搜索框内嵌切换按钮（`absolute right-1.5 top-1/2 -translate-y-1/2`）：
   ```tsx
   <div className="relative">
     <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
     <input
       type="text"
       value={searchQuery}
       onChange={(e) => setSearchQuery(e.target.value)}
       placeholder={t('webTerminal.hostSelector.filterPlaceholder')}
       className="w-full pl-8 pr-8 py-1 bg-black/[0.04] dark:bg-white/[0.06] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
     />
     <button
       type="button"
       onClick={toggleHideOffline}
       className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-all ${
         hideOffline
           ? 'text-emerald-400 bg-emerald-500/15 border border-emerald-500/30'
           : 'text-slate-400 hover:text-slate-200'
       }`}
       title={hideOffline ? t('webTerminal.hostSelector.showAllHosts') : t('webTerminal.hostSelector.showOnlyOnline')}
     >
       <Wifi className="w-3 h-3" />
     </button>
   </div>
   ```
5. 空状态提示当因 `hideOffline` 隐藏了节点时展示还原提示：
   ```tsx
   {filteredHosts.length === 0 && (
     <div className="p-4 text-center text-xs text-[var(--text-muted)] font-sans space-y-1.5">
       {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-400" /> : null}
       <div>{t('webTerminal.hostSelector.noHosts', '未找到匹配的主机节点')}</div>
       {hideOffline && hasOfflineHosts && (
         <button
           type="button"
           onClick={() => setHideOffline(false)}
           className="text-[11px] text-indigo-400 hover:underline inline-flex items-center space-x-1"
         >
           <span>{t('webTerminal.hostSelector.clickToShowAll', '显示全部')}</span>
         </button>
       )}
     </div>
   )}
   ```

- [ ] **Step 5: 运行测试验证通过**

运行：`npx jest tests/terminalHostSelector.test.ts`
预期：PASS

- [ ] **Step 6: 提交代码**

```bash
git add frontend/src/i18n/locales/ frontend/src/components/terminal/TerminalHostSelector.tsx tests/terminalHostSelector.test.ts
git commit -m "feat(terminal): add offline filter toggle button in search bar with persistence and alphabetical sorting"
```

---

### Task 3: 全量回归测试与前后端生产构建验证

**Files:**
- Run: `npx jest --runInBand`
- Run: `npm run build`

- [ ] **Step 1: 运行全量 Jest 测试套件**

运行：`npx jest --runInBand`
预期：所有 103 个测试套件通过。

- [ ] **Step 2: 运行前后端生产构建**

运行：`npm run build`
预期：`dist/frontend` 和 `dist/src` 均构建成功，零错误。

- [ ] **Step 3: 检查代码仓库状态**

运行：`git status`
预期：Working tree clean.
