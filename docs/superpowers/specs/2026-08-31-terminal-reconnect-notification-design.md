# Web Terminal Disconnect Notification & Auto-Reconnect Design Spec

## 1. Overview & Goals

When the Web Terminal connection drops (due to mobile sleep/wake cycles, network switches, or temporary network drops), the user currently only sees a static red status badge without proactive auto-reconnection or visual feedback.

### Key Objectives
- **Exponential Backoff Auto-Reconnect**: Automatically retry connecting with progressive delay intervals (1s, 2s, 4s, 8s, max 15s).
- **Proactive Disconnect Banner**: Display a non-intrusive, floating frosted glass banner at the top of the terminal viewport showing countdown seconds and a "Reconnect Now" button.
- **Seamless State Recovery**: Re-attach automatically to the backend's `PersistentTerminalSession` without losing terminal buffer content when reconnected.

---

## 2. Architecture & Design

### 2.1 Reconnection State Machine
- State properties in `WebTerminalView.tsx`:
  - `reconnectAttempt: number` (0 to N).
  - `reconnectCountdown: number` (seconds remaining until next automatic retry).
  - `reconnectTimerRef`: Timer handling countdown ticks and auto-invocation of `initWebSocket()`.
- Lifecycle:
  1. WebSocket `onclose` or `onerror` fires:
     - If not user-initiated reset or unmount, compute delay = `min(15000, 1000 * 2^reconnectAttempt)`.
     - Start 1-second interval countdown updating `reconnectCountdown`.
  2. Countdown reaches 0:
     - Increment `reconnectAttempt`.
     - Call `initWebSocket()`.
  3. WebSocket `onopen` fires:
     - Clear timers.
     - Reset `reconnectAttempt = 0`.
     - Dismiss disconnect banner.
  4. User clicks "Reconnect Now":
     - Immediately clear countdown and trigger `initWebSocket()`.

### 2.2 Floating Disconnect Banner UI
- Placed inside `WebTerminalView.tsx` relative canvas container:
  ```tsx
  {!isConnected && !isConnecting && reconnectCountdown > 0 && (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-[#181116]/90 border border-rose-500/30 text-rose-300 text-xs backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-top-2">
      <WifiOff className="w-3.5 h-3.5 text-rose-400" />
      <span>{t('webTerminal.reconnectCountdown', { count: reconnectCountdown })}</span>
      <button onClick={handleManualReconnect} className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white font-medium text-[11px] transition-all">
        {t('webTerminal.reconnectNow')}
      </button>
    </div>
  )}
  ```

---

## 3. Testing & Verification

1. **Build & Type Check**:
   - `npm run build:frontend` and `npm run build:backend` pass with zero errors.
   - `npm test` runs and all 25 test suites pass.
2. **Reconnection Verification**:
   - Disconnecting socket triggers countdown timer and floating banner.
   - Auto-retry establishes connection seamlessly and restores buffer.
   - Clicking "Reconnect Now" performs immediate reconnection.
