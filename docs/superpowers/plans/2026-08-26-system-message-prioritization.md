# System Message Prioritization in Merged User Turns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure messages with `role: 'system'` inside Claude's `messages` array are placed before `role: 'user'` messages when merged into single Gemini `user` turns during translation.

**Architecture:** Refactor `ClaudeTranslator.translateClaudeToGoogle` to segment input messages by `assistant` turns. For each contiguous `user`/`system` block, process all `system` messages first (wrapped in `<runtime-context>` tags), followed by all `user` messages, assembling them into a single `role: 'user'` content block with system parts preceding user parts.

**Tech Stack:** TypeScript, Node.js, Jest, Express.

## Global Constraints

- Preserve `config.systemRoleToInstruction` behavior: when `true`, system messages route to global `systemInstruction` and are omitted from inline user turn parts.
- Preserve relative ordering among system messages and among user messages.
- Preserve `tool_result` and media translation semantics inside user turns.
- Keep `ClaudeTranslator` stateless with zero cached configuration.

---

### Task 1: Add Unit Tests for System Message Prioritization

**Files:**
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `ClaudeTranslator.translateClaudeToGoogle(claudePayload: any)`
- Produces: Test assertions for `[user, system]`, interleaved `[user1, system1, user2, system2]`, and `[tool_result, system]`.

- [ ] **Step 1: Write the failing tests in `tests/claudeTranslator.test.ts`**

Add the following test suite to `tests/claudeTranslator.test.ts`:

```typescript
  it('translates [user, system] sequence placing system message parts before user parts', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'Hello user prompt' },
        { role: 'system', content: 'Contextual system instruction' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.length).toEqual(2);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<runtime-context>\nContextual system instruction\n</runtime-context>'
    );
    expect(result.googleRequest.contents[0].parts[1].text).toEqual('Hello user prompt');
  });

  it('translates interleaved user and system messages preserving stable relative order with system first', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'User 1' },
        { role: 'system', content: 'System 1' },
        { role: 'user', content: 'User 2' },
        { role: 'system', content: 'System 2' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.map((p: any) => p.text)).toEqual([
      '<runtime-context>\nSystem 1\n</runtime-context>',
      '<runtime-context>\nSystem 2\n</runtime-context>',
      'User 1',
      'User 2'
    ]);
  });

  it('translates tool_result with system message placing system message first', () => {
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
            }
          ]
        },
        { role: 'system', content: 'Instruction after tool' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts.length).toEqual(2);
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<runtime-context>\nInstruction after tool\n</runtime-context>'
    );
    expect(result.googleRequest.contents[0].parts[1].functionResponse).toBeDefined();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx jest tests/claudeTranslator.test.ts -t "placing system message parts before user parts"`
Expected: FAIL (because system message parts are currently appended after user parts when received as `[user, system]`).

- [ ] **Step 3: Commit test cases**

```bash
git add tests/claudeTranslator.test.ts
git commit -m "test: add tests for system message prioritization before user parts"
```

---

### Task 2: Implement User/System Chunk Segmentation and System Prepending

**Files:**
- Modify: `src/services/claudeTranslator.ts:374-486`

**Interfaces:**
- Consumes: `inputMessages`, `wrapSystemMessageContent`, `config.systemRoleToInstruction`
- Produces: `googleRequest.contents` with system parts placed before user parts in merged user turns.

- [ ] **Step 1: Update `translateClaudeToGoogle` in `src/services/claudeTranslator.ts`**

Refactor the loop that constructs `contents` in `src/services/claudeTranslator.ts`:
Extract helper or internal loop logic to process messages by turn segment:

```typescript
    const contents: GeminiContent[] = [];
    const toolIdToNameMap = new Map<string, string>();

    const parseUserMessageParts = (msg: any): GeminiPart[] => {
      const parts: GeminiPart[] = [];
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image' || block.type === 'document') {
            const mediaPart = this._extractMediaPart(block);
            if (mediaPart) {
              parts.push(mediaPart);
            }
          } else if (block.type === 'tool_use') {
            toolIdToNameMap.set(block.id, block.name);
            const geminiCallId = block.id.startsWith('toolu_g_') ? block.id.substring(8) : block.id;
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input || {},
                id: geminiCallId
              },
              thoughtSignature: BYPASS_SIGNATURE
            });
          } else if (block.type === 'tool_result') {
            const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
            const geminiResponseId = block.tool_use_id && block.tool_use_id.startsWith('toolu_g_') ? block.tool_use_id.substring(8) : block.tool_use_id;

            let resultText: any = block.content;
            const imageParts: any[] = [];

            if (Array.isArray(block.content)) {
              const textCollector: string[] = [];
              for (const item of block.content) {
                if (typeof item === 'string') {
                  textCollector.push(item);
                } else if (item && item.type === 'text') {
                  if (item.text) textCollector.push(item.text);
                } else {
                  const mediaPart = this._extractMediaPart(item);
                  if (mediaPart) {
                    imageParts.push(mediaPart);
                  }
                }
              }
              resultText = textCollector.join('\n');
            }

            const functionResponseObj: any = {
              name: matchedName,
              response: { result: resultText },
              id: geminiResponseId
            };

            if (imageParts.length > 0) {
              functionResponseObj.parts = imageParts;
            }

            parts.push({
              functionResponse: functionResponseObj
            });
          }
        }
      }
      return parts;
    };

    if (inputMessages.length > 0) {
      let pendingUserSegment: { systemParts: GeminiPart[]; userParts: GeminiPart[] } | null = null;

      const flushUserSegment = () => {
        if (!pendingUserSegment) return;
        const combinedParts = [...pendingUserSegment.systemParts, ...pendingUserSegment.userParts];
        if (combinedParts.length > 0) {
          contents.push({
            role: 'user',
            parts: combinedParts
          });
        }
        pendingUserSegment = null;
      };

      for (const msg of inputMessages) {
        if (msg.role === 'assistant') {
          flushUserSegment();
          contents.push({
            role: 'model',
            parts: parseUserMessageParts(msg)
          });
        } else if (msg.role === 'system') {
          if (config.systemRoleToInstruction) {
            continue;
          }
          if (!pendingUserSegment) {
            pendingUserSegment = { systemParts: [], userParts: [] };
          }
          pendingUserSegment.systemParts.push(...wrapSystemMessageContent(msg.content));
        } else {
          // role === 'user' (or any other non-assistant role)
          if (!pendingUserSegment) {
            pendingUserSegment = { systemParts: [], userParts: [] };
          }
          pendingUserSegment.userParts.push(...parseUserMessageParts(msg));
        }
      }
      flushUserSegment();
    }
```

- [ ] **Step 2: Run all translator tests to verify passes**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS for all tests including existing and new tests.

- [ ] **Step 3: Commit implementation**

```bash
git add src/services/claudeTranslator.ts
git commit -m "feat(translator): place system message parts before user parts in merged user turns"
```

---

### Task 3: Full Regression Verification

**Files:**
- Test: All suites under `tests/`

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests PASS across the entire project.

- [ ] **Step 2: Build verification**

Run: `npm run build`
Expected: Clean build with zero TypeScript or Vite errors.
