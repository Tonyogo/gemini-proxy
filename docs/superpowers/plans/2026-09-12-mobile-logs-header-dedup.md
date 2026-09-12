# 移动端请求日志重复标题去除与单行控制栏实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底消除移动端下请求日志页面内部大标题与全局顶栏标题的重复展示，并将日期/小时选择、状态筛选 Pills、搜索切换与刷新按钮整合成极致单行，为移动端下方的日志条目列表腾出最大化的可视空间。

**Architecture:** 
在 `frontend/src/components/LogsView.tsx` 中将内部 Header Bar 设为 `hidden md:flex`（桌面端可见，移动端完全隐藏）；重构移动端单行控制条，常态下集成日期选择器、小时选择器、状态 Pills、搜索放大镜按钮与刷新按钮在同一水平单行内，展开态下支持内联全宽搜索与一键取消；同步更新 `tests/logsViewHeaderOptimization.test.ts`。

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Jest.

## Global Constraints

- 桌面端（`md:` 及以上）视觉布局、操作习惯与标题展示 100% 保持不变。
- 移动端（`< md`）完全隐藏页面内部重复的 Header Bar（`📄 请求日志` 与总数角标）。
- 移动端默认状态下必须合并为单行控制条，包含日期/小时选择、状态 Pills、搜索按钮与刷新按钮，总高度不超过 40px。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 隐藏移动端重复标题行并将移动端控制项整合成单行

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:392-490`
- Modify: `tests/logsViewHeaderOptimization.test.ts:45-58`

**Interfaces:**
- Component: `LogsView`
  - 内部 Header Bar：`hidden md:flex items-center justify-between pb-2.5 mb-2 border-b border-white/[0.08] shrink-0`
  - 移动端控制条：`flex md:hidden items-center justify-between gap-1 mb-2 pb-2 border-b border-white/[0.08] shrink-0`
  - 状态：`isMobileSearchOpen` 控制常态单行与内联全宽搜索输入框的切换

- [x] **Step 1: 在 `tests/logsViewHeaderOptimization.test.ts` 中编写针对移动端内部标题隐藏与单行控制栏整合的断言测试**

```typescript
  test('should hide internal duplicate header on mobile and provide all-in-one single-row bar', () => {
    // Header bar is hidden on mobile to avoid duplicate header with App global bar
    expect(content).toContain('hidden md:flex items-center justify-between pb-2.5 mb-2 border-b');
    // Mobile single-row controls include search trigger and refresh buttons
    expect(content).toMatch(/flex md:hidden[\s\S]*?setIsMobileSearchOpen[\s\S]*?fetchLogs\(true\)/);
  });
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: FAIL - 匹配 `hidden md:flex items-center justify-between pb-2.5 mb-2 border-b` 失败

- [x] **Step 3: 修改 `frontend/src/components/LogsView.tsx` 实现**

1. 将内部 Header Bar 设为桌面专属：
```tsx
          {/* Header Bar (Desktop only, hidden on mobile to avoid duplicate header with App bar) */}
          <div className="hidden md:flex items-center justify-between pb-2.5 mb-2 border-b border-white/[0.08] shrink-0">
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

            <button
              onClick={() => {
                detailCacheRef.current.clear();
                fetchLogs(true);
              }}
              className="text-[11px] ui-btn-secondary px-2.5 py-1 flex items-center space-x-1.5"
              title="Refresh logs list"
            >
              <RefreshCw className="w-3 h-3" />
              <span>{t('logs.refresh')}</span>
            </button>
          </div>
```

2. 重构移动端单行控制条（含内联搜索切换与所有控制项）：
```tsx
          {/* Mobile All-in-One Single-Row Bar (Date/Hour + Status + Search + Refresh) */}
          <div className="flex md:hidden items-center justify-between gap-1 mb-2 pb-2 border-b border-white/[0.08] shrink-0">
            {isMobileSearchOpen ? (
              <div className="flex items-center gap-1.5 w-full animate-in fade-in duration-150">
                <div className="relative flex-1 min-w-0">
                  <input
                    type="text"
                    autoFocus
                    placeholder={t('logs.searchPlaceholder', 'Filter model / path / filename...')}
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full ui-input pl-7 pr-7 py-1 text-xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearchFilter('');
                    setIsMobileSearchOpen(false);
                  }}
                  className="px-2 py-1 text-xs text-slate-400 hover:text-white shrink-0"
                >
                  {t('common.cancel', '取消')}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1 w-full min-w-0">
                {/* Left: Date & Hour Pickers */}
                <div className="flex items-center space-x-1 min-w-0">
                  <select
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="ui-input px-1 py-1 text-[11px] appearance-none cursor-pointer max-w-[92px] truncate"
                  >
                    {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <select
                    value={selectedHour}
                    onChange={(e) => handleHourChange(e.target.value)}
                    className="ui-input px-1 py-1 text-[11px] appearance-none cursor-pointer max-w-[58px]"
                  >
                    {availableHours.map(h => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>

                {/* Center: Status Pills */}
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

                {/* Right: Actions (Search + Refresh) */}
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsMobileSearchOpen(true)}
                    className={`p-1.5 rounded-lg border transition-all ${
                      searchFilter
                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                        : 'bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 hover:text-white border-white/[0.06]'
                    }`}
                    title={t('logs.searchPlaceholder', '搜索')}
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      detailCacheRef.current.clear();
                      fetchLogs(true);
                    }}
                    className="p-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] text-slate-400 hover:text-white border border-white/[0.06] transition-all active:scale-95"
                    title="Refresh logs list"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/logsViewHeaderOptimization.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/LogsView.tsx tests/logsViewHeaderOptimization.test.ts
git commit -m "feat(logs): hide duplicate header and integrate all-in-one single-row bar on mobile"
```

---

### Task 2: 前端构建与全套自动化测试验证

**Files:**
- None (Build & Verification only)

- [x] **Step 1: 运行前端构建检查**

Run: `npm run build:frontend`
Expected: Vite 编译打包顺利成功，输出正常，0 错误

- [x] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 105 个测试套件全部通过（包含 `tests/logsViewHeaderOptimization.test.ts`）

- [x] **Step 3: 检查 git 状态干净**

Run: `git status`
Expected: working tree clean

---
