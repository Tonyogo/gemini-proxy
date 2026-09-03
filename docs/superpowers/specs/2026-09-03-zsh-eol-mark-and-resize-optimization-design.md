# 移动端终端 Zsh 防覆盖 % 符号消除与视口 Resize 抖动优化设计方案

## 1. 目标与问题背景
在移动端使用 Web 网页终端时，经常在屏幕左侧或提示符前出现残留的反显 `%` 符号：
1. **Zsh 防覆盖机制（PROMPT_SP / PROMPT_CR）**：
   - Zsh 为了防止上一个命令的输出缺少换行符从而覆盖新提示符，会在打印 Prompt 前先输出一个反显的 `%`（或 `#`），随后打印一整行空格将光标推到最右侧并 `\r` 回到行首。
   - 当终端列宽（`COLUMNS`）与前端容器渲染宽度发生瞬时不同步时，该光标移动计算产生偏差，导致反显 `%` 残留于终端界面上。
2. **移动端输入法软键盘唤起时的剧烈尺寸振荡**：
   - 移动端唤起或收起软键盘时，`window.visualViewport` 高度瞬间连续变化，多次触发 `resize` 与 `scroll` 事件；
   - 前端连续无节制调用 `fitAddon.fit()` 并多次发送 `sendResize(cols, rows)`；
   - 触发后端 PTY 连续收到 `SIGWINCH` 信号，导致 Zsh 在短时间内连续重绘 Prompt，加剧了换行误判与 `%` 残留，并伴随明显的终端闪烁。

本方案采用**“后端 PTY 环境抑制 + 前端视口防抖防重”**的双端联合根治策略。

---

## 2. 详细设计规范

### 2.1 后端 PTY Shell 环境变量抑制 (`src/admin/services/terminalService.ts`)
- 在 `spawnTerminalSession` 初始化 `env` 环境变量时，显式注入：
  ```ts
  PROMPT_EOL_MARK: ''
  ```
- **机制说明**：Zsh 在初始化和运行时会检测 `PROMPT_EOL_MARK`，当该值为空字符串 `""` 时，直接绕过 `%` 输出逻辑，从根本上杜绝该字符被 Shell 打印出来。

### 2.2 前端视口 Resize 防抖与去重 (`frontend/src/components/WebTerminalView.tsx`)
1. **过滤无状态变更的重复 Resize**：
   - 在 `WebTerminalView` 内部维护 `lastSentColsRef` 与 `lastSentRowsRef`；
   - 在触发 `sendResize(cols, rows)` 前，校验 `cols === lastSentColsRef.current && rows === lastSentRowsRef.current`，若未发生变化则跳过 WebSocket 控制消息发送。
2. **防抖替代多重定时器级联**：
   - 清除当前代码中 `setTimeout(..., 120)` 和 `setTimeout(..., 300)` 等多个叠加定时器导致的连击问题；
   - 使用统一的防抖定时器（`viewportDebounceTimerRef`，延时 ~80ms），在软键盘弹起/收起动画平稳后执行单次 `fitAddon.fit()` 与 `sendResize()`；
   - 在非 alternate 缓冲区下平滑调用 `scrollToBottom()`，避免软键盘遮挡输入行。

---

## 3. 影响范围与修改组件
- 后端：`src/admin/services/terminalService.ts`
  - `spawnTerminalSession` 中的 `env` 配置
- 前端：`frontend/src/components/WebTerminalView.tsx`
  - `updateViewport` 与 `handleViewportChange` 逻辑
  - `sendResize` 去重防抖逻辑

---

## 4. 验证与回归测试
1. **测试用例**：
   - 编写 `tests/terminalZshEolEnv.test.ts` 验证 `spawnTerminalSession` 的默认 `env` 中包含 `PROMPT_EOL_MARK: ''`；
   - 验证 `sendResize` 在行列数未发生变化时不进行冗余消息发送。
2. **功能与全量回归**：
   - 运行 `npm test` 保证既有与新增测试套件 100% 通过；
   - 运行 `npm run build` 确保前后端编译无任何错误。
