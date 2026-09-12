# 移动端账号管理重复标题与间距优化设计规范 (Design Spec)

- **创建日期**: 2026-09-12
- **状态**: Approved (已确认)
- **目标**: 彻底消除移动端下账号管理页面内部大标题、描述副标题与全局顶栏标题的重复展示问题，移除冗余总数徽标，收紧容器垂直间距，把宝贵的首屏垂直空间最大化让渡给账号列表。

---

## 1. 背景与核心痛点 (Background & Pain Point)

### 现状问题
- 全局顶栏（`App.tsx`）已常驻显示当前页面标题：“账号管理”；
- 账号管理页面内部（`AccountsView.tsx`）紧接着又渲染了一块 Page Header，再次以大号文字显示“👥 账号管理”，且带有冗余的总数徽标“12”与长句副标题描述；
- 垂直方向上在不足 30px 的间距内出现两个“账号管理”，在手机屏幕上极度浪费空间，并导致下方列表首屏可视区域不足。

### 优化目标
- **移动端页面内 Header 完全隐藏**：移动端（`< sm`）直接隐藏整块页面内大标题、副标题描述与统计区域（应用 `hidden sm:flex`）；
- **移除冗余总数徽标**：因为下方操作栏的状态筛选默认就是 `全部 (12)`，已有明确数量反馈，不再在页面内放置冗余徽标；
- **容器间距自适应收紧**：将根容器的垂直间距调整为 `space-y-2.5 sm:space-y-6`，手机端更紧凑；
- **桌面端零影响**：桌面端（`sm:` 及以上）保持原有的宽屏标题、副标题及 6 个统计卡片。

---

## 2. 详细设计与代码变动 (Detailed Design)

### 2.1 根容器间距自适应 (`frontend/src/components/AccountsView.tsx`)
将：
```tsx
<div className="space-y-6 max-w-7xl mx-auto font-sans pb-12">
```
修改为：
```tsx
<div className="space-y-2.5 sm:space-y-6 max-w-7xl mx-auto font-sans pb-12">
```

### 2.2 页面头部区域响应式隐藏与徽标清理
将：
```tsx
      {/* Modern Page Header & Stats Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>{t('accounts.title')}</span>
            <span className="inline-flex sm:hidden items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              {totalCount}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('accounts.sub', 'Manage multi-account credentials, automatic context rotation, and per-account usage quotas.')}
          </p>
        </div>
```
修改为：
```tsx
      {/* Modern Page Header & Stats Banner (Desktop/Tablet only, hidden on mobile to avoid duplicate header with App bar) */}
      <div className="hidden sm:flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center space-x-2.5">
            <Users className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <span>{t('accounts.title')}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('accounts.sub', 'Manage multi-account credentials, automatic context rotation, and per-account usage quotas.')}
          </p>
        </div>
```

---

## 3. 边界情况 (Edge Cases)

1. **测试断言适配**：
   - 更新 `tests/accountsViewMobileOptimization.test.ts`，断言页面头部在移动端隐藏（`hidden sm:flex`），不再断言过时的移动端总数徽标。
2. **多语言与桌面端稳定性**：
   - 桌面端多语言标题与说明完全不受影响，保留宽屏视觉完整性。

---

## 4. 验证标准 (Verification Criteria)

1. **自动化测试**:
   - `tests/accountsViewMobileOptimization.test.ts` 通过。
2. **构建与回归**:
   - `npm run build:frontend` 0 错误构建通过。
   - `npm test` 全量测试套件 100% 绿灯。
