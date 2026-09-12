# 移动端账号管理与请求日志搜索空间优化实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化移动端下“账号管理 (AccountsView)”与“请求日志 (LogsView)”开头的搜索与操作栏布局，解决多行堆叠严重挤占下方列表垂直空间的问题，通过单行紧凑收纳与动态展开搜索将垂直占用减少 50%~60%，大幅增加下方列表可视区域。

**Architecture:** 
在 `AccountsView.tsx` 中引入 `isMobileSearchOpen` 状态，移动端默认呈现单行极窄操作栏（搜索图标按钮 + 状态下拉 + 去重/导入按钮），点击搜索图标平滑切换为全宽搜索输入框；在 `LogsView.tsx` 中引入 `isMobileSearchOpen` 状态，将移动端搜索收纳至标题右侧的放大镜按钮中，将日期/小时选择与状态 Pills 合并为紧凑单行，从而将移动端顶部占用压缩 100px 以上，并在桌面端保持现有多列宽屏排布不变。

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Jest.

## Global Constraints

- 桌面端（`sm:` / `md:` 及以上）视觉布局与功能必须 100% 保持不变，不受移动端折叠逻辑干扰。
- 移动端默认状态下操作栏必须保持为极薄单行或紧凑双行，不得占用超过 80px 垂直高度。
- 移动端点击搜索图标必须平滑切换出搜索输入框并支持一键清除/关闭退出。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 优化账号管理 (`AccountsView.tsx`) 移动端操作栏为单行收缩与动态展开搜索

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:815-885`
- Modify: `tests/accountsViewMobileOptimization.test.ts`

**Interfaces:**
- State in `AccountsView`:
  - `isMobileSearchOpen`: `boolean` (default `false`)
- Controls:
  - 移动端常态：单行渲染 `[SearchIconBtn] [CompactStatusSelect] [DedupIconBtn] [ImportBtn]`
  - 移动端展开态：单行渲染 `[SearchIcon] [AutoFocusInput] [CloseBtn]`
  - 桌面端（`sm:flex`）：保持原有宽屏双侧排布 `[SearchInput] [StatusSelect] | [ImportBtn] [DedupBtn]`

- [x] **Step 1: 在 `tests/accountsViewMobileOptimization.test.ts` 中编写移动端单行折叠搜索断言测试**

```typescript
  it('verifies AccountsView toolbar contains mobile compact single-row and collapsible search', () => {
    expect(code).toContain('isMobileSearchOpen');
    expect(code).toContain('setIsMobileSearchOpen');
    // Mobile search button and toggle
    expect(code).toMatch(/sm:hidden[\s\S]*?setIsMobileSearchOpen/);
  });
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts`
Expected: FAIL - `isMobileSearchOpen` 尚未定义

- [x] **Step 3: 更新 `frontend/src/components/AccountsView.tsx` 操作栏实现**

在 `AccountsView.tsx` 状态声明区添加：
```typescript
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);
```

修改操作栏（Action Toolbar）：
```tsx
      {/* Action Toolbar */}
      <div className="ui-card p-2 sm:p-3.5 shrink-0">
        {/* Mobile View: Collapsible Search & Single-Row Compact Bar */}
        <div className="flex sm:hidden items-center justify-between gap-1.5 min-w-0">
          {isMobileSearchOpen ? (
            <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-150">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  placeholder={t('accounts.searchPlaceholder', '按序号或邮箱/标识搜索...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ui-input pl-7 pr-7 py-1 text-xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsMobileSearchOpen(false);
                }}
                className="px-2 py-1 text-xs text-slate-400 hover:text-white shrink-0"
              >
                {t('common.cancel', '取消')}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5 w-full">
              {/* Left: Search Trigger & Compact Status Dropdown */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMobileSearchOpen(true)}
                  className={`p-1.5 rounded-lg border transition-all shrink-0 ${
                    searchQuery
                      ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                      : 'bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 hover:text-slate-200 border-[var(--border-subtle)]'
                  }`}
                  title={t('accounts.searchPlaceholder')}
                >
                  <Search className="w-3.5 h-3.5" />
                </button>

                <div className="relative flex-1 min-w-0 max-w-[170px]">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full ui-input pl-2 pr-6 py-1 text-xs appearance-none cursor-pointer truncate"
                  >
                    <option value="ALL">{t('accounts.filterAll', '全部')} ({totalCount})</option>
                    <option value="ACTIVATED">{t('accounts.filterActivated', '已激活')} ({activatedCount})</option>
                    <option value="ACTIVATING">{t('accounts.filterActivating', '激活中')} ({activatingCount})</option>
                    <option value="RETIRED">{t('accounts.filterRetired', '已下线')} ({retiredCount})</option>
                    <option value="INACTIVE">{t('accounts.filterInactive', '未激活')} ({inactiveCount})</option>
                    <option value="DISABLED">{t('accounts.filterDisabled', '已禁用')} ({disabledCount})</option>
                    <option value="ISSUES">{t('accounts.filterIssues', '异常')}</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Right: Compact Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setDedupConfirm(true)}
                  disabled={actionLoading || accounts.length === 0}
                  className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-[var(--border-subtle)] text-amber-400 hover:bg-black/[0.08] active:scale-95 disabled:opacity-40"
                  title={t('accounts.dedup', '去重')}
                >
                  <CopyCheck className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={actionLoading}
                  className="px-2.5 py-1 ui-btn-primary flex items-center space-x-1 text-xs active:scale-95"
                  title={t('accounts.importFiles')}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{t('accounts.importFiles', '导入')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Desktop View: Standard Multi-Column Bar */}
        <div className="hidden sm:flex items-center justify-between gap-3">
          {/* Left: Search & Filter */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('accounts.searchPlaceholder', '按序号或邮箱/标识搜索...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ui-input pl-8 pr-7 py-1.5"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto ui-input pl-3 pr-8 py-1.5 appearance-none cursor-pointer"
              >
                <option value="ALL">{t('accounts.filterAll', '全部状态')} ({totalCount})</option>
                <option value="ACTIVATED">{t('accounts.filterActivated', '已激活')} ({activatedCount})</option>
                <option value="ACTIVATING">{t('accounts.filterActivating', '激活中')} ({activatingCount})</option>
                <option value="RETIRED">{t('accounts.filterRetired', '已下线')} ({retiredCount})</option>
                <option value="INACTIVE">{t('accounts.filterInactive', '未激活')} ({inactiveCount})</option>
                <option value="DISABLED">{t('accounts.filterDisabled', '已禁用')} ({disabledCount})</option>
                <option value="ISSUES">{t('accounts.filterIssues', '凭据异常 / 已过期')}</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={actionLoading}
              className="px-3 py-1.5 ui-btn-primary flex items-center space-x-1.5"
              title={t('accounts.importFiles')}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t('accounts.importFiles')}</span>
            </button>

            <button
              onClick={() => setDedupConfirm(true)}
              disabled={actionLoading || accounts.length === 0}
              className="px-3 py-1.5 ui-btn-secondary disabled:opacity-40 flex items-center space-x-1.5 text-amber-300"
              title={t('accounts.dedupTooltip', '扫描并清理重复的 refresh_token / 凭据')}
            >
              <CopyCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('accounts.dedup', '去重')}</span>
            </button>
          </div>
        </div>
      </div>
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsViewMobileOptimization.test.ts
git commit -m "feat(accounts): streamline mobile toolbar with single-row layout and collapsible search"
```

---

### Task 2: 优化请求日志 (`LogsView.tsx`) 移动端搜索折叠与紧凑状态栏

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:392-520`
- Modify: `tests/logsViewHeaderOptimization.test.ts`

**Interfaces:**
- State in `LogsView`:
  - `isMobileSearchOpen`: `boolean` (default `false`)
- Controls:
  - 顶部栏增加移动端搜索放大镜按钮（`md:hidden`），点击切换搜索条；
  - 移动端日期与小时选择器去除占行的大标题标签，与状态筛选 Pills 合并在同一极窄行；
  - 桌面端（`md:flex` / `md:grid`）维持现有多栏排布不变。

- [x] **Step 1: 在 `tests/logsViewHeaderOptimization.test.ts` 中增加移动端搜索按钮与紧凑布局断言**

```typescript
  test('should support collapsible search and streamlined date/status row on mobile', () => {
    expect(content).toContain('isMobileSearchOpen');
    expect(content).toContain('setIsMobileSearchOpen');
    // Mobile search button in top bar
    expect(content).toMatch(/md:hidden[\s\S]*?setIsMobileSearchOpen/);
  });
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: FAIL - `isMobileSearchOpen` 尚未定义

- [x] **Step 3: 更新 `frontend/src/components/LogsView.tsx` 移动端搜索与筛选布局**

在 `LogsView.tsx` 状态声明区添加：
```typescript
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState<boolean>(false);
```

修改顶部 Header Bar，在右侧并入移动端专属搜索切换按钮：
```tsx
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">
                {t('logs.title')}
              </h3>
              {hourCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  {hourCount}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1.5">
              {/* Mobile Search Toggle Button */}
              <button
                type="button"
                onClick={() => setIsMobileSearchOpen(prev => !prev)}
                className={`p-1.5 rounded-lg border transition-all md:hidden ${
                  searchFilter || isMobileSearchOpen
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 hover:text-white border-white/[0.06]'
                }`}
                title={t('logs.searchPlaceholder', '搜索')}
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  detailCacheRef.current.clear();
                  fetchLogs(true);
                }}
                className="text-[11px] ui-btn-secondary px-2.5 py-1 flex items-center space-x-1.5"
                title="Refresh logs list"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">{t('logs.refresh')}</span>
              </button>
            </div>
          </div>
```

增加移动端滑出搜索框：
```tsx
          {/* Mobile Collapsible Search Input */}
          {isMobileSearchOpen && (
            <div className="relative mb-2 shrink-0 md:hidden animate-in fade-in duration-150">
              <input
                type="text"
                autoFocus
                placeholder={t('logs.searchPlaceholder', 'Filter model / path / filename...')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full ui-input pl-7 pr-7 py-1 text-xs"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          )}
```

重构日期选择与状态标签为移动端紧凑行（`md:hidden` 与 `hidden md:block` 响应式分离）：
```tsx
          {/* Mobile Compact Single-Row Controls (Date/Hour + Status Pills) */}
          <div className="flex md:hidden items-center justify-between gap-1.5 mb-2 pb-2 border-b border-white/[0.08] shrink-0">
            <div className="flex items-center space-x-1 min-w-0">
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="ui-input px-1.5 py-1 text-[11px] appearance-none cursor-pointer max-w-[105px]"
              >
                {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                value={selectedHour}
                onChange={(e) => handleHourChange(e.target.value)}
                className="ui-input px-1.5 py-1 text-[11px] appearance-none cursor-pointer max-w-[65px]"
              >
                {availableHours.map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>

            <div className="ui-tab-container p-0.5 text-[10px] font-medium space-x-0.5 shrink-0">
              <button
                onClick={() => setStatusFilter('all')}
                className={`ui-tab-pill px-1.5 py-0.5 text-center ${statusFilter === 'all' ? 'ui-tab-pill-active font-semibold' : ''}`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('2xx')}
                className={`ui-tab-pill px-1.5 py-0.5 text-center ${statusFilter === '2xx' ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 shadow-sm' : 'hover:text-emerald-300'}`}
              >
                2xx
              </button>
              <button
                onClick={() => setStatusFilter('4xx')}
                className={`ui-tab-pill px-1.5 py-0.5 text-center ${statusFilter === '4xx' ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm' : 'hover:text-amber-300'}`}
              >
                4xx
              </button>
              <button
                onClick={() => setStatusFilter('5xx')}
                className={`ui-tab-pill px-1.5 py-0.5 text-center ${statusFilter === '5xx' ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm' : 'hover:text-rose-300'}`}
              >
                5xx
              </button>
            </div>
          </div>

          {/* Desktop Controls (Date & Hour Dropdown Pickers) */}
          <div className="hidden md:grid grid-cols-2 gap-2 mb-2.5 shrink-0" aria-label="Date & Hour Dropdown Pickers">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center space-x-1">
                <Calendar className="w-2.5 h-2.5 text-slate-500" />
                <span>{t('logs.dateLabel')}</span>
              </label>
              <select
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full ui-input p-1.5 text-xs appearance-none cursor-pointer"
              >
                {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 block mb-1 flex items-center space-x-1">
                <Clock className="w-2.5 h-2.5 text-slate-500" />
                <span>{t('logs.hourLabel')}</span>
              </label>
              <select
                value={selectedHour}
                onChange={(e) => handleHourChange(e.target.value)}
                className="w-full ui-input p-1.5 text-xs appearance-none cursor-pointer"
              >
                {availableHours.map(h => (
                  <option key={h} value={h}>{h}:00</option>
                ))}
              </select>
            </div>
          </div>

          {/* Desktop Status Filter Pills & Quick Search */}
          <div className="hidden md:block space-y-2 mb-2.5 pb-2.5 border-b border-white/[0.08] shrink-0">
            <div className="ui-tab-container p-0.5 text-[10px] font-medium space-x-0.5">
              <button
                onClick={() => setStatusFilter('all')}
                className={`ui-tab-pill flex-1 py-1 text-center ${statusFilter === 'all' ? 'ui-tab-pill-active font-semibold' : ''}`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('2xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${statusFilter === '2xx' ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 shadow-sm' : 'hover:text-emerald-300'}`}
              >
                2xx
              </button>
              <button
                onClick={() => setStatusFilter('4xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${statusFilter === '4xx' ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/40 shadow-sm' : 'hover:text-amber-300'}`}
              >
                4xx
              </button>
              <button
                onClick={() => setStatusFilter('5xx')}
                className={`ui-tab-pill flex-1 py-1 text-center ${statusFilter === '5xx' ? 'bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40 shadow-sm' : 'hover:text-rose-300'}`}
              >
                5xx
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder={t('logs.searchPlaceholder', 'Filter model / path / filename...')}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full ui-input pl-7 pr-2.5 py-1 text-[11px]"
              />
              <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[10px]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/LogsView.tsx tests/logsViewHeaderOptimization.test.ts
git commit -m "feat(logs): collapse search into header button and streamline date/status row on mobile"
```

---

### Task 3: 前端构建与全套自动化测试验证

**Files:**
- None (Build & Verification only)

- [x] **Step 1: 运行前端构建检查**

Run: `npm run build:frontend`
Expected: Vite 编译顺利通过，输出正常，0 错误

- [x] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 105 个测试套件全部通过

- [x] **Step 3: 检查 git 状态**

Run: `git status`
Expected: working tree clean

---
