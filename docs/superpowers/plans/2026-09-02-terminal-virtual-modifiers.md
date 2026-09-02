# 终端虚拟修饰键组合按键拦截与编码实现计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解决网页终端底部工具栏虚拟 CTRL 与 ALT 按钮选中后无法与软/硬键盘组合输入快捷键的问题，实现精确的按键拦截、VT100/ANSI 编码转换及单次触发自动弹起释放。

**Architecture:** 
1. 编写独立解析器 `frontend/src/utils/terminalKeyEncoder.ts`，负责将 `KeyboardEvent` 与虚拟 `ctrl`/`alt` 状态转换为 VT100 控制字符（如 `\x01`~`\x1a`）及 ANSI ESC 前缀序列（如 `\x1bb`、`\x1b\x03`）。
2. 在 `WebTerminalView.tsx` 中使用 `term.attachCustomKeyEventHandler` 挂载 `keydown` 拦截器，使用 Ref 规避 React 闭包陷阱，并在成功消费后即时重置修饰键状态（Auto-release）。
3. 增加 Jest 单元测试覆盖全部编码规则。

**Tech Stack:** React 18, TypeScript, xterm.js, VT100/ANSI Terminal Escape Sequences, Jest.

## Global Constraints

- **Single-shot Latch & Auto-release**: 虚拟 CTRL / ALT 在成功匹配一次键盘按键并发送后，必须自动重置为未激活状态。
- **Dual-Modifier Support**: 必须支持同时激活 CTRL + ALT（例如 CTRL+ALT+A $\to$ `\x1b\x01`）。
- **Modifier Passthrough**: 单独按物理 Shift/Ctrl/Alt/Meta 键时不得消耗虚拟修饰键状态，保持激活等待字符键。
- **Zero React Stale Closure**: 拦截器中读取修饰键状态必须使用 Ref 同步，确保 100% 实时响应。

---

### Task 1: 编写 `terminalKeyEncoder.ts` 及其单元测试

**Files:**
- Create: `frontend/src/utils/terminalKeyEncoder.ts`
- Create: `tests/terminalKeyEncoder.test.ts`

**Interfaces:**
- Produces: 
  ```typescript
  export function encodeModifierKey(
    event: { key: string; code?: string; shiftKey?: boolean },
    ctrl: boolean,
    alt: boolean
  ): string | null
  ```

- [ ] **Step 1: 编写失败的单元测试 `tests/terminalKeyEncoder.test.ts`**

```typescript
import { encodeModifierKey } from '../frontend/src/utils/terminalKeyEncoder';

describe('terminalKeyEncoder', () => {
  it('returns null when no virtual modifiers are active', () => {
    expect(encodeModifierKey({ key: 'c' }, false, false)).toBeNull();
  });

  it('ignores modifier keys alone (Shift, Control, Alt, Meta)', () => {
    expect(encodeModifierKey({ key: 'Shift' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Control' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Alt' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Meta' }, false, true)).toBeNull();
  });

  it('encodes CTRL + letter to control character (\\x01 - \\x1a)', () => {
    expect(encodeModifierKey({ key: 'a' }, true, false)).toBe('\x01');
    expect(encodeModifierKey({ key: 'c' }, true, false)).toBe('\x03');
    expect(encodeModifierKey({ key: 'd' }, true, false)).toBe('\x04');
    expect(encodeModifierKey({ key: 'z' }, true, false)).toBe('\x1a');
    expect(encodeModifierKey({ key: 'C' }, true, false)).toBe('\x03');
  });

  it('encodes ALT + letter to ESC + letter', () => {
    expect(encodeModifierKey({ key: 'b' }, false, true)).toBe('\x1bb');
    expect(encodeModifierKey({ key: 'f' }, false, true)).toBe('\x1bf');
    expect(encodeModifierKey({ key: 'd' }, false, true)).toBe('\x1bd');
  });

  it('encodes CTRL + ALT + letter to ESC + control char', () => {
    expect(encodeModifierKey({ key: 'a' }, true, true)).toBe('\x1b\x01');
    expect(encodeModifierKey({ key: 'c' }, true, true)).toBe('\x1b\x03');
  });

  it('encodes CTRL + number / special symbol characters', () => {
    expect(encodeModifierKey({ key: '2' }, true, false)).toBe('\x00');
    expect(encodeModifierKey({ key: '@' }, true, false)).toBe('\x00');
    expect(encodeModifierKey({ key: '[' }, true, false)).toBe('\x1b');
    expect(encodeModifierKey({ key: '\\' }, true, false)).toBe('\x1c');
    expect(encodeModifierKey({ key: ']' }, true, false)).toBe('\x1d');
    expect(encodeModifierKey({ key: '^' }, true, false)).toBe('\x1e');
    expect(encodeModifierKey({ key: '_' }, true, false)).toBe('\x1f');
    expect(encodeModifierKey({ key: '?' }, true, false)).toBe('\x7f');
    expect(encodeModifierKey({ key: 'Backspace' }, true, false)).toBe('\x08');
  });

  it('encodes arrow keys with modifiers', () => {
    expect(encodeModifierKey({ key: 'ArrowUp' }, true, false)).toBe('\x1b[1;5A');
    expect(encodeModifierKey({ key: 'ArrowDown' }, true, false)).toBe('\x1b[1;5B');
    expect(encodeModifierKey({ key: 'ArrowRight' }, false, true)).toBe('\x1b[1;3C');
    expect(encodeModifierKey({ key: 'ArrowLeft' }, true, true)).toBe('\x1b[1;7D');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**
  Run: `npx jest tests/terminalKeyEncoder.test.ts`
  Expected: FAIL (Cannot find module)

- [ ] **Step 3: 实现 `frontend/src/utils/terminalKeyEncoder.ts`**

```typescript
const IGNORED_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
  'Unidentified'
]);

export function encodeModifierKey(
  event: { key: string; code?: string; shiftKey?: boolean },
  ctrl: boolean,
  alt: boolean
): string | null {
  if (!ctrl && !alt) {
    return null;
  }

  const { key } = event;
  if (!key || IGNORED_KEYS.has(key)) {
    return null;
  }

  // 1. Arrow Keys with Modifier
  const arrowMap: Record<string, string> = {
    ArrowUp: 'A',
    ArrowDown: 'B',
    ArrowRight: 'C',
    ArrowLeft: 'D',
  };

  if (arrowMap[key]) {
    const code = arrowMap[key];
    const modParam = ctrl && alt ? '7' : ctrl ? '5' : '3';
    return `\x1b[1;${modParam}${code}`;
  }

  // 2. Letters (a-z, A-Z)
  if (/^[a-zA-Z]$/.test(key)) {
    let base = key;
    if (ctrl) {
      const charCode = key.toUpperCase().charCodeAt(0);
      base = String.fromCharCode((charCode - 64) & 0x1F);
    }
    return alt ? `\x1b${base}` : base;
  }

  // 3. CTRL + Numbers & Special Control Symbols
  if (ctrl) {
    switch (key) {
      case '@':
      case '2':
      case ' ':
        return alt ? '\x1b\x00' : '\x00';
      case '[':
      case '3':
      case 'Escape':
        return alt ? '\x1b\x1b' : '\x1b';
      case '\\':
      case '4':
        return alt ? '\x1b\x1c' : '\x1c';
      case ']':
      case '5':
        return alt ? '\x1b\x1d' : '\x1d';
      case '^':
      case '6':
        return alt ? '\x1b\x1e' : '\x1e';
      case '_':
      case '-':
      case '7':
        return alt ? '\x1b\x1f' : '\x1f';
      case '?':
      case '8':
        return alt ? '\x1b\x7f' : '\x7f';
      case 'Backspace':
        return alt ? '\x1b\x08' : '\x08';
      case 'Enter':
        return alt ? '\x1b\n' : '\n';
      case 'Tab':
        return alt ? '\x1b\t' : '\t';
      default:
        break;
    }
  }

  // 4. ALT + other character
  if (alt) {
    if (key === 'Enter') return '\x1b\r';
    if (key === 'Tab') return '\x1b\t';
    if (key === 'Backspace') return '\x1b\x7f';
    if (key.length === 1) return `\x1b${key}`;
  }

  return null;
}
```

- [ ] **Step 4: 重新运行单元测试验证通过**
  Run: `npx jest tests/terminalKeyEncoder.test.ts`
  Expected: PASS

- [ ] **Step 5: 提交更改**
  ```bash
  git add frontend/src/utils/terminalKeyEncoder.ts tests/terminalKeyEncoder.test.ts
  git commit -m "feat(terminal): add terminal key encoder for virtual ctrl and alt combinations"
  ```

---

### Task 2: 在 `WebTerminalView.tsx` 中集成按键拦截与状态自动弹起

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:40-60,300-340,410-440,730-760`

**Interfaces:**
- Consumes: `encodeModifierKey` from `../utils/terminalKeyEncoder`
- Produces: Seamless virtual modifier keyboard shortcut input in terminal

- [ ] **Step 1: 引入 `encodeModifierKey` 并维护 Ref 引用**
  在 `WebTerminalView.tsx` 中引入 `encodeModifierKey`。
  创建 `isCtrlActiveRef` 和 `isAltActiveRef`：
  ```typescript
  const isCtrlActiveRef = useRef<boolean>(isCtrlActive);
  isCtrlActiveRef.current = isCtrlActive;

  const isAltActiveRef = useRef<boolean>(isAltActive);
  isAltActiveRef.current = isAltActive;
  ```

- [ ] **Step 2: 挂载 `term.attachCustomKeyEventHandler`**
  在 `term.open(terminalContainerRef.current)` 后添加按键拦截处理器：
  ```typescript
  term.attachCustomKeyEventHandler((domEvent: KeyboardEvent) => {
    if (domEvent.type !== 'keydown') {
      return true;
    }

    const isCtrl = isCtrlActiveRef.current;
    const isAlt = isAltActiveRef.current;

    if (!isCtrl && !isAlt) {
      return true;
    }

    const encoded = encodeModifierKey(domEvent, isCtrl, isAlt);
    if (encoded !== null) {
      // 发送输入
      handleSendInput(encoded);

      // 自动弹起/重置虚拟修饰键
      setIsCtrlActive(false);
      setIsAltActive(false);
      isCtrlActiveRef.current = false;
      isAltActiveRef.current = false;

      // 阻止默认行为并通知 xterm 消费事件
      domEvent.preventDefault();
      domEvent.stopPropagation();
      return false;
    }

    return true;
  });
  ```

- [ ] **Step 3: 优化辅助栏与快捷动作按钮重置联动**
  当用户触发辅助栏自带的动作（如点击 `^C`, `^D`, `^L` 或 Snippet 执行）时，确保同时重置 `isCtrlActive` / `isAltActive`。

- [ ] **Step 4: 执行前端编译检查**
  Run: `npm run build:frontend`
  Expected: PASS with 0 TypeScript/build errors.

- [ ] **Step 5: 提交更改**
  ```bash
  git add frontend/src/components/WebTerminalView.tsx
  git commit -m "feat(terminal): attach custom key event handler to support virtual ctrl and alt combinations"
  ```

---

### Task 3: 整体验证与全套测试

**Files:**
- None (Verification only)

- [ ] **Step 1: 运行完整构建**
  Run: `npm run build`
  Expected: Frontend & Backend build cleanly.

- [ ] **Step 2: 运行所有单元测试**
  Run: `npm test`
  Expected: All test suites pass.
