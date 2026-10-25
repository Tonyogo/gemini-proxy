# System Message Wrapping & Tool Result Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify inline `role: 'system'` message wrapping across both Direct Mode and Proxy Mode so that by default (`config.systemRoleToInstruction === false`) both modes wrap inline `role: 'system'` messages as `<system-reminder>\n{text}\n</system-reminder>` and merge them into `role: 'user'` turns **after all `tool_result` blocks and before normal text blocks**, and when the switch is enabled (`config.systemRoleToInstruction === true`) both modes wrap inline `role: 'system'` messages as `<system-context>\n{text}\n</system-context>` and place them **at the very front of the `user` message (before `tool_result`)**.

**Architecture:** `ClaudeTranslator` uses `resolveInlineSystemTag()` (`'system-reminder'` when `config.systemRoleToInstruction` is `false`, or `config.runtimeContextTag || 'system-context'` when `true`) in both `translateClaudeToGoogle` (Proxy Mode) and `preprocessClaudeDirectRequest` (Direct Mode). When flushing a merged user segment:
- If `config.systemRoleToInstruction === false` (default `<system-reminder>` mode), tool result items (`functionResponse` parts in Proxy Mode; `type === 'tool_result'` blocks in Direct Mode) are placed first, followed by wrapped `system` blocks, followed by normal user blocks (`[...toolResults, ...systemBlocks, ...normalUserBlocks]`).
- If `config.systemRoleToInstruction === true` (`<system-context>` mode), wrapped `system` blocks are placed first, followed by all user blocks (`[...systemBlocks, ...userBlocks]`).

**Tech Stack:** TypeScript, React (i18n locales), Jest.

**Spec:** `docs/superpowers/specs/2026-10-25-system-message-wrapping-design.md`

## Global Constraints

- Zero static config caching: always read `config.systemRoleToInstruction` and `config.runtimeContextTag` dynamically at request time.
- Both Direct Mode (`preprocessClaudeDirectRequest`) and Proxy Mode (`translateClaudeToGoogle`) always convert inline `role: 'system'` messages into wrapped `user` blocks; neither mode leaves `role: 'system'` inside `messages`.
- Default (`config.systemRoleToInstruction === false`): wraps with `<system-reminder>\n{text}\n</system-reminder>` (unless `config.runtimeContextTag` is explicitly set to a custom tag other than `'system-context'`) and orders merged user turn items as `[...toolResultItems, ...systemItems, ...normalUserItems]`.
- Switch ON (`config.systemRoleToInstruction === true`): wraps with `<system-context>\n{text}\n</system-context>` (or custom `config.runtimeContextTag`) and orders merged user turn items as `[...systemItems, ...allUserItems]` (before `tool_result`).

## Review Focus

- In Proxy Mode (`translateClaudeToGoogle`), a user turn containing both a `tool_result` (`functionResponse` part) and normal text plus an inline `role: 'system'` message must order `parts` as `[functionResponse, <system-reminder>, normalText]` when `systemRoleToInstruction === false`, and `[<system-context>, functionResponse, normalText]` when `systemRoleToInstruction === true`.
- In Direct Mode (`preprocessClaudeDirectRequest`), a user turn containing both a `tool_result` block (`{ type: 'tool_result', ... }`) and a normal text block plus an inline `role: 'system'` message must order `content` as `[tool_result, <system-reminder>, normalText]` when `systemRoleToInstruction === false`, and `[<system-context>, tool_result, normalText]` when `systemRoleToInstruction === true`.
- In Direct Mode, when a user turn has no inline `role: 'system'` messages (or all inline `role: 'system'` messages were dropped by `cleanSystemContent` as `x-anthropic-billing-header`) and only 1 `role: 'user'` message, that `user` message's original `content` format (e.g. string `'Hello'`) is preserved unchanged.
- In Direct Mode,consecutive `role: 'user'` messages in the same turn without an intervening `assistant` message are merged into a single `role: 'user'` message.

---

### Task 1: Unify Direct & Proxy Mode System Wrapping and `tool_result` Ordering

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts:143-227,866-910`
- Modify: `frontend/src/i18n/locales/zh.ts:457-460`
- Modify: `frontend/src/i18n/locales/en.ts:454-458`
- Test: `tests/claudeTranslator.test.ts:121-148,1200-1328,2185-2345`

**Interfaces:**
- Modifies `ClaudeTranslator.preprocessClaudeDirectRequest(claudeBody: ClaudeRequest)` in `src/proxy/services/claudeTranslator.ts`.
- Modifies `ClaudeTranslator.translateClaudeToGoogle(claudeBody: ClaudeRequest)` in `src/proxy/services/claudeTranslator.ts`.

- [x] **Step 1: Update unit tests in `tests/claudeTranslator.test.ts` to assert the unified wrapping and `tool_result` ordering**

1. In `tests/claudeTranslator.test.ts` around lines 121-148 (`it('translates tool_result with system message...')`):
   - Update the test to verify that by default (`config.systemRoleToInstruction === false`), `functionResponse` comes **first** (`parts[0].functionResponse` is defined) and `<system-reminder>\nInstruction after tool\n</system-reminder>` comes **after `functionResponse` and before normal text**:
   ```ts
   it('translates tool_result with system message placing system-reminder after tool_result and before normal text by default', () => {
     const claudePayload = {
       model: 'gemini-3.5-flash',
       messages: [
         {
           role: 'user',
           content: [
             {
               type: 'tool_result',
               tool_use_id: 'toolu_123',
               content: 'Tool execution result'
             },
             {
               type: 'text',
               text: 'Follow-up user question'
             }
           ]
         },
         { role: 'system', content: 'Instruction after tool' }
       ]
     } as any;
     const result = translator.translateClaudeToGoogle(claudePayload);

     expect(result.googleRequest.contents.length).toEqual(1);
     expect(result.googleRequest.contents[0].role).toEqual('user');
     expect(result.googleRequest.contents[0].parts.length).toEqual(3);
     expect(result.googleRequest.contents[0].parts[0].functionResponse).toBeDefined();
     expect(result.googleRequest.contents[0].parts[1].text).toEqual(
       '<system-reminder>\nInstruction after tool\n</system-reminder>'
     );
     expect(result.googleRequest.contents[0].parts[2].text).toEqual('Follow-up user question');
   });
   ```
2. In `tests/claudeTranslator.test.ts` inside `describe('ClaudeTranslator - SYSTEM_ROLE_TO_INSTRUCTION & Deduplication', ...)`:
   - Add an assertion in the `systemRoleToInstruction = true` test verifying that when a `user` message contains `tool_result` and `text`, `<system-context>` is placed **before** `functionResponse` (`parts[0].text` is `<system-context>...`, `parts[1].functionResponse` is defined, `parts[2].text` is normal text).
3. In `tests/claudeTranslator.test.ts` inside `describe('Claude Direct Mode Preprocessing & Headers', ...)`:
   - Update `maps model name, preserves -high suffix...` (around line 2186) so that by default (`config.systemRoleToInstruction === false`), `directRequest.messages` converts the inline `role: 'system'` message into `<system-reminder>` merged into `role: 'user'`:
     ```ts
     expect(directRequest.messages).toEqual([
       {
         role: 'user',
         content: [
           { type: 'text', text: '<system-reminder>\nInline system message stays as-is\n</system-reminder>' },
           { type: 'text', text: 'Hello world' }
         ]
       }
     ]);
     ```
   - Add a test verifying Direct Mode ordering with `tool_result` when `config.systemRoleToInstruction === false` (default):
     - Input user message has `[{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }, { type: 'text', text: 'user text' }]` and inline `{ role: 'system', content: 'reminder text' }`.
     - Expect `directRequest.messages` to be:
       ```ts
       [
         {
           role: 'user',
           content: [
             { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
             { type: 'text', text: '<system-reminder>\nreminder text\n</system-reminder>' },
             { type: 'text', text: 'user text' }
           ]
         }
       ]
       ```
   - Update the test for `config.systemRoleToInstruction = true` in Direct Mode to also include a `tool_result` block and verify `<system-context>` is placed **at the very front (before `tool_result`)**:
     ```ts
     [
       {
         role: 'user',
         content: [
           { type: 'text', text: '<system-context>\nSys 1\n</system-context>' },
           { type: 'tool_result', tool_use_id: 'toolu_1', content: 'tool out' },
           { type: 'text', text: 'User 1' }
         ]
       }
     ]
     ```

- [x] **Step 2: Run `npx jest tests/claudeTranslator.test.ts` to verify the updated tests fail**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: FAIL

- [x] **Step 3: Implement unified wrapping and `tool_result` ordering in `src/proxy/services/claudeTranslator.ts` and update i18n descriptions**

1. In `src/proxy/services/claudeTranslator.ts` inside `preprocessClaudeDirectRequest`:
   - Always run the inline `role: 'system'` conversion when `Array.isArray(directRequest.messages) && directRequest.messages.length > 0` (remove the `config.systemRoleToInstruction &&` guard).
   - Set `const tag = this.resolveInlineSystemTag();`.
   - In `flushUserSegment`:
     ```ts
     const flushUserSegment = () => {
       if (!pendingUserSegment) return;
       const { systemBlocks, userBlocks, rawUserMessages } = pendingUserSegment;
       if (systemBlocks.length === 0 && rawUserMessages.length === 1) {
         convertedMessages.push(rawUserMessages[0]);
       } else if (systemBlocks.length + userBlocks.length > 0) {
         let mergedContent: any[];
         if (config.systemRoleToInstruction) {
           mergedContent = [...systemBlocks, ...userBlocks];
         } else {
           const toolResultBlocks = userBlocks.filter(
             (b: any) => b && typeof b === 'object' && b.type === 'tool_result'
           );
           const normalUserBlocks = userBlocks.filter(
             (b: any) => !(b && typeof b === 'object' && b.type === 'tool_result')
           );
           mergedContent = [...toolResultBlocks, ...systemBlocks, ...normalUserBlocks];
         }
         convertedMessages.push({
           role: 'user',
           content: mergedContent
         });
       }
       pendingUserSegment = null;
     };
     ```
2. In `src/proxy/services/claudeTranslator.ts` inside `translateClaudeToGoogle`:
   - In `flushUserSegment`:
     ```ts
     const flushUserSegment = () => {
       if (!pendingUserSegment) return;
       let orderedParts: GeminiPart[];
       if (config.systemRoleToInstruction) {
         orderedParts = [
           ...pendingUserSegment.systemParts,
           ...pendingUserSegment.userParts
         ];
       } else {
         const toolResponseParts = pendingUserSegment.userParts.filter(
           (p: GeminiPart) => Boolean(p && p.functionResponse)
         );
         const normalUserParts = pendingUserSegment.userParts.filter(
           (p: GeminiPart) => !Boolean(p && p.functionResponse)
         );
         orderedParts = [
           ...toolResponseParts,
           ...pendingUserSegment.systemParts,
           ...normalUserParts
         ];
       }
       const combinedParts = sanitizeParts(orderedParts);
       if (combinedParts.length > 0) {
         contents.push({
           role: 'user',
           parts: combinedParts
         });
       }
       pendingUserSegment = null;
     };
     ```
3. In `frontend/src/i18n/locales/zh.ts` and `frontend/src/i18n/locales/en.ts`:
   - Update `systemRoleDesc` to match the spec copy.

- [x] **Step 4: Run full test suite and build**

Run: `npx jest --runInBand && npm run build`
Expected: All 120 test suites PASS and `npm run build` succeeds with 0 errors.

- [x] **Step 5: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/claudeTranslator.test.ts docs/superpowers/plans/2026-10-25-system-message-wrapping.md
git commit -m "feat(translator): place system-reminder after tool_result by default across both modes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
