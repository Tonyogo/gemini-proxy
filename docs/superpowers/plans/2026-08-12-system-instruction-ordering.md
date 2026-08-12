# System Instruction Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder `systemInstruction` construction in `claudeTranslator.ts` so that Adapter Prompt (`CUSTOM_SYSTEM_INSTRUCTION`) comes first, followed by Claude's original system prompt (`claudeBody.system`), and then `role: 'system'` runtime-context messages when `systemRoleToInstruction = true`.

**Architecture:** Update `translateClaudeToGoogle` in `src/services/claudeTranslator.ts` to evaluate `config.customSystemInstruction` before `claudeBody.system`. Add unit tests in `tests/claudeTranslator.test.ts` to assert exact ordering.

**Tech Stack:** TypeScript, Node.js, Jest

## Global Constraints

- Preserve clean, stateless proxy translation logic in `src/services/claudeTranslator.ts`.
- Maintain strict TypeScript type safety.
- Access `config` dynamically without caching properties at module scope.

---

### Task 1: Reorder System Instruction Construction in Translator and Update Tests

**Files:**
- Modify: `src/services/claudeTranslator.ts:219-260`
- Modify: `tests/claudeTranslator.test.ts:507-571`

**Interfaces:**
- Consumes: `config.customSystemInstruction`, `claudeBody.system`, `config.systemRoleToInstruction`
- Produces: Gemini request `systemInstruction` with parts in order: Adapter Prompt -> Claude original system -> `<runtime-context>` messages

- [ ] **Step 1: Write failing tests in `tests/claudeTranslator.test.ts`**

Add unit tests verifying exact ordering when `customSystemInstruction`, `claudeBody.system`, and `systemRoleToInstruction` are set.

In `tests/claudeTranslator.test.ts`, update the `describe('ClaudeTranslator - SYSTEM_ROLE_TO_INSTRUCTION & Deduplication', ...)` block to include a test checking relative positions:

```typescript
  it('constructs systemInstruction in correct order: customSystemInstruction -> claudeBody.system -> systemRoleToInstruction msgs', () => {
    config.systemRoleToInstruction = true;
    config.customSystemInstruction = 'Adapter Prompt Content';

    const claudePayload: any = {
      model: 'gemini-3.5-flash',
      system: 'Claude Original System Content',
      messages: [
        {
          role: 'system',
          content: '# runtimeContext\nRuntime Context Content'
        },
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    };

    const result = translator.translateClaudeToGoogle(claudePayload);
    const systemText = result.googleRequest.systemInstruction!.parts[0].text;

    const idxCustom = systemText.indexOf('Adapter Prompt Content');
    const idxOriginal = systemText.indexOf('Claude Original System Content');
    const idxNotice = systemText.indexOf('Note: Content enclosed within <runtime-context> tags');
    const idxRuntime = systemText.indexOf('Runtime Context Content');

    expect(idxCustom).toBeGreaterThan(-1);
    expect(idxOriginal).toBeGreaterThan(-1);
    expect(idxNotice).toBeGreaterThan(-1);
    expect(idxRuntime).toBeGreaterThan(-1);

    expect(idxCustom).toBeLessThan(idxOriginal);
    expect(idxOriginal).toBeLessThan(idxNotice);
    expect(idxNotice).toBeLessThan(idxRuntime);

    // Clean up
    config.customSystemInstruction = undefined;
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "constructs systemInstruction in correct order"`
Expected: FAIL due to `idxCustom` appearing after `idxOriginal` in current implementation.

- [ ] **Step 3: Update `src/services/claudeTranslator.ts` implementation**

In `src/services/claudeTranslator.ts`, update `translateClaudeToGoogle` lines 219-226:

Change:
```typescript
    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }

    if (config.customSystemInstruction) {
      appendSystemContent(config.customSystemInstruction);
    }
```

To:
```typescript
    if (config.customSystemInstruction) {
      appendSystemContent(config.customSystemInstruction);
    }

    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS (all tests in `tests/claudeTranslator.test.ts` pass).

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS across all test files.

- [ ] **Step 6: Commit changes**

```bash
git add src/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): reorder systemInstruction construction (customSystem -> system -> systemRoleToInstruction)"
```
