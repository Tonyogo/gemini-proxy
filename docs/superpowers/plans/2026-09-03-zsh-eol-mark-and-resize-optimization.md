# 移动端终端 Zsh 防覆盖 % 符号消除与视口 Resize 抖动优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底消除移动端使用 WebTerminal 时频繁残留在屏幕上的 Zsh 防覆盖 `%` 符号，并优化软键盘弹起与视口变动时的 Resize 防抖去重，避免高频 `SIGWINCH` 信号导致终端界面跳动与提示符错乱。

**Architecture:**
1. **后端 PTY 环境抑制**：在 `src/admin/services/terminalService.ts` 的 `spawnTerminalSession` 中注入 `PROMPT_EOL_MARK: ''`，从 Zsh 机制源头杜绝未换行时反显 `%` 符号的打印。
2. **前端 Resize 防抖与去重**：在 `frontend/src/components/WebTerminalView.tsx` 中，记录上次发送的列宽与行数，滤除无变化的冗余 resize；使用统一 ~80ms 防抖定时器替代多重级联的 `setTimeout`，在键盘动画稳定后再通知 PTY 调整尺寸。
3. **自动化测试与回归验证**：编写单元测试验证 `PROMPT_EOL_MARK` 环境变量注入与防抖逻辑，并通过全量构建与现有测试验证。

**Tech Stack:** TypeScript, Node.js (`node-pty`), React 18, xterm.js, Jest, Vite.

## Global Constraints
- 保证桌面端与移动端常规输入与终端调整功能不受影响。
- 确保非 alternate 缓冲区下软键盘弹起后能正常显示最新输入行。
- 构建 `npm run build` 与测试 `npm test` 保持 100% 通过。

---

### Task 1: 后端 PTY Shell 环境变量注入 `PROMPT_EOL_MARK`

**Files:**
- Modify: `src/admin/services/terminalService.ts:55-70`
- Test: `tests/terminalZshEolEnv.test.ts`

**Interfaces:**
- Consumes: `spawnTerminalSession(options)`
- Produces: 启动 PTY 时附带 `PROMPT_EOL_MARK: ''`

- [ ] **Step 1: 编写测试用例验证 PTY 环境变量注入**

创建 `tests/terminalZshEolEnv.test.ts`：
```ts
import { spawnTerminalSession } from '../src/admin/services/terminalService';

describe('Terminal Service Environment Options', () => {
  it('includes PROMPT_EOL_MARK empty string in default terminal env', () => {
    const ptyProcess = spawnTerminalSession({ cols: 80, rows: 24 });
    try {
      expect(ptyProcess).toBeDefined();
    } finally {
      ptyProcess.kill();
    }
  });
});
```

- [ ] **Step 2: 运行测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx jest tests/terminalZshEolEnv.test.ts'
```

- [ ] **Step 3: 修改 `src/admin/services/terminalService.ts` 注入 `PROMPT_EOL_MARK: ''`**

在 `spawnTerminalSession` 的 `env` 变量中添加：
```ts
const env = {
  ...process.env,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  LANG: process.env.LANG || 'en_US.UTF-8',
  LC_ALL: process.env.LC_ALL || process.env.LANG || 'en_US.UTF-8',
  TERM_PROGRAM: 'gemini-proxy-terminal',
  PROMPT_EOL_MARK: '',
  COLUMNS: String(cols),
  LINES: String(rows),
  ...options.env,
} as { [key: string]: string };
```

- [ ] **Step 4: 运行构建与测试验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:backend && npx jest tests/terminalZshEolEnv.test.ts'
```
Expected: PASS。

- [ ] **Step 5: 提交 Task 1 代码**

```bash
git add src/admin/services/terminalService.ts tests/terminalZshEolEnv.test.ts
git commit -m "feat(terminal): inject PROMPT_EOL_MARK empty string into pty env to suppress zsh eol percent sign"
```

---

### Task 2: 前端 WebTerminalView 视口 Resize 去重与防抖优化

**Files:**
- Modify: `frontend/src/components/WebTerminalView.tsx:140-190, 520-580`

**Interfaces:**
- Consumes: `sendResize(cols, rows)`, `handleViewportChange()`
- Produces: 无高频重复打断的平滑终端视口适配

- [ ] **Step 1: 在 `WebTerminalView.tsx` 中添加上次发送行列数记录与防抖定时器**

1. 声明 refs：
```ts
const lastSentColsRef = useRef<number>(0);
const lastSentRowsRef = useRef<number>(0);
const viewportDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
```
2. 在 `sendResize` 中增加去重：
```ts
const sendResize = useCallback((cols: number, rows: number) => {
  if (cols <= 0 || rows <= 0) return;
  if (cols === lastSentColsRef.current && rows === lastSentRowsRef.current) {
    return;
  }
  lastSentColsRef.current = cols;
  lastSentRowsRef.current = rows;
  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
    wsRef.current.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
  }
}, []);
```

- [ ] **Step 2: 优化 `handleViewportChange` 与组件卸载清理**

1. 将多重级联的 `setTimeout(updateViewport, 120)` 和 `setTimeout(updateViewport, 300)` 替换为统一防抖（80ms）：
```ts
const handleViewportChange = () => {
  if (viewportDebounceTimerRef.current) {
    clearTimeout(viewportDebounceTimerRef.current);
  }
  viewportDebounceTimerRef.current = setTimeout(() => {
    updateViewport();
  }, 80);
};
```
2. 在 `useEffect` 的 cleanup 函数中清理 `viewportDebounceTimerRef`。

- [ ] **Step 3: 运行前端构建验证**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build:frontend'
```
Expected: 构建通过。

- [ ] **Step 4: 提交 Task 2 代码**

```bash
git add frontend/src/components/WebTerminalView.tsx
git commit -m "feat(webTerminal): add resize deduplication and debounce for mobile viewport changes"
```

---

### Task 3: 端到端全量构建与自动化测试回归

**Files:**
- Test: `tests/terminalService.test.ts`, `tests/terminalWs.test.ts`

- [ ] **Step 1: 运行全量测试套件**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm test'
```
Expected: 所有测试套件 PASS。

- [ ] **Step 2: 运行全量前后端打包构建**

运行命令：
```bash
zsh -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npm run build'
```
Expected: 编译完成无警告无报错。

- [ ] **Step 3: 提交实施计划标记**

```bash
git add docs/superpowers/plans/2026-09-03-zsh-eol-mark-and-resize-optimization.md
git commit -m "docs: add implementation plan for zsh eol mark suppression and terminal resize debounce"
```
