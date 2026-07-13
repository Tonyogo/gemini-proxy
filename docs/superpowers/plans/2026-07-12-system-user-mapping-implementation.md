# System-Role to User Wrapping Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the `messages` system-role conversion to rewrite `role: "system"` messages as `role: "user"` in conversational arrays, wrapped inside `<system-directive>...</system-directive>` tags.

**Architecture:** Refactors `translateClaudeToGoogle` inside `src/services/claudeTranslator.ts` to implement a hybrid pipeline: top-level `system` maps to the real `systemInstruction` block, while inline message `"system"` roles map to user-enclosed tag-wrapped string blocks.

**Tech Stack:** Node.js, TypeScript, Jest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (jest)
- **Framework:** Express.js
- **Statelessness:** Focuses entirely on pure translation logic within `claudeTranslator.ts`.

---

### Task 1: Create failing test cases for system-to-user wrapping

Modify `tests/claudeTranslator.test.ts` to implement strict assertions verifying the hybrid system prompt routing, role user rewriting, and tag wrappers.

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Failing TDD test cases inside `tests/claudeTranslator.test.ts`.

- [ ] **Step 1: Open `tests/claudeTranslator.test.ts`**
Verify current file content.

- [ ] **Step 2: Update `translates system prompts with role user and combines messages system roles` test**
Modify the existing assertions to verify:
1. Messages with `"role": "system"` are rewritten to `"role": "user"` inside Gemini `contents`.
2. The message text is wrapped in `<system-directive>\n` and `\n</system-directive>`.
3. The top-level `claudePayload.system` remains safely inside `systemInstruction` with no user XML wrappers.
```typescript
  it('translates system prompts with role user and combines messages system roles', () => {
    const claudePayload = {
      model: 'claude-sonnet-4.6',
      system: 'This is the main system prompt',
      messages: [
        { role: 'system', content: 'This is a message system prompt' },
        { role: 'user', content: 'Hello' }
      ]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);

    // Assert 1: systemInstruction role must be 'user' and only contain the base prompt
    expect(result.googleRequest.systemInstruction!.role).toEqual('user');
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual(
      'This is the main system prompt'
    );

    // Assert 2: The inline system message is converted to role 'user' and wrapped in tags
    expect(result.googleRequest.contents.length).toEqual(2);
    
    // First message (was role: system)
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual(
      '<system-directive>\nThis is a message system prompt\n</system-directive>'
    );

    // Second message (was role: user)
    expect(result.googleRequest.contents[1].role).toEqual('user');
    expect(result.googleRequest.contents[1].parts[0].text).toEqual('Hello');
  });
```

- [ ] **Step 3: Run the test to make sure it fails**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: FAIL due to missing tag wrappers and conversation length mismatch (since we previously filtered system roles out entirely).

- [ ] **Step 4: Commit tests**
```bash
git add tests/claudeTranslator.test.ts
git commit -m "test: add system-role to user tag wrapping assertions in translator tests"
```

---

### Task 2: Implement Hybrid system-role translation and XML tag encapsulation

Implement the XML wrapper and update the scanning loop in `claudeTranslator.ts` to output compliant user role arrays.

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: Test specifications.
- Produces: Corrected, translated payloads with mapped system messages.

- [ ] **Step 1: Open `src/services/claudeTranslator.ts`**
Locate the message-scanning block in the `translateClaudeToGoogle` method.

- [ ] **Step 2: Implement the helper and message loop refactoring**
In `translateClaudeToGoogle`, replace the `messages` array parsing loop (approx. lines 154-199):
```typescript
    const contents: GeminiContent[] = [];
    const toolIdToNameMap = new Map<string, string>();

    const wrapSystemMessageContent = (content: any): GeminiPart[] => {
      const parts: GeminiPart[] = [];
      if (typeof content === 'string') {
        parts.push({ text: `<system-directive>\n${content}\n</system-directive>` });
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            parts.push({ text: `<system-directive>\n${block.text}\n</system-directive>` });
          } else if (block.text) {
            parts.push({ text: `<system-directive>\n${block.text}\n</system-directive>` });
          } else {
            parts.push(block);
          }
        }
      }
      return parts;
    };

    if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
      for (const msg of claudeBody.messages) {
        if (msg.role === 'system') {
          // CLAUDE CODE CLI FIX: Map inline system roles to user role and wrap inside <system-directive> tags
          contents.push({
            role: 'user',
            parts: wrapSystemMessageContent(msg.content)
          });
          continue;
        }

        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: GeminiPart[] = [];

        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            } else if (block.type === 'tool_use') {
              toolIdToNameMap.set(block.id, block.name);
              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.input || {}
                }
              });
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              parts.push({
                functionResponse: {
                  name: matchedName,
                  response: { content: block.content }
                }
              });
            }
          }
        }
        contents.push({ role, parts });
      }
    }
```

- [ ] **Step 3: Run the unit test to verify success**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: PASS.

- [ ] **Step 4: Run all test suites recursively to confirm absolute safety**
Run: `npm test`
Expected: ALL PASS (25/25 assertions).

- [ ] **Step 5: Run compiler verification**
Run: `npm run build`
Expected: Compilation completes with zero errors.

- [ ] **Step 6: Commit changes**
```bash
git add src/services/claudeTranslator.ts
git commit -m "fix: translate messages system roles to tag-wrapped user blocks to preserve chronological turn order"
```
