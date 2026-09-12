# 移动端账号管理重复标题与间距优化实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除移动端账号管理页面内部的大标题、描述副标题以及冗余总数徽标，消除与全局顶栏标题的重复展示，收紧外层容器垂直间距，将宝贵的垂直可视空间最大化让渡给账号卡片列表。

**Architecture:** 
在 `frontend/src/components/AccountsView.tsx` 中将页面内部的 Page Header 与 Stats Banner 区块设为 `hidden sm:flex`，移除移动端专属的冗余总数 badge，并将外层根容器间距从 `space-y-6` 优化为自适应的 `space-y-2.5 sm:space-y-6`；同步更新 `tests/accountsViewMobileOptimization.test.ts` 中的断言逻辑。

**Tech Stack:** React, TypeScript, Tailwind CSS, Jest.

## Global Constraints

- 桌面端（`sm:` 及以上）视觉排布与所有功能 100% 保持不变（包括大标题、副标题说明与 6 个统计卡片）。
- 移动端（`< sm`）完全隐藏页面内重复的大标题与副标题，且不再展示冗余的移动端总数徽标。
- 外层容器在移动端间距收紧为 `space-y-2.5`，手机端视觉紧凑。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 隐藏移动端重复标题、清理冗余徽标并收紧外层容器间距

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:695-735`
- Modify: `tests/accountsViewMobileOptimization.test.ts:1-25`

**Interfaces:**
- Component: `AccountsView`
  - 根容器：`space-y-2.5 sm:space-y-6 max-w-7xl mx-auto font-sans pb-12`
  - 页面头部容器：`hidden sm:flex flex-col md:flex-row md:items-center md:justify-between gap-4`
  - 移除：`<span className="inline-flex sm:hidden items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">{totalCount}</span>`

- [x] **Step 1: 在 `tests/accountsViewMobileOptimization.test.ts` 中更新针对头部隐藏与徽标移除的断言**

```typescript
import fs from 'fs';
import path from 'path';

describe('AccountsView Mobile Optimization Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies 6 stats chips cards and duplicate page title are hidden on mobile and visible on tablet/desktop', () => {
    // Header block is hidden on mobile to avoid duplicate header with App bar
    expect(code).toContain('hidden sm:flex flex-col md:flex-row');
    expect(code).toContain('hidden sm:grid sm:grid-cols-3 lg:grid-cols-6');
  });

  it('verifies duplicate mobile total count badge is removed since status filter provides counts', () => {
    expect(code).not.toContain('inline-flex sm:hidden items-center');
  });

  it('verifies AccountsView root container adopts responsive compact spacing', () => {
    expect(code).toContain('space-y-2.5 sm:space-y-6');
  });

  it('verifies AccountsView toolbar contains mobile compact single-row and collapsible search', () => {
    expect(code).toContain('isMobileSearchOpen');
    expect(code).toContain('setIsMobileSearchOpen');
    // Mobile search button and toggle
    expect(code).toMatch(/sm:hidden[\s\S]*?setIsMobileSearchOpen/);
  });
});
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts`
Expected: FAIL - 匹配 `hidden sm:flex flex-col md:flex-row` 失败且仍含有 `inline-flex sm:hidden items-center`

- [x] **Step 3: 修改 `frontend/src/components/AccountsView.tsx`**

1. 修改根容器间距：
```tsx
    <div className="space-y-2.5 sm:space-y-6 max-w-7xl mx-auto font-sans pb-12">
```

2. 隐藏页面内部头部区域并移除冗余总数徽标：
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

        {/* Stats Chips */}
        <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-1.5 sm:gap-2.5">
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/accountsViewMobileOptimization.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountsViewMobileOptimization.test.ts
git commit -m "feat(accounts): hide duplicate page header and compact spacing on mobile"
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
Expected: 105 个测试套件全部通过（包括 `tests/accountsViewMobileOptimization.test.ts`）

- [x] **Step 3: 检查 git 状态干净**

Run: `git status`
Expected: working tree clean

---
