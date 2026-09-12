# 移动端终端粘贴问题解决设计规范 (Design Spec)

- **创建日期**: 2026-09-12
- **状态**: Approved (已确认)
- **目标**: 彻底解决移动端设备在在线终端（WebTerminal）中无法将已复制的内容通过“粘贴”键粘贴到命令行里的问题，提供原生手势支持与轻量兜底回退。

---

## 1. 背景与根因 (Background & Root Cause)

### 现状问题
- 用户在移动端设备（iOS/Android）复制文字后，点击辅助键盘栏的“粘贴”按键，终端没有任何反应或提示“无法读取剪贴板”，但在“文本翻译”等其他页面却能正常粘贴。

### 核心根因
1. **用户激活手势中断 (User Activation Lost)**：
   在 `frontend/src/components/terminal/TerminalAccessoryBar.tsx` 中，由于该按钮绑定了 `onTouchStart={(e) => e.preventDefault()}` 和 `onMouseDown={(e) => e.preventDefault()}`，导致移动端浏览器（Safari / Chrome）判定原生触摸交互被拦截，从而剥夺了该点击事件作为 `User Gesture` 的权限，导致 `navigator.clipboard.readText()` 被安全策略直接拒绝（抛出 `NotAllowedError`）。
2. **非安全上下文限制 (Insecure Context)**：
   在很多用户通过局域网 HTTP（如 `http://192.168.x.x:3000`）访问时，W3C 规范禁止在非安全上下文中暴露 `navigator.clipboard.readText`，当前代码缺乏兜底方案。
3. **数据发送管道依赖**：
   原逻辑调用 `xterm.paste(clipText)`，容易受到终端括号粘贴模式（bracketed paste）和输入焦点状态的影响；应改用 `handleSendInput(clipText)` 直连 WebSocket。

---

## 2. 架构设计与流转逻辑 (Architecture & Flow)

### 2.1 原生手势修复 (`frontend/src/components/terminal/TerminalAccessoryBar.tsx`)
- 仅对 `Paste` 按钮移除 `onTouchStart` 和 `onMouseDown` 的 `preventDefault()` 拦截，保持与其他普通页面（如翻译页）一致的原生手势事件流。
- 其他按键（如 Esc、Tab、方向键等导航键）仍保留 `preventDefault()` 以防止误激活键盘或失焦。

### 2.2 粘贴数据流与兜底机制 (`frontend/src/components/WebTerminalView.tsx`)
```typescript
const handlePasteClipboard = useCallback(async () => {
  let clipText = '';

  // 1. 尝试现代异步剪贴板 API
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
    try {
      clipText = await navigator.clipboard.readText();
    } catch (err) {
      console.warn('[WebTerminal] Clipboard readText failed, fallback to prompt:', err);
    }
  }

  // 2. 轻量兜底回退：若剪贴板无内容、权限被拒、或处于非安全上下文（HTTP）
  if (!clipText && typeof window !== 'undefined') {
    const manualInput = window.prompt(t('webTerminal.pastePromptTip', '请长按粘贴文字：'));
    if (manualInput) {
      clipText = manualInput;
    }
  }

  // 3. 有效性判断与直连发送
  if (!clipText) {
    return;
  }

  // 直连 WebSocket，保留所有换行符与格式，并将终端置底
  handleSendInput(clipText, false);
  if (xtermRef.current) {
    xtermRef.current.focus();
  }
}, [handleSendInput, t]);
```

### 2.3 多语言支持 (i18n)
- `frontend/src/i18n/locales/zh.ts`:
  - `pastePromptTip: "请长按粘贴文字："`
- `frontend/src/i18n/locales/en.ts`:
  - `pastePromptTip: "Paste text to terminal:"`

---

## 3. 边界情况 (Edge Cases)

1. **HTTP 非安全上下文环境**：
   直接平滑回退到 `window.prompt`，用户长按输入法粘贴后点确定即可输入，彻底告别“无法读取剪贴板”报错。
2. **多行命令与换行符**：
   通过 `handleSendInput` 直接转发到底层 WebSocket，完整保留多行脚本。
3. **用户在 Prompt 中取消**：
   若用户点击取消，`window.prompt` 返回 `null`，程序安全返回，不向终端发送任何垃圾字符。

---

## 4. 验证标准 (Verification Criteria)

1. **测试断言**:
   - `tests/terminalAccessoryBar.test.ts`: 断言 Paste 按钮未添加 `onTouchStart.preventDefault()`。
   - `tests/terminalMobilePaste.test.ts`: 验证正常剪贴板读取、异常回退 Prompt、以及 `handleSendInput` 直连调用。
2. **前端构建与测试**:
   - `npm run build:frontend` 0 错误通过。
   - `npm test` 全量测试套件通过。
