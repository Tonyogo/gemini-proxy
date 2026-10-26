# Message History Slimming (Historical Thinking Cleanup) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip `thinking` and `redacted_thinking` blocks (including `signature`) from historical `assistant` messages prior to the last real human turn (`lastHumanIndex`) while strictly preserving them in the active tool-call loop (`index > lastHumanIndex`), across both Direct and Gemini translation pipelines.

**Architecture:** Add typed content block definitions (`ClaudeThinkingBlock`, `ClaudeRedactedThinkingBlock`, `ClaudeContentBlock`, and `GeminiPart.thought`) in `src/types/index.ts`. Implement `findLastHumanTurnIndex` and `slimHistoricalMessages` on `ClaudeTranslator` in `src/proxy/services/claudeTranslator.ts`, wire `slimHistoricalMessages` into both `preprocessClaudeDirectRequest` and `translateClaudeToGoogle`, and map retained active-turn `thinking` blocks to Gemini `thought: true` parts.

**Tech Stack:** TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-10-26-message-history-slimming-design.md`

## Global Constraints

- Never mutate the caller's input `claudeBody` or `messages` array/objects in place; always operate on deep-cloned copies.
- A `role === 'user'` message is a real human turn (`lastHumanIndex`) if and only if `typeof content === 'string'` OR `Array.isArray(content)` with at least one element where `typeof block === 'string' || (block && typeof block === 'object' && block.type !== 'tool_result')`.
- For `index < lastHumanIndex`, remove all `type === 'thinking'` and `type === 'redacted_thinking'` blocks from `role === 'assistant'` array content; if the filtered `content` array becomes empty (`[]`), replace it with `[{ type: 'text', text: '...' }]`.
- For `index > lastHumanIndex`, preserve all `thinking` and `redacted_thinking` blocks and their `signature` untouched.

## Review Focus

- A `user` message whose `content` is an empty array `[]` or contains only `{ type: 'tool_result', ... }` blocks must NOT be treated as `lastHumanIndex`; backwards search must continue to earlier messages.
- A `user` message containing both `{ type: 'tool_result', ... }` and `{ type: 'text', text: '...' }` (or `type: 'image'` / `type: 'document'`) IS a real human turn and must be selected as `lastHumanIndex`.
- When all `user` messages in `messages` contain only `tool_result` blocks (`lastHumanIndex === -1`) or when `lastHumanIndex === 0`, no `assistant` message has `index < lastHumanIndex`, so every `assistant` message's `thinking` blocks must remain intact.
- An `assistant` message at `index < lastHumanIndex` that contains ONLY `thinking` and/or `redacted_thinking` blocks must not be left with `content: []`; it must receive the fallback `[{ type: 'text', text: '...' }]` so neither Claude Direct upstream nor Gemini `contents` receives an empty message turn.
- In `translateClaudeToGoogle`, `sanitizeParts` strips parts where `part.text === ''`; if an active-turn (`index > lastHumanIndex`) `thinking` block has `thinking: ''` but a valid `signature`, `sanitizeParts` must not drop that `thought: true` part.

---

### Task 1: Add Content Block & Thought Part Types in `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts:1-45`

**Interfaces:**
- Produces in `src/types/index.ts`:
  ```ts
  export interface ClaudeTextBlock {
    type: 'text';
    text: string;
    [key: string]: any;
  }

  export interface ClaudeThinkingBlock {
    type: 'thinking';
    thinking: string;
    signature?: string;
    [key: string]: any;
  }

  export interface ClaudeRedactedThinkingBlock {
    type: 'redacted_thinking';
    data: string;
    [key: string]: any;
  }

  export interface ClaudeToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
    [key: string]: any;
  }

  export interface ClaudeToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content?: string | any[];
    is_error?: boolean;
    [key: string]: any;
  }

  export type ClaudeContentBlock =
    | ClaudeTextBlock
    | ClaudeThinkingBlock
    | ClaudeRedactedThinkingBlock
    | ClaudeToolUseBlock
    | ClaudeToolResultBlock
    | Record<string, any>;

  export interface ClaudeMessage {
    role: 'user' | 'assistant' | 'system';
    content: string | ClaudeContentBlock[];
  }

  export interface GeminiPart {
    text?: string;
    thought?: boolean;
    inlineData?: { mimeType: string; data: string };
    functionCall?: { name: string; args: Record<string, any>; id?: string };
    functionResponse?: { name: string; response: any; id?: string; parts?: GeminiPart[] };
    thoughtSignature?: string;
  }
  ```

- [x] **Step 1: Update `src/types/index.ts` with `ClaudeContentBlock` union types and `GeminiPart.thought`**

Add `ClaudeTextBlock`, `ClaudeThinkingBlock`, `ClaudeRedactedThinkingBlock`, `ClaudeToolUseBlock`, `ClaudeToolResultBlock`, `ClaudeContentBlock`, update `ClaudeMessage.content`, and add `thought?: boolean` to `GeminiPart`.

- [x] **Step 2: Run TypeScript build check to verify type compatibility**

Run: `npm run build:backend`
Expected: PASS with 0 errors.

---

### Task 2: Implement `findLastHumanTurnIndex` & `slimHistoricalMessages` and Wire into Direct & Gemini Pipelines

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts:1-15,138-145,640-660,755-840`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes `ClaudeMessage`, `ClaudeContentBlock`, `GeminiPart` from `src/types/index.ts`.
- Produces on `ClaudeTranslator` in `src/proxy/services/claudeTranslator.ts`:
  ```ts
  public findLastHumanTurnIndex(messages: ClaudeMessage[]): number
  public slimHistoricalMessages(messages: ClaudeMessage[]): ClaudeMessage[]
  ```

- [x] **Step 1: Write failing unit tests in `tests/claudeTranslator.test.ts`**

Add a `describe('ClaudeTranslator - Historical Thinking Blocks Slimming', ...)` suite at the end of `tests/claudeTranslator.test.ts` testing:
1. `findLastHumanTurnIndex`:
   - returns the last `user` index when `content` is a plain string;
   - skips trailing `user` messages whose `content` array contains only `tool_result` blocks (or is `[]`) and returns the earlier `user` message that has a `text` or `image` block;
   - selects a `user` message that mixes `tool_result` and `text`/`image` blocks;
   - returns `-1` when all `user` messages are pure `tool_result` or `messages` has no `user` messages.
2. `slimHistoricalMessages`:
   - removes `thinking` and `redacted_thinking` blocks (and `signature`) from `assistant` messages at `index < lastHumanIndex` while keeping `text` and `tool_use` blocks;
   - replaces `content` with `[{ type: 'text', text: '...' }]` when a historical `assistant` message had only `thinking` / `redacted_thinking` blocks;
   - preserves `thinking` and `redacted_thinking` blocks (and `signature`) in `assistant` messages at `index > lastHumanIndex`;
   - preserves all `thinking` blocks when `lastHumanIndex === -1` or `lastHumanIndex === 0`;
   - does not mutate the original input `messages` array or nested message objects.
3. Pipeline integration in `preprocessClaudeDirectRequest` and `translateClaudeToGoogle`:
   - in Direct mode (`preprocessClaudeDirectRequest`), strips historical `thinking` / `redacted_thinking` blocks (`index < lastHumanIndex`), fills `[{ type: 'text', text: '...' }]` on empty historical assistant content, and preserves active-loop (`index > lastHumanIndex`) `thinking` blocks and `signature` without mutating `claudeBody`;
   - in Gemini mode (`translateClaudeToGoogle`), strips historical `thinking` blocks (`index < lastHumanIndex`), converts empty historical assistant content to `{ role: 'model', parts: [{ text: '...' }] }`, and maps active-loop (`index > lastHumanIndex`) `thinking` blocks to `{ thought: true, text: '...', thoughtSignature: '...' }` (including when `thinking` text is `''` with a non-empty `signature`).

- [x] **Step 2: Run Jest to verify the new tests fail**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: FAIL (`translator.findLastHumanTurnIndex is not a function` / `translator.slimHistoricalMessages is not a function`).

- [x] **Step 3: Implement `findLastHumanTurnIndex`, `slimHistoricalMessages`, and pipeline wiring in `src/proxy/services/claudeTranslator.ts`**

1. Implement `public findLastHumanTurnIndex(messages: ClaudeMessage[]): number`:
   ```ts
   public findLastHumanTurnIndex(messages: ClaudeMessage[]): number {
     if (!Array.isArray(messages) || messages.length === 0) {
       return -1;
     }
     for (let i = messages.length - 1; i >= 0; i--) {
       const msg = messages[i];
       if (!msg || msg.role !== 'user') continue;
       if (typeof msg.content === 'string') {
         return i;
       }
       if (Array.isArray(msg.content)) {
         const hasNonToolResult = msg.content.some(
           (block: any) =>
             typeof block === 'string' ||
             (block && typeof block === 'object' && block.type !== 'tool_result')
         );
         if (hasNonToolResult) {
           return i;
         }
       }
     }
     return -1;
   }
   ```
2. Implement `public slimHistoricalMessages(messages: ClaudeMessage[]): ClaudeMessage[]`:
   ```ts
   public slimHistoricalMessages(messages: ClaudeMessage[]): ClaudeMessage[] {
     if (!Array.isArray(messages) || messages.length === 0) {
       return [];
     }
     const clonedMessages: ClaudeMessage[] = JSON.parse(JSON.stringify(messages));
     const lastHumanIndex = this.findLastHumanTurnIndex(clonedMessages);
     if (lastHumanIndex <= 0) {
       return clonedMessages;
     }

     return clonedMessages.map((msg, index) => {
       if (!msg || index >= lastHumanIndex || msg.role !== 'assistant' || !Array.isArray(msg.content)) {
         return msg;
       }
       const filteredContent = msg.content.filter(
         (block: any) =>
           !(block && typeof block === 'object' && (block.type === 'thinking' || block.type === 'redacted_thinking'))
       );
       return {
         ...msg,
         content: filteredContent.length > 0 ? filteredContent : [{ type: 'text', text: '...' }]
       };
     });
   }
   ```
3. In `preprocessClaudeDirectRequest`:
   After `directRequest.messages = this.filterEphemeralMessages(directRequest.messages);`, call:
   ```ts
   directRequest.messages = this.slimHistoricalMessages(directRequest.messages);
   ```
4. In `translateClaudeToGoogle`:
   - Update `inputMessages` initialization:
     ```ts
     const inputMessages = claudeBody.messages && Array.isArray(claudeBody.messages)
       ? this.slimHistoricalMessages(this.filterEphemeralMessages(claudeBody.messages))
       : [];
     ```
   - In `sanitizeParts`, keep parts that have `part.thought` or `part.thoughtSignature`:
     ```ts
     if (
       part.text !== undefined &&
       part.text === '' &&
       !part.thought &&
       !part.thoughtSignature &&
       !part.functionCall &&
       !part.functionResponse &&
       !part.inlineData
     ) {
       continue;
     }
     ```
   - In `parseUserMessageParts`, handle `block.type === 'thinking'`:
     ```ts
     } else if (block.type === 'thinking') {
       const thinkingText = typeof block.thinking === 'string' ? block.thinking : '';
       const signature = typeof block.signature === 'string' && block.signature !== '' ? block.signature : undefined;
       if (thinkingText !== '' || signature) {
         const thoughtPart: GeminiPart = {
           thought: true,
           text: thinkingText
         };
         if (signature) {
           thoughtPart.thoughtSignature = signature;
         }
         parts.push(thoughtPart);
       }
     }
     ```

- [x] **Step 4: Run `npx jest tests/claudeTranslator.test.ts` and full test suite + build**

Run: `npx jest tests/claudeTranslator.test.ts && npm run build`
Expected: PASS all tests and build cleanly.

- [x] **Step 5: Commit**

```bash
git add src/types/index.ts src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts docs/superpowers/specs/2026-10-26-message-history-slimming-design.md docs/superpowers/plans/2026-10-26-message-history-slimming.md
git commit -m "feat(claude): slim historical thinking blocks prior to last human turn

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
