# 移动端终端粘贴问题解决实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底解决移动端设备在在线终端（WebTerminal）中无法通过“粘贴”键将已复制的内容粘贴到命令行里的问题，恢复原生手势信任链（User Activation），并提供轻量级 `window.prompt` 兜底机制与直连 WebSocket 数据注入。

**Architecture:** 
在 `frontend/src/components/terminal/TerminalAccessoryBar.tsx` 中解除 `Paste` 按钮的 `onTouchStart` 和 `onMouseDown` 的 `preventDefault` 拦截，确保浏览器保留用户手势信任链；在 `frontend/src/components/WebTerminalView.tsx` 中重构 `handlePasteClipboard`，优先使用 `navigator.clipboard.readText()`，失败或在非 HTTPS（内网 HTTP）环境下平滑回退到 `window.prompt`，并通过 `handleSendInput(clipText)` 管道直接写入 PTY，并在 `frontend/src/i18n/locales/` 中配置多语言提示。

**Tech Stack:** React, TypeScript, xterm.js, Tailwind CSS, Jest.

## Global Constraints

- 仅对 `Paste` 按钮移除 `preventDefault`，其他方向键/修饰键（Esc、Tab、Ctrl、方向键等）必须保持现有的 `preventDefault` 逻辑，以防止意外弹出软键盘或失焦。
- 粘贴内容必须通过 `handleSendInput(clipText, false)` 直连 WebSocket 传输，确保多行命令及换行符完整性。
- 当 `navigator.clipboard.readText()` 失败或不可用时，必须触发 `window.prompt` 供用户手动粘贴输入，用户取消（返回 `null`）时不执行任何输入。
- 保持 TypeScript 严格模式无报错，且全量 Jest 测试套件 100% 绿灯通过。

---

### Task 1: 在多语言文件中添加粘贴提示文案并在辅助键盘栏恢复原生手势信任链

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts:455-465`
- Modify: `frontend/src/i18n/locales/en.ts:455-465`
- Modify: `frontend/src/components/terminal/TerminalAccessoryBar.tsx:365-378`
- Test: `tests/terminalAccessoryBar.test.ts`

**Interfaces:**
- i18n key: `webTerminal.pastePromptTip`
  - `zh`: `"请长按粘贴文字："`
  - `en`: `"Paste text to terminal:"`
- Component: `TerminalAccessoryBar` 的 Paste 按钮：
  - 去除 `onTouchStart={(e) => e.preventDefault()}`
  - 去除 `onMouseDown={(e) => e.preventDefault()}`
  - 保留 `onClick={onPaste}`

- [x] **Step 1: 在 `tests/terminalAccessoryBar.test.ts` 中编写对 Paste 按钮保留原生手势的断言测试**

```typescript
  test('Paste button preserves native touch and mouse events for clipboard user activation', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');
    // Extract the paste button block
    const pasteIdx = content.indexOf('{/* Action: Paste */}');
    expect(pasteIdx).toBeGreaterThan(0);
    const pasteBlock = content.slice(pasteIdx, pasteIdx + 400);

    // Should NOT contain onTouchStart preventDefault or onMouseDown preventDefault
    expect(pasteBlock).not.toContain('onTouchStart={(e) => e.preventDefault()}');
    expect(pasteBlock).not.toContain('onMouseDown={(e) => e.preventDefault()}');
    expect(pasteBlock).toContain('onClick={onPaste}');
  });
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalAccessoryBar.test.ts`
Expected: FAIL - `pasteBlock` 仍包含 `onTouchStart={(e) => e.preventDefault()}`

- [x] **Step 3: 更新多语言文件并修改 `TerminalAccessoryBar.tsx` 中的 Paste 按钮**

在 `frontend/src/i18n/locales/zh.ts` 中的 `webTerminal` 下增加：
```typescript
    pastePromptTip: "请长按粘贴文字：",
```
在 `frontend/src/i18n/locales/en.ts` 中的 `webTerminal` 下增加：
```typescript
    pastePromptTip: "Paste text to terminal:",
```

在 `frontend/src/components/terminal/TerminalAccessoryBar.tsx` 中修改 Paste 按钮：
```tsx
        {/* Action: Paste (Preserves native touch activation without preventDefault) */}
        <button
          type="button"
          onClick={onPaste}
          className="px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] flex items-center space-x-1 font-mono text-xs font-semibold border border-[var(--border-subtle)] transition-all shadow-sm"
          title={t('webTerminal.paste')}
        >
          <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span className="text-[11px]">{t('webTerminal.paste')}</span>
        </button>
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/terminalAccessoryBar.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts frontend/src/components/terminal/TerminalAccessoryBar.tsx tests/terminalAccessoryBar.test.ts
git commit -m "fix(terminal): preserve native touch activation on paste button in accessory bar"
```

---

### Task 2: 在 `WebTerminalView.tsx` 中重构粘贴处理逻辑（支持异步读取、Prompt 兜底与直连注入）

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:1420-1445`
- Test: `tests/terminalMobilePaste.test.ts`

**Interfaces:**
- Consumes:
  - `handleSendInput(data: string, shouldFocus?: boolean): void`
  - `showToast(message: string): void`
  - `t(key: string, defaultValue?: string): string`
- Modifies:
  - `handlePasteClipboard()`: 异步尝试读取剪贴板，失败或无剪贴板 API 时调用 `window.prompt` 兜底，最终调用 `handleSendInput(clipText, false)` 并聚焦终端。

- [x] **Step 1: 编写 `tests/terminalMobilePaste.test.ts` 源码逻辑与功能断言测试**

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Mobile Paste Logic Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('handlePasteClipboard implementation includes async clipboard reading and window.prompt fallback', () => {
    expect(content).toContain('handlePasteClipboard = useCallback(async () => {');
    expect(content).toContain('navigator.clipboard.readText()');
    expect(content).toContain('window.prompt');
    expect(content).toContain("t('webTerminal.pastePromptTip'");
  });

  it('handlePasteClipboard directly sends text via handleSendInput and focuses xterm', () => {
    expect(content).toContain('handleSendInput(clipText, false)');
    expect(content).toContain('xtermRef.current.focus()');
  });

  it('does not send input when user cancels prompt or clipboard is empty', () => {
    // Verifies guard clause if (!clipText) return
    expect(content).toMatch(/if\s*\(!clipText\)\s*\{\s*return;\s*\}/);
  });
});
```

- [x] **Step 2: 运行测试验证其失败**

Run: `npx jest tests/terminalMobilePaste.test.ts`
Expected: FAIL - 未实现新的 async 与 prompt 兜底逻辑

- [x] **Step 3: 更新 `frontend/src/components/WebTerminalView.tsx` 中的 `handlePasteClipboard`**

修改 `handlePasteClipboard` 实现为：
```typescript
  const handlePasteClipboard = useCallback(async () => {
    let clipText = '';

    // 1. Attempt modern asynchronous Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        clipText = await navigator.clipboard.readText();
      } catch (err) {
        console.warn('[WebTerminal] Clipboard readText failed, falling back to prompt:', err);
      }
    }

    // 2. Fallback: prompt for user input in insecure HTTP context or when permission denied
    if (!clipText && typeof window !== 'undefined') {
      const manualInput = window.prompt(t('webTerminal.pastePromptTip', '请长按粘贴文字：'));
      if (manualInput) {
        clipText = manualInput;
      }
    }

    // 3. If cancelled or still empty, safely return
    if (!clipText) {
      return;
    }

    // 4. Send directly to terminal via WebSocket pipeline & keep focus
    handleSendInput(clipText, false);
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [handleSendInput, t]);
```

- [x] **Step 4: 重新运行测试验证其通过**

Run: `npx jest tests/terminalMobilePaste.test.ts`
Expected: PASS

- [x] **Step 5: 提交更改**

```bash
git add frontend/src/components/WebTerminalView.tsx tests/terminalMobilePaste.test.ts
git commit -m "fix(terminal): support clipboard fallback prompt and direct input send on mobile paste"
```

---

### Task 3: 前端构建与全套自动化测试验证

**Files:**
- None (Verification & Build only)

- [x] **Step 1: 运行前端构建检查**

Run: `npm run build:frontend`
Expected: Vite 编译顺利通过，输出正常，0 错误

- [x] **Step 2: 运行全量 Jest 测试套件**

Run: `npm test`
Expected: 104 个测试套件（包括所有 terminal 相关测试）全部通过

- [x] **Step 3: 检查 git 仓库状态干净**

Run: `git status`
Expected: working tree clean

---
