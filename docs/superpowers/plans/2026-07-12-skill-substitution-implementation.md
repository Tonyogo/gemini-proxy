# Skill Tool Result Substitution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the lookahead Skill tool result substitution mapping in `src/services/claudeTranslator.ts`.

**Architecture:** Modifies the `translateClaudeToGoogle` messages array parser to intercept `tool_result` elements mapped to `"Skill"`. If followed by a `text` block containing updated instructions, the proxy replaces the tool response content with the text data and prunes the redundant text node.

**Tech Stack:** Node.js, TypeScript, Jest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (jest)
- **Framework:** Express.js
- **Statelessness:** Focuses entirely on pure translation logic within `claudeTranslator.ts`.

---

### Task 1: Create failing test cases for Skill tool result substitution

Write unit tests verifying that a `"Skill"` `tool_result` followed by a `"text"` block successfully substitute the text block content directly inside `functionResponse.response.content` and prune the redundant text part.

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Failing TDD test cases inside `tests/claudeTranslator.test.ts`.

- [ ] **Step 1: Open `tests/claudeTranslator.test.ts`**
Verify the file content.

- [ ] **Step 2: Append unit tests to `tests/claudeTranslator.test.ts`**
Add the following assertion as a new test case under the `Claude Tools Interaction Roundtrips (Complex and Multi-Turn)` block inside `tests/claudeTranslator.test.ts`:
```typescript
  it('substitutes Launching skill tool_result content with subsequent text content (based on log.json)', () => {
    // Simulated Skill invocation payload:
    // 1. Assistant message with a Skill tool_use block
    // 2. User message containing the Skill tool_result AND the massive instructions text block
    const claudePayload = {
      model: 'claude-sonnet-4.6',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_g_using_superpowers',
              name: 'Skill',
              input: { skill: 'superpowers:using-superpowers' }
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_g_using_superpowers',
              content: 'Launching skill: superpowers:using-superpowers'
            },
            {
              type: 'text',
              text: 'Base directory for this skill: /Users/yogo/... [Complete skill guide instructions here]'
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);

    // Verify 1: The conversation bubbles length (assistant model bubble + user tool response bubble) is 2
    expect(result.googleRequest.contents.length).toEqual(2);

    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');

    // Verify 2: Sibling text block is stripped and merged directly as the response content of the Skill function Response
    expect(userBubble.parts.length).toEqual(1); // Merged into 1 part!
    expect(userBubble.parts[0].functionResponse!.name).toEqual('Skill');
    expect(userBubble.parts[0].functionResponse!.response.content).toEqual(
      'Base directory for this skill: /Users/yogo/... [Complete skill guide instructions here]'
    );
  });
```

- [ ] **Step 3: Run the unit test to verify failure**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: FAIL due to missing substitution logic (resulting in 2 parts instead of 1, and unmodified placeholder content).

- [ ] **Step 4: Commit test suite**
```bash
git add tests/claudeTranslator.test.ts
git commit -m "test: add Skill tool_result lookahead substitution unit assertions"
```

---

### Task 2: Implement lookahead Skill tool result substitution

Implement the recursive index splicing and substitution checks inside `claudeTranslator.ts`.

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: Test specifications.
- Produces: Corrected, mapped tool responses for Skill calls.

- [ ] **Step 1: Open `src/services/claudeTranslator.ts`**
Locate the `translateClaudeToGoogle` method and find the `tool_result` parsing block.

- [ ] **Step 2: Add substitution logic inside the loop**
Replace the `tool_result` part mapping block (around lines 212-224) with:
```typescript
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              
              // SKILL SUBSTITUTION BUGFIX: If we detect the "Skill" tool output being returned,
              // check if it is followed by a text block containing the up-to-date Skill instructions.
              // If so, substitute the text block content directly as the function's return response content,
              // and skip emitting the redundant text block. This prevents Gemini from receiving confusing
              // "Launching skill..." placeholder responses followed by a massive disjoint text instruction.
              const isSkillTool = matchedName === 'Skill' || matchedName.endsWith(':Skill');
              const blockIndex = msg.content.indexOf(block);
              const nextBlock = msg.content[blockIndex + 1];
              
              if (isSkillTool && nextBlock && nextBlock.type === 'text') {
                parts.push({
                  functionResponse: {
                    name: matchedName,
                    response: { content: nextBlock.text } // Substitute text content as tool result!
                  }
                });
                // Remove the subsequent text block from content array so it is not processed in subsequent loop passes
                msg.content.splice(blockIndex + 1, 1);
              } else {
                parts.push({
                  functionResponse: {
                    name: matchedName,
                    response: { content: block.content }
                  }
                });
              }
            }
```

- [ ] **Step 3: Run the unit test to verify success**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: PASS.

- [ ] **Step 4: Run all test suites recursively to confirm absolute safety**
Run: `npm test`
Expected: ALL PASS (26/26 assertions).

- [ ] **Step 5: Run compiler verification**
Run: `npm run build`
Expected: Compilation completes with zero errors.

- [ ] **Step 6: Commit changes**
```bash
git add src/services/claudeTranslator.ts
git commit -m "fix: substitute Launching skill tool_result placeholder with subsequent instruction block to prevent Gemini empty responses"
```
