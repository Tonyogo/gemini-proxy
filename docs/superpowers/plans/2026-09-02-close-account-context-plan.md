# Manual Close Account Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the manual "Close Context" capability in the WebUI Accounts Management console, allowing administrators to manually release an account's browser context and terminate its active WebSocket sessions.

**Architecture:**
- **Backend Admin Proxy**: Add `POST /api/admin/accounts/:index/close-context` route to `adminRoutes.ts`, implement `closeContext` handler in `accountController.ts`, and forward request to upstream AIStudio via `accountService.ts`.
- **Frontend UI & State**: Update `AccountsView.tsx` with a `ZapOff` action button in desktop tables and mobile card footers, introduce a confirmation modal with memory-release warnings, trigger API calls, handle response states, and refresh accounts list.
- **Internationalization**: Add corresponding Chinese (`zh.ts`) and English (`en.ts`) localization strings.

**Tech Stack:** Express.js, TypeScript, React 18, Vite, Tailwind CSS, Lucide React (`ZapOff`), Jest, Supertest.

## Global Constraints

- Protected by `adminAuthMiddleware` with `x-admin-key` header verification.
- Strictly validate that `index` is a non-negative integer parameter.
- Forward requests to upstream `POST /api/accounts/:index/close-context` using configured secret bearer authorization.
- Zero breaking changes to existing account actions or status filters.
- Maintain strict TypeScript checks and complete test coverage.

---

### Task 1: Backend Admin Route & Service Implementation (TDD)

**Files:**
- Modify: `src/admin/services/accountService.ts`
- Modify: `src/admin/controllers/accountController.ts`
- Modify: `src/admin/routes/adminRoutes.ts`
- Test: `tests/accountController.test.ts`

**Interfaces:**
- Consumes: `AccountService.request('post', '/api/accounts/' + index + '/close-context')`
- Produces: `POST /api/admin/accounts/:index/close-context` endpoint returning `{ status: number, data: any }`

- [x] **Step 1: Write failing unit test in `tests/accountController.test.ts`**

Add test cases for `POST /api/admin/accounts/:index/close-context`:
1. Valid index -> forwards to `accountService.closeContext(index)` and returns 200.
2. Invalid index (e.g., `abc`) -> returns 400 Bad Request without calling service.

```typescript
it('should forward closeContext with valid index', async () => {
  mockedAccountService.closeContext.mockResolvedValueOnce({
    status: 200,
    data: { index: 0, message: 'closeContextSuccess' },
    headers: {}
  } as any);

  const res = await request(app)
    .post('/api/admin/accounts/0/close-context')
    .set('x-admin-key', secretKey);

  expect(res.status).toBe(200);
  expect(mockedAccountService.closeContext).toHaveBeenCalledWith(0);
});

it('should return 400 for invalid index on closeContext', async () => {
  const res = await request(app)
    .post('/api/admin/accounts/invalid/close-context')
    .set('x-admin-key', secretKey);

  expect(res.status).toBe(400);
  expect(mockedAccountService.closeContext).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountController.test.ts`
Expected: FAIL (route / method not found)

- [x] **Step 3: Implement `closeContext` in Service, Controller, and Route**

In `src/admin/services/accountService.ts`:
```typescript
public async closeContext(index: number) {
  return this.request('post', `/api/accounts/${index}/close-context`);
}
```

In `src/admin/controllers/accountController.ts`:
```typescript
public async closeContext(req: Request, res: Response): Promise<void> {
  const indexParam = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
  const index = parseInt(indexParam, 10);
  if (isNaN(index) || index < 0) {
    res.status(400).json({ error: 'Invalid account index' });
    return;
  }
  const result = await accountService.closeContext(index);
  res.status(result.status).json(result.data);
}
```

In `src/admin/routes/adminRoutes.ts`:
```typescript
router.post('/accounts/:index/close-context', (req, res) => accountController.closeContext(req, res));
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountController.test.ts`
Expected: PASS (10/10 tests passed)

- [x] **Step 5: Commit**

```bash
git add src/admin/services/accountService.ts src/admin/controllers/accountController.ts src/admin/routes/adminRoutes.ts tests/accountController.test.ts
git commit -m "feat(admin): add POST /api/admin/accounts/:index/close-context endpoint"
```

---

### Task 2: Internationalization Keys Addition

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Produces: `accounts.closeContext`, `accounts.contextAlreadyClosed`, `accounts.confirmCloseContextTitle`, `accounts.confirmCloseContextMessage`, `accounts.confirmCloseContextDesc`, `accounts.closeContextSuccess`

- [x] **Step 1: Add localization keys to `frontend/src/i18n/locales/zh.ts`**

Inside `zh.accounts`:
```typescript
closeContext: "释放 Context",
contextAlreadyClosed: "Context 已处于释放状态",
confirmCloseContextTitle: "确认释放浏览器 Context",
confirmCloseContextMessage: "确定要关闭账号 #{index} ({email}) 的浏览器上下文并断开连接吗？",
confirmCloseContextDesc: "关闭后将释放约 500MB~700MB 内存占用。后续发起请求时系统将按需重新初始化。",
closeContextSuccess: "账号 #{index} 的 Context 已成功释放。",
```

- [x] **Step 2: Add localization keys to `frontend/src/i18n/locales/en.ts`**

Inside `en.accounts`:
```typescript
closeContext: "Close Context",
contextAlreadyClosed: "Context is already closed",
confirmCloseContextTitle: "Confirm Close Browser Context",
confirmCloseContextMessage: "Are you sure you want to close browser context and disconnect account #{index} ({email})?",
confirmCloseContextDesc: "This will free ~500MB-700MB memory. A new context will be initialized on-demand when requested.",
closeContextSuccess: "Context for account #{index} has been released.",
```

- [x] **Step 3: Verify TypeScript compilation of locales**

Run: `npm run build:frontend`
Expected: Successful compile or no locale typing errors.

- [x] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add translations for close account context action"
```

---

### Task 3: Frontend UI Action Button & Confirmation Modal in AccountsView

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/accounts/:index/close-context`
- Consumes: `t('accounts.closeContext')`, `t('accounts.confirmCloseContextTitle')`, etc.
- Produces: Visual close context action buttons on desktop and mobile, and a confirmation modal.

- [x] **Step 1: Import `ZapOff` icon in `AccountsView.tsx`**

Update `lucide-react` import list to include `ZapOff`.

- [x] **Step 2: Add `closeContextConfirm` state and handler function**

Add state in `AccountsView`:
```typescript
const [closeContextConfirm, setCloseContextConfirm] = useState<{ index: number; email: string; isCurrent: boolean } | null>(null);
```

Add handler function:
```typescript
const handleCloseContext = async (index: number) => {
  setActionLoading(true);
  try {
    const res = await fetch(`/api/admin/accounts/${index}/close-context`, {
      method: 'POST',
      headers: getHeaders()
    });
    if (res.ok) {
      showToast(t('accounts.closeContextSuccess', { index: String(index) }));
      setCloseContextConfirm(null);
      fetchStatus();
    } else {
      const err = await res.json().catch(() => ({ error: 'Error' }));
      showToast(t('accounts.actionFailed', { error: err.error || err.message }), 'error');
    }
  } catch (err: any) {
    showToast(t('accounts.actionFailed', { error: err.message }), 'error');
  } finally {
    setActionLoading(false);
  }
};
```

- [x] **Step 3: Add desktop table action button**

In the desktop table action buttons row (`<td className="px-4 py-3 text-right">`):
```tsx
{/* Close Context */}
<button
  onClick={() => setCloseContextConfirm({ index: acc.index, email: acc.name || '', isCurrent })}
  disabled={actionLoading || !acc.hasContext}
  className={`p-1.5 rounded-lg border text-xs transition-all flex items-center justify-center ${
    acc.hasContext
      ? 'bg-[#141620] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/30'
      : 'bg-[#141620]/40 text-slate-600 border-white/[0.04] cursor-not-allowed opacity-40'
  }`}
  title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
>
  <ZapOff className="w-3.5 h-3.5" />
</button>
```

- [x] **Step 4: Add mobile card action button**

In mobile card footer actions container:
```tsx
{/* Close Context (Mobile) */}
<button
  onClick={() => setCloseContextConfirm({ index: acc.index, email: acc.name || '', isCurrent })}
  disabled={actionLoading || !acc.hasContext}
  className={`p-1.5 rounded-lg border text-xs flex items-center justify-center transition-all ${
    acc.hasContext
      ? 'bg-[#141622] hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/30'
      : 'bg-[#141622]/40 text-slate-600 border-white/[0.04] cursor-not-allowed opacity-40'
  }`}
  title={acc.hasContext ? t('accounts.closeContext') : t('accounts.contextAlreadyClosed')}
>
  <ZapOff className="w-3.5 h-3.5" />
</button>
```

- [x] **Step 5: Render confirmation modal via Portal**

Render `closeContextConfirm` dialog:
```tsx
{/* Close Context Confirm Dialog */}
{closeContextConfirm && createPortal(
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-[#12141F] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
      <div className="flex items-center space-x-3 text-amber-400">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <ZapOff className="w-5 h-5" />
        </div>
        <h3 className="text-base font-bold text-white">
          {t('accounts.confirmCloseContextTitle')}
        </h3>
      </div>

      <div className="space-y-2 text-xs leading-relaxed text-slate-300">
        <p>
          {t('accounts.confirmCloseContextMessage', {
            index: String(closeContextConfirm.index),
            email: closeContextConfirm.email || 'No email'
          })}
        </p>
        <p className="text-slate-400">
          {t('accounts.confirmCloseContextDesc')}
        </p>
        {closeContextConfirm.isCurrent && (
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t('accounts.confirmDeleteCurrentWarning')}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end space-x-2.5 pt-2">
        <button
          type="button"
          onClick={() => setCloseContextConfirm(null)}
          disabled={actionLoading}
          className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] rounded-xl text-xs font-semibold transition-all"
        >
          {t('accounts.cancel')}
        </button>
        <button
          type="button"
          onClick={() => handleCloseContext(closeContextConfirm.index)}
          disabled={actionLoading}
          className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm active:scale-95"
        >
          {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          <span>{t('accounts.closeContext')}</span>
        </button>
      </div>
    </div>
  </div>,
  document.body
)}
```

- [x] **Step 6: Run full frontend and backend build**

Run: `npm run build`
Expected: PASS with 0 build errors.

- [x] **Step 7: Commit**

```bash
git add frontend/src/components/AccountsView.tsx
git commit -m "feat(accounts): add close context button and confirmation dialog"
```

---

### Task 4: Complete End-to-End Build & Test Verification

**Files:**
- Test: `tests/accountController.test.ts`
- Whole project verification

- [x] **Step 1: Run all backend tests**

Run: `npm test`
Expected: All Jest test suites pass.

- [x] **Step 2: Run full build pipeline**

Run: `npm run build`
Expected: Both frontend Vite and backend TypeScript compile successfully.

- [x] **Step 3: Verification commit (if needed)**

```bash
git status
```
