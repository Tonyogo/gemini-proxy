# System Message Wrapping Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy "convert inline `role: 'system'` messages to `systemInstruction`" behavior and replace the switch so that by default Proxy Mode wraps inline `role: 'system'` messages with `<system-reminder>` (while Direct Mode leaves them untouched), and when the switch is enabled both Proxy Mode and Direct Mode wrap inline `role: 'system'` messages with `<system-context>` and merge them into `role: 'user'` messages.

**Architecture:** `ClaudeTranslator` removes the `deduplicateSystemMessages` extraction-to-`systemInstruction` branch in `translateClaudeToGoogle` and uses a unified tag resolver (`<system-reminder>` when `config.systemRoleToInstruction` is `false`, or `<system-context>` / custom `config.runtimeContextTag` when `true`). In `preprocessClaudeDirectRequest`, when `config.systemRoleToInstruction` is `false` (default), `messages` keep inline `role: 'system'` untouched; when `true`, inline `role: 'system'` messages are cleaned via `cleanSystemContent()`, wrapped in `<system-context>\n...\n</system-context>`, and merged into `role: 'user'` segments with system blocks placed before user blocks.

**Tech Stack:** TypeScript, Express, React (Tailwind CSS), Jest.

**Spec:** `docs/superpowers/specs/2026-10-25-system-message-wrapping-design.md`

## Global Constraints

- Zero static config caching: always read `config.systemRoleToInstruction` and `config.runtimeContextTag` dynamically at request time.
- Proxy Mode (`translateClaudeToGoogle`) never routes `messages` inline `role: 'system'` into `systemInstruction`; it always wraps them and merges them into `role: 'user'` segments (`systemParts` before `userParts`).
- Proxy Mode default (`config.systemRoleToInstruction === false`): wraps inline `role: 'system'` messages with `<system-reminder>` (unless `config.runtimeContextTag` is explicitly set to a custom non-default tag other than `'system-context'`).
- Proxy Mode when switch is enabled (`config.systemRoleToInstruction === true`): wraps inline `role: 'system'` messages with `config.runtimeContextTag || 'system-context'`.
- Direct Mode (`preprocessClaudeDirectRequest`) default (`config.systemRoleToInstruction === false`): does NOT convert or wrap inline `role: 'system'` messages in `messages`.
- Direct Mode when switch is enabled (`config.systemRoleToInstruction === true`): wraps inline `role: 'system'` messages with `config.runtimeContextTag || 'system-context'` and merges them into `role: 'user'` messages (`systemBlocks` before `userBlocks`).

## Review Focus

- In Direct Mode when the switch is enabled (`config.systemRoleToInstruction === true`), an inline `role: 'system'` message whose content is `x-anthropic-billing-header...` (stripped to `null` by `cleanSystemContent`) must not emit an empty `<system-context>\n\n</system-context>` block or an empty `role: 'user'` message.
- In Direct Mode when the switch is enabled (`true`), a `user` turn that has no adjacent `role: 'system'` messages and only a single `user` message with a string `content` should preserve its string `content` (or valid Claude content blocks) without mutating the caller's original `claudeBody`.
- In Direct Mode when the switch is enabled (`true`), interleaved `[user, system, user, system]` messages within the same turn (before an `assistant` message) must place all wrapped `system` text blocks before the `user` blocks in the merged `role: 'user'` message, matching Proxy Mode ordering.
- Custom `config.runtimeContextTag` values (e.g. `'custom-system-wrapper'` or `'dynamic-context-tag'`) must still take effect in `translateClaudeToGoogle`.
- `SystemRuntimeMatrix.tsx` must evaluate `Boolean(config?.systemRoleToInstruction)` rather than `config?.systemRoleToInstruction !== false` so the default `false` state accurately displays `<system-reminder>` mode.

---

### Task 1: Update Proxy Mode & Direct Mode Inline System Message Wrapping in `ClaudeTranslator`

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts:71-165,610-660,795-825`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Modifies `ClaudeTranslator.translateClaudeToGoogle(claudeBody: ClaudeRequest)` in `src/proxy/services/claudeTranslator.ts`.
- Modifies `ClaudeTranslator.preprocessClaudeDirectRequest(claudeBody: ClaudeRequest)` in `src/proxy/services/claudeTranslator.ts`.

- [x] **Step 1: Update and add unit tests in `tests/claudeTranslator.test.ts`**

1. In `tests/claudeTranslator.test.ts` lines 50-148:
   - Update the 4 default inline system message tests (`translates system prompts with role user and combines messages system roles`, `translates [user, system] sequence...`, `translates interleaved user and system messages...`, `translates tool_result with system message...`) so they expect `<system-reminder>\n...\n</system-reminder>` when `config.systemRoleToInstruction` is `false` (default).
2. In `tests/claudeTranslator.test.ts` lines 1186-1285 (`describe('ClaudeTranslator - SYSTEM_ROLE_TO_INSTRUCTION & Deduplication', ...)`):
   - Replace the old `systemInstruction` injection assertions with tests verifying the new switch behavior in Proxy Mode:
     - When `config.systemRoleToInstruction = false` (default), inline `role: 'system'` messages in `messages` are wrapped in `<system-reminder>\n...\n</system-reminder>` inside `contents` (`role: 'user'`) and are NOT added to `systemInstruction`.
     - When `config.systemRoleToInstruction = true`, inline `role: 'system'` messages in `messages` are wrapped in `<system-context>\n...\n</system-context>` inside `contents` (`role: 'user'`) and are NOT added to `systemInstruction`.
3. In `tests/claudeTranslator.test.ts` inside `describe('Claude Direct Mode Preprocessing & Headers', ...)`:
   - Add test cases for `preprocessClaudeDirectRequest`:
     - When `config.systemRoleToInstruction = false` (default), `messages` containing `{ role: 'system', content: 'Inline system message stays as-is' }` remain `{ role: 'system', content: 'Inline system message stays as-is' }`.
     - When `config.systemRoleToInstruction = true`, `messages` containing interleaved `role: 'system'` and `role: 'user'` (e.g. `[{ role: 'user', content: 'User 1' }, { role: 'system', content: 'Sys 1' }, { role: 'assistant', content: 'Ack' }, { role: 'system', content: 'x-anthropic-billing-header: cc' }, { role: 'system', content: 'Sys 2' }, { role: 'user', content: [{ type: 'text', text: 'User 2' }] }]`) are converted so that:
       - `x-anthropic-billing-header` is dropped;
       - Turn 1 becomes `{ role: 'user', content: [{ type: 'text', text: '<system-context>\nSys 1\n</system-context>' }, { type: 'text', text: 'User 1' }] }`;
       - Turn 2 remains `{ role: 'assistant', content: 'Ack' }`;
       - Turn 3 becomes `{ role: 'user', content: [{ type: 'text', text: '<system-context>\nSys 2\n</system-context>' }, { type: 'text', text: 'User 2' }] }`.

- [x] **Step 2: Run `npx jest tests/claudeTranslator.test.ts` to verify the new/updated tests fail**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: FAIL

- [x] **Step 3: Implement the new wrapping logic in `src/proxy/services/claudeTranslator.ts`**

1. Add helper method `private resolveInlineSystemTag(): string` on `ClaudeTranslator`:
   ```ts
   private resolveInlineSystemTag(): string {
     const configuredTag = (config.runtimeContextTag || '').trim();
     if (config.systemRoleToInstruction) {
       return configuredTag || 'system-context';
     }
     if (configuredTag && configuredTag !== 'system-context') {
       return configuredTag;
     }
     return 'system-reminder';
   }
   ```
2. In `translateClaudeToGoogle`:
   - Replace `const tag = config.runtimeContextTag || 'system-context';` with `const tag = this.resolveInlineSystemTag();`.
   - Remove the `if (config.systemRoleToInstruction) { const deduplicatedSystemMsgs = ... }` block that appended inline system messages to `systemInstruction`.
   - In the `for (const msg of inputMessages)` loop under `else if (msg.role === 'system')`, remove `if (config.systemRoleToInstruction) { continue; }` so inline `role: 'system'` messages are always wrapped via `wrapSystemMessageContent(msg.content)` and pushed to `pendingUserSegment.systemParts`.
3. In `preprocessClaudeDirectRequest`:
   - After `directRequest.messages = this.filterEphemeralMessages(directRequest.messages)`, check `if (config.systemRoleToInstruction && Array.isArray(directRequest.messages) && directRequest.messages.length > 0)`:
     - Resolve `const tag = (config.runtimeContextTag || '').trim() || 'system-context'`.
     - Convert inline `role: 'system'` messages by grouping consecutive non-assistant turns into `pendingUserSegment: { systemBlocks: any[]; userBlocks: any[]; rawUserMessages: any[] }`:
       - For `msg.role === 'system'`: clean string or array text blocks with `this.cleanSystemContent()`, wrap surviving text as `{ type: 'text', text: \`<${tag}>\\n${cleaned}\\n</${tag}>\` }`, and push to `pendingUserSegment.systemBlocks`.
       - For `msg.role === 'user'`: push `msg` to `pendingUserSegment.rawUserMessages` and its normalized content blocks (`typeof msg.content === 'string'` -> `msg.content !== '' ? [{ type: 'text', text: msg.content }] : []`, `Array.isArray(msg.content)` -> `msg.content`) to `pendingUserSegment.userBlocks`.
       - When flushing `pendingUserSegment` (before an `assistant` message or at the end of `messages`):
         - If `systemBlocks.length === 0 && rawUserMessages.length === 1`, push `rawUserMessages[0]` as-is.
         - Else if `systemBlocks.length + userBlocks.length > 0`, push `{ role: 'user', content: [...systemBlocks, ...userBlocks] }`.

- [x] **Step 4: Run `npx jest tests/claudeTranslator.test.ts tests/dynamicConfigHotReload.test.ts` to verify they pass**

Run: `npx jest tests/claudeTranslator.test.ts tests/dynamicConfigHotReload.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): wrap inline system messages with system-reminder by default and support system-context toggle

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Update Admin UI Switch Copy and Runtime Matrix Display

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:1610-1631`
- Modify: `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx:14,55-63`
- Modify: `frontend/src/i18n/locales/zh.ts:457`
- Modify: `frontend/src/i18n/locales/en.ts:436`

**Interfaces:**
- Preserves `systemRoleToInstruction: boolean` in `/api/admin/status` and `/api/admin/config` payloads while updating the UI labels and descriptions to reflect `<system-reminder>` (default OFF) vs `<system-context>` (ON).

- [x] **Step 1: Update `frontend/src/i18n/locales/zh.ts`, `frontend/src/i18n/locales/en.ts`, `frontend/src/components/ConfigModal.tsx`, and `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`**

1. In `frontend/src/i18n/locales/zh.ts`:
   - Update `systemRoleDesc` (and add `systemRoleTitle: "USE_SYSTEM_CONTEXT_TAG (<system-context> 包裹开关)"`):
     `systemRoleDesc: "默认将消息数组中的 system 消息用 <system-reminder> 包裹（直连模式默认不转换）；开启后统一强制使用 <system-context> 包裹并合入 user 消息。"`
2. In `frontend/src/i18n/locales/en.ts`:
   - Update `systemRoleDesc` (and add `systemRoleTitle: "USE_SYSTEM_CONTEXT_TAG (<system-context> Wrapper)"`):
     `systemRoleDesc: "Wraps inline system messages with <system-reminder> by default in Proxy mode (untouched in Direct mode); enable to force <system-context> wrapping across both modes."`
3. In `frontend/src/components/ConfigModal.tsx`:
   - Update the toggle label at line 1613 from hardcoded `SYSTEM_ROLE_TO_INSTRUCTION` to `{t('config.systemRoleTitle', 'USE_SYSTEM_CONTEXT_TAG (<system-context> 包裹开关)')}`.
4. In `frontend/src/components/dashboard/SystemRuntimeMatrix.tsx`:
   - Change line 14 from `const systemRoleToInstruction = config?.systemRoleToInstruction !== false;` to `const systemRoleToInstruction = Boolean(config?.systemRoleToInstruction);`.
   - Update the card label and status text at lines 57-61 to display `SYSTEM_MSG_WRAP_TAG` and `{systemRoleToInstruction ? '<system-context>' : '<system-reminder>'}`.

- [x] **Step 2: Run full test suite and build**

Run: `npx jest --runInBand && npm run build`
Expected: All test suites PASS and both frontend and backend build cleanly.

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/components/dashboard/SystemRuntimeMatrix.tsx frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "feat(ui): update system message wrapper switch labels and runtime matrix display

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
