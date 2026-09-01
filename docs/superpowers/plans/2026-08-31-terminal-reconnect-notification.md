# Web Terminal Disconnect Notification & Auto-Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proactive disconnect notifications with a floating countdown toast and exponential backoff automatic reconnection to the interactive Web Terminal.

**Architecture:** Implement an exponential backoff reconnect timer inside `WebTerminalView.tsx` (1s, 2s, 4s, 8s, max 15s) with a floating frosted-glass banner displaying countdown seconds and an immediate "Reconnect Now" action button.

**Tech Stack:** React 18, `@xterm/xterm`, Lucide React, Tailwind CSS, TypeScript.

## Global Constraints

- **Exponential Backoff**: Delays calculated as `min(15000, 1000 * Math.pow(2, attempt))`.
- **Floating Banner**: Positioned at top-center of the terminal canvas without blocking text selection or cursor focus.
- **Immediate Reconnect**: Manual reconnect button interrupts the countdown and reconnects instantly.
- **Strict TypeScript & Zero Build Errors**: `npm run build:frontend` and `npm run build:backend` must pass cleanly.

---

### Task 1: Add i18n Locales for Disconnect Notification & Countdown

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts`
- Modify: `frontend/src/i18n/locales/zh.ts`

**Interfaces:**
- Produces: `webTerminal.reconnectCountdown` and `webTerminal.reconnectNow` translation keys.

- [x] **Step 1: Update translation keys**

In `frontend/src/i18n/locales/en.ts`:
Add to `webTerminal`:
```typescript
    connectionLost: "Connection lost",
    reconnectCountdown: "Disconnected. Retrying in {count}s...",
    reconnectNow: "Reconnect Now",
```

In `frontend/src/i18n/locales/zh.ts`:
Add to `webTerminal`:
```typescript
    connectionLost: "连接已断开",
    reconnectCountdown: "连接已断开，{count} 秒后自动重试...",
    reconnectNow: "立即重连",
```

- [x] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add terminal disconnect notification and countdown locales"
```

---

### Task 2: Implement Exponential Backoff Reconnection & Floating Banner in WebTerminalView

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx`

**Interfaces:**
- Produces: `reconnectCountdown`, `reconnectAttempt`, and floating status banner with immediate retry trigger.

- [x] **Step 1: Implement auto-reconnect timers and floating toast in `WebTerminalView.tsx`**

In `frontend/src/components/WebTerminalView.tsx`:
1. Add state:
```typescript
const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
const reconnectAttemptRef = useRef<number>(0);
const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
```
2. In `initWebSocket()`:
- Clear existing reconnect intervals and timers on connection attempt.
- On `onopen`:
  - Reset `reconnectAttemptRef.current = 0`.
  - Set `setReconnectCountdown(0)`.
- On `onclose` / `onerror`:
  - If unmounted or exit status, don't auto-reconnect.
  - Otherwise calculate delay: `const delayMs = Math.min(15000, 1000 * Math.pow(2, reconnectAttemptRef.current));`
  - Start countdown:
    ```typescript
    let remaining = Math.ceil(delayMs / 1000);
    setReconnectCountdown(remaining);
    reconnectAttemptRef.current += 1;

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      setReconnectCountdown(remaining);
      if (remaining <= 0) {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        initWebSocket();
      }
    }, 1000);
    ```
3. Add `handleManualReconnect`:
```typescript
const handleManualReconnect = () => {
  if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  setReconnectCountdown(0);
  initWebSocket();
};
```
4. Render Floating Banner in the terminal canvas container:
```tsx
{/* Floating Disconnect & Auto-Reconnect Toast */}
{!isConnected && !isConnecting && reconnectCountdown > 0 && (
  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2.5 px-3 py-1.5 rounded-xl bg-[#160E12]/95 border border-rose-500/40 text-rose-300 text-xs backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-top-2 select-none">
    <div className="relative flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-rose-500" />
      <span className="absolute w-2 h-2 rounded-full bg-rose-500 animate-ping opacity-75" />
    </div>
    <span className="font-mono text-[11px]">
      {t('webTerminal.reconnectCountdown', { count: reconnectCountdown.toString() }).replace('{count}', reconnectCountdown.toString())}
    </span>
    <button
      type="button"
      onClick={handleManualReconnect}
      className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-white font-medium text-[11px] transition-all border border-rose-500/30 flex items-center space-x-1"
    >
      <RefreshCw className="w-3 h-3 text-rose-300" />
      <span>{t('webTerminal.reconnectNow')}</span>
    </button>
  </div>
)}
```

- [x] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build && cd ..`
Expected: PASS

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(terminal): add exponential backoff auto-reconnect and floating disconnect banner"
```

---

### Task 3: Full End-to-End Verification

**Files:**
- Run complete test suite and project build.

- [x] **Step 1: Run complete backend test suite**

Run: `npm test`
Expected: All 25 test suites pass.

- [x] **Step 2: Run complete project build**

Run: `npm run build`
Expected: Zero build errors.
