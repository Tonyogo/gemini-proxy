# SystemInstruction Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct `systemInstruction` format translation and implement a robust extraction pipeline to filter and append system-role messages inside `src/services/claudeTranslator.js`.

**Architecture:** Adds an `appendSystemContent` recursive assembler, formats the instruction REST target as `{ parts: [{ text }], role: "user" }`, and strips any `role: "system"` records from downstream chat conversation payload arrays.

**Tech Stack:** Node.js, Jest, Supertest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (express, jest)
- **Framework:** Express.js
- **Statelessness:** Modifies pure translation helper math in `claudeTranslator.js`.

---

### Task 1: Create failing test cases for systemInstruction logic

Add comprehensive unit tests verifying valid role specification formatting, proper filtering and removal of conversational `"system"` roles, and newline-separated aggregation.

**Files:**
- Modify: `tests/claudeTranslator.test.js`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Failing TDD test cases inside `tests/claudeTranslator.test.js`.

- [ ] **Step 1: Read the existing `tests/claudeTranslator.test.js`**
We will add new tests to verify:
1. `systemInstruction` returns `role: "user"` in the final payload structure.
2. Direct inline `"system"` role messages inside `messages` list are extracted to `systemInstruction` and omitted from `googleRequest.contents`.
3. Multiple system prompts (top level + list) are concatenated with `\n`.

- [ ] **Step 2: Append the failing tests to `tests/claudeTranslator.test.js`**
Append these assertions under the first `describe` block in `tests/claudeTranslator.test.js`:
```javascript
  it('translates system prompts with role user and combines messages system roles', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      system: 'This is the main system prompt',
      messages: [
        { role: 'system', content: 'This is a message system prompt' },
        { role: 'user', content: 'Hello' }
      ]
    };
    const result = translator.translateClaudeToGoogle(claudePayload);
    
    // Assert 1: systemInstruction role must be 'user'
    expect(result.googleRequest.systemInstruction.role).toEqual('user');
    
    // Assert 2: Both system prompts are combined with a newline
    expect(result.googleRequest.systemInstruction.parts[0].text).toEqual(
      'This is the main system prompt\nThis is a message system prompt'
    );
    
    // Assert 3: System messages must be filtered OUT of conversational contents
    expect(result.googleRequest.contents.length).toEqual(1);
    expect(result.googleRequest.contents[0].role).toEqual('user');
    expect(result.googleRequest.contents[0].parts[0].text).toEqual('Hello');
  });
```

- [ ] **Step 3: Run the test to make sure they fail**
Run: `npm test tests/claudeTranslator.test.js`
Expected: FAIL due to missing `role: "user"` or conversation flow system message pollution.

- [ ] **Step 4: Commit tests**
```bash
git add tests/claudeTranslator.test.js
git commit -m "test: add systemInstruction aggregation and filter rules tests"
```

---

### Task 2: Implement systemInstruction formatting and conversation extraction pipeline

Implement the `appendSystemContent` helper, format output role structures, and filter out system messages from conversation content buffers.

**Files:**
- Modify: `src/services/claudeTranslator.js`

**Interfaces:**
- Consumes: Test specifications verifying input assertions.
- Produces: Corrected payload structures returned by `translateClaudeToGoogle`.

- [ ] **Step 1: Read the existing `src/services/claudeTranslator.js`**
Locate the start of the `translateClaudeToGoogle` function.

- [ ] **Step 2: Refactor the system-prompt mapping and message scanning blocks**
Replace lines 9-23 in `src/services/claudeTranslator.js` (including system definition and message loops):
```javascript
    let systemInstruction = null;

    const appendSystemContent = (content) => {
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .map(block => {
            if (typeof block === "string") return block;
            if (block && block.type === "text") return block.text || "";
            return block?.text || "";
          })
          .filter(Boolean)
          .join("\n");
      }

      if (!text) return;

      if (systemInstruction) {
        systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n${text}`;
      } else {
        systemInstruction = {
          parts: [{ text }],
          role: "user" // REQUIRED: Google Studio REST API requires "role": "user" for systemInstruction
        };
      }
    };

    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }

    const contents = [];
    const toolIdToNameMap = new Map();

    if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
      for (const msg of claudeBody.messages) {
        // Filter out and append any messages with role === 'system'
        if (msg.role === 'system') {
          appendSystemContent(msg.content);
          continue;
        }

        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts = [];

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

- [ ] **Step 3: Run the unit test suite to verify passing**
Run: `npm test tests/claudeTranslator.test.js`
Expected: PASS

- [ ] **Step 4: Run all test suites recursively to confirm absolute safety**
Run: `npm test`
Expected: ALL PASS (19/19 assertions)

- [ ] **Step 5: Commit changes**
```bash
git add src/services/claudeTranslator.js
git commit -m "feat: correct Gemini systemInstruction structure and conversation extraction pipeline"
```
