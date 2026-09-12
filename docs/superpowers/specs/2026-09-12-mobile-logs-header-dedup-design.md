# 移动端请求日志重复标题去除与单行控制栏设计规范 (Design Spec)

- **创建日期**: 2026-09-12
- **状态**: Approved (已确认)
- **目标**: 彻底消除移动端下请求日志页面内部大标题与全局顶栏标题的重复展示，将日期/小时选择、状态筛选 Pills、搜索切换与刷新按钮整合成极致单行，为移动端下方的日志条目列表腾出最大化的可视空间。

---

## 1. 背景与核心痛点 (Background & Pain Point)

### 现状问题
- 全局顶栏（`App.tsx`）已常驻显示当前页面标题：“请求日志”；
- 请求日志左侧栏顶部（`LogsView.tsx`）内部又渲染了一整行 Header Bar（`📄 请求日志 (36)` 与操作按钮），再次占据近 40px 高度；
- 在手机屏幕上出现上下两个“请求日志”，不仅视觉冗余，而且挤占了核心的日志条目展示高度。

### 优化目标
- **移动端页面内 Header Bar 完全隐藏**：移动端（`< md`）直接隐藏整行内部大标题栏（应用 `hidden md:flex`）；
- **极简单行整合栏**：将【日期/小时下拉框】+【状态过滤胶囊 Pills】+【🔍搜索按钮】+【🔄刷新按钮】在移动端整合成单行控制条（高度仅约 34px）；
- **搜索内联全宽展开**：点击搜索按钮后，整行无缝切换为带自动聚焦与取消关闭的全宽搜索输入框；
- **桌面端零影响**：桌面端（`md:` 及以上）保持原有的宽屏标题栏、双列日期选择器与独立状态 Pills。

---

## 2. 详细设计与代码变动 (Detailed Design)

### 2.1 内部 Header Bar 响应式隐藏 (`frontend/src/components/LogsView.tsx`)
将：
```tsx
{/* Header Bar */}
<div className="flex items-center justify-between pb-2.5 mb-2 border-b border-white/[0.08] shrink-0">
```
修改为：
```tsx
{/* Header Bar (Desktop only, hidden on mobile to avoid duplicate header with App bar) */}
<div className="hidden md:flex items-center justify-between pb-2.5 mb-2 border-b border-white/[0.08] shrink-0">
```

### 2.2 移动端极简单行控制条与搜索内联展开
在移动端（`md:hidden`）呈现：
- **搜索展开态 (`isMobileSearchOpen === true`)**：
  - 展开单行全宽输入框，包含放大镜图标、清空叉号与取消按钮。
- **常态单行 (`isMobileSearchOpen === false`)**：
  - 左侧：极窄日期选择与小时选择器；
  - 中间：状态过滤胶囊 Pills（All / 2xx / 4xx / 5xx）；
  - 右侧：【🔍搜索】按钮（带关键词高亮指示） + 【🔄刷新】按钮（带加载中旋转动画）。

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

---

## 3. 边界情况 (Edge Cases)

1. **刷新动画与状态反馈**：
   - 移动端单行右侧的刷新按钮增加加载态检测（`loading ? 'animate-spin text-indigo-400' : ''`），与桌面端刷新按钮状态一致。
2. **多语言与桌面端稳定性**：
   - 桌面端多语言标题与说明完全不受影响，保留宽屏视觉完整性。
3. **测试断言适配**：
   - 在 `tests/logsViewHeaderOptimization.test.ts` 中补充对 `hidden md:flex` 隐藏内部 Header Bar 及单行控制栏的断言。

---

## 4. 验证标准 (Verification Criteria)

1. **自动化测试**:
   - `tests/logsViewHeaderOptimization.test.ts` 全部测试用例通过。
2. **构建与回归**:
   - `npm run build:frontend` 0 错误构建通过。
   - `npm test` 全量测试套件 100% 绿灯。
