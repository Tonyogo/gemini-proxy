# System Message Prioritization in Merged User Turns Design

**Date:** 2026-08-26  
**Status:** Approved

## 1. Problem Statement
When translating Anthropic Claude Messages API requests to Google Gemini format with `config.systemRoleToInstruction = false` (default), messages with `role: 'system'` inside `claudeBody.messages` are converted to `role: 'user'` and wrapped in context tags (`<runtime-context>...</runtime-context>`).

Because Gemini enforces strict alternating `user`/`model` turns, adjacent user-role turns are merged into a single `GeminiContent` turn. When a client sends messages in the sequence `[user, system]` or interleaved within the same turn, the system context parts should appear **before** the user prompt parts in the resulting Gemini turn payload, so that upstream Gemini models observe the runtime context instructions prior to the user query/command.

## 2. Design & Architecture

### 2.1 Chunk Segmentation & Ordering
During translation in `ClaudeTranslator.translateClaudeToGoogle`:
1. Partition `inputMessages` into chunks delimited by `assistant` turns:
   - When encountering an `assistant` message, finalize any active user/system chunk and process the `assistant` message as `role: 'model'`.
   - When encountering consecutive `user` and `system` messages, collect them into an active user-turn segment.
2. For each user-turn segment:
   - **System Messages First:** If `config.systemRoleToInstruction` is `false`, process all `system` messages in the segment first (in their original relative order), wrapping their content with `<runtime-context>` tags into `GeminiPart[]`.
   - **User Messages Second:** Process all `user` messages in the segment (in their original relative order), translating text, media, tool use, and tool results into `GeminiPart[]`.
   - **Combine:** Construct a single `GeminiContent` with `role: 'user'` and `parts: [...systemParts, ...userParts]`.
   - If the combined parts array is empty (e.g. all system messages routed to global `systemInstruction` and no user messages), omit the empty turn.

### 2.2 Behavior when `systemRoleToInstruction: true`
When `config.systemRoleToInstruction` is `true`:
- System messages are deduplicated and routed globally to `systemInstruction`.
- System messages inside segments contribute no inline parts. Only `user` messages produce parts for the turn.

## 3. Edge Cases
- **Single `system` message turn:** Emits `role: 'user'` containing the wrapped system message parts.
- **Single `user` message turn:** Emits `role: 'user'` containing the user parts.
- **`[user, system]` turn:** Emits `role: 'user'` with `[systemParts, userParts]`.
- **`[system, user]` turn:** Emits `role: 'user'` with `[systemParts, userParts]`.
- **Interleaved `[user1, system1, user2, system2]`:** Emits `role: 'user'` with `[sys1Parts, sys2Parts, user1Parts, user2Parts]`.
- **`[tool_result, system]`:** System parts precede `tool_result` (`functionResponse`) parts in the merged turn.

## 4. Testing Plan
- Add comprehensive test cases in `tests/claudeTranslator.test.ts`:
  1. `[user, system]` input translated to single `user` turn with system parts placed before user parts.
  2. Interleaved `[user1, system1, user2, system2]` stably partitioned to `[sys1, sys2, user1, user2]`.
  3. `[tool_result, system]` placing system message parts before `functionResponse`.
- Verify existing tests passing: `npm test`.
