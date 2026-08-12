# System Instruction Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder `systemInstruction` construction in `claudeTranslator.ts` so that Claude's original system prompt (`claudeBody.system`) comes first, followed by Adapter Prompt (`CUSTOM_SYSTEM_INSTRUCTION`), and then `role: 'system'` runtime-context messages separated by double newlines without tags/notice prefix when `systemRoleToInstruction = true`.

**Architecture:** Update `translateClaudeToGoogle` in `src/services/claudeTranslator.ts` to evaluate `claudeBody.system` before `config.customSystemInstruction`. Add unit tests in `tests/claudeTranslator.test.ts` to assert exact ordering.

**Tech Stack:** TypeScript, Node.js, Jest

## Global Constraints

- Preserve clean, stateless proxy translation logic in `src/services/claudeTranslator.ts`.
- Maintain strict TypeScript type safety.
- Access `config` dynamically without caching properties at module scope.

---

### Task 1: Reorder System Instruction Construction in Translator and Update Tests

**Files:**
- Modify: `src/services/claudeTranslator.ts`
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `config.customSystemInstruction`, `claudeBody.system`, `config.systemRoleToInstruction`
- Produces: Gemini request `systemInstruction` with parts in order: Claude original system -> Adapter Prompt -> system messages (separated by double newlines, no tags/notice)

- [ ] **Step 1: Write failing tests in `tests/claudeTranslator.test.ts`**

Add unit tests verifying exact ordering and format when `customSystemInstruction`, `claudeBody.system`, and `systemRoleToInstruction` are set.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts`

- [ ] **Step 3: Update `src/services/claudeTranslator.ts` implementation**

Ensure code matches:
1. `claudeBody.system`
2. `config.customSystemInstruction`
3. `config.systemRoleToInstruction` with direct system content appending.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS across all test files.

- [ ] **Step 6: Commit changes**

```bash
git add src/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): reorder systemInstruction construction (system -> customSystem -> systemRoleToInstruction)"
```
