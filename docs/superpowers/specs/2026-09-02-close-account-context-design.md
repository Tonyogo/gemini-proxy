# Manual Close Account Context Design Spec

## 1. Overview & Objectives

In multi-account pooling environments (e.g. Playwright-backed AI Studio sessions), each active browser context typically consumes 500MB~700MB of RAM. When multiple accounts are activated over time, dormant contexts remain in memory unless closed.

This design enables administrators to manually trigger **Close Context** for a specific account directly from the WebUI Accounts Management console (`/ui` -> Accounts view), freeing up memory and disconnecting active WebSocket sessions without needing to restart the proxy service or manually delete/disable accounts.

---

## 2. API Architecture & Routing

### 2.1 Proxy Admin Endpoints (`gemini-proxy`)

1. **Route (`src/admin/routes/adminRoutes.ts`)**:
   - `POST /api/admin/accounts/:index/close-context`
   - Protected by `adminAuthMiddleware` (`x-admin-key`).
   - Delegates to `accountController.closeContext`.

2. **Controller (`src/admin/controllers/accountController.ts`)**:
   - Validates `req.params.index` is a non-negative integer.
   - Delegates upstream request to `accountService.closeContext(index)`.
   - Returns the response status code and JSON payload.

3. **Service (`src/admin/services/accountService.ts`)**:
   - `closeContext(index: number)`: Calls `this.request('post', `/api/accounts/${index}/close-context`)`.

### 2.2 Upstream Interaction (`AIStudioToAPI`)

- Target Endpoint: `POST /api/accounts/:index/close-context`
- Headers: `Authorization: Bearer <ADMIN_SECRET_KEY>`, `Content-Type: application/json`
- Upstream Return Codes:
  - `200 OK`: `closeContextSuccess` / `contextAlreadyClosed`
  - `400 Bad Request`: `errorInvalidIndex`
  - `401 Unauthorized`: Authentication failure
  - `404 Not Found`: Account index not configured
  - `409 Conflict`: System busy switching or recovering
  - `500 Internal Server Error`: `closeContextFailed`

---

## 3. Frontend UI / UX Specification

### 3.1 Accounts Management View (`frontend/src/components/AccountsView.tsx`)

1. **Desktop Table Actions (`<td className="px-4 py-3 text-right">`)**:
   - Action button using `ZapOff` icon from `lucide-react`.
   - Tooltip: `accounts.closeContext` ("释放 Context" / "Close Context") when `acc.hasContext` is true, or `accounts.contextAlreadyClosed` ("Context 已释放" / "Context is closed") when false.
   - Disabled state: When `acc.hasContext === false` or during `actionLoading`.
   - Active style: Amber/orange accent on hover (`hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border-white/[0.08] hover:border-amber-500/30`).

2. **Mobile Card Actions Footer**:
   - Compact button in card action bar with `ZapOff` icon and label.
   - Follows same disabled/enabled and confirmation rules.

3. **Confirmation Modal (`closeContextConfirm`)**:
   - State: `closeContextConfirm: { index: number; email: string; isCurrent: boolean } | null`
   - Header: `accounts.confirmCloseContextTitle` ("确认释放浏览器 Context" / "Confirm Close Browser Context")
   - Message: Displays target account index and name/email.
   - Description: Highlights that 500MB~700MB RAM will be freed and WebSocket sessions closed, and context will reinitialize on-demand when next routed.
   - If `isCurrent` is true, displays extra notice that active account index will be reset.

4. **Feedback & State Refresh**:
   - Dispatches `POST /api/admin/accounts/:index/close-context`.
   - On success: Shows toast notification and triggers `fetchStatus()`.
   - On failure: Shows error toast notification with upstream message.

---

## 4. Internationalization (i18n)

### 4.1 Chinese (`frontend/src/i18n/locales/zh.ts`)
- `accounts.closeContext`: `"释放 Context"`
- `accounts.contextAlreadyClosed`: `"Context 已处于释放状态"`
- `accounts.confirmCloseContextTitle`: `"确认释放浏览器 Context"`
- `accounts.confirmCloseContextMessage`: `"确定要关闭账号 #{index} ({email}) 的浏览器上下文并断开连接吗？"`
- `accounts.confirmCloseContextDesc`: `"关闭后将释放约 500MB~700MB 内存占用。后续发起请求时系统将按需重新初始化。"`
- `accounts.closeContextSuccess`: `"账号 #{index} 的 Context 已成功释放。"`

### 4.2 English (`frontend/src/i18n/locales/en.ts`)
- `accounts.closeContext`: `"Close Context"`
- `accounts.contextAlreadyClosed`: `"Context is already closed"`
- `accounts.confirmCloseContextTitle`: `"Confirm Close Browser Context"`
- `accounts.confirmCloseContextMessage`: `"Are you sure you want to close browser context and disconnect account #{index} ({email})?"`
- `accounts.confirmCloseContextDesc`: `"This will free ~500MB-700MB memory. A new context will be initialized on-demand when requested."`
- `accounts.closeContextSuccess`: `"Context for account #{index} has been released."`

---

## 5. Testing & Verification

1. **Backend Tests**:
   - Unit/integration test for `POST /api/admin/accounts/:index/close-context` asserting proper validation and forwarding.
2. **Frontend Verification**:
   - Build test: `npm run build` succeeds with strict TypeScript checks.
   - UI test: Button shows correct state based on `hasContext`, confirmation modal opens with accurate account details, and status updates on execution.
