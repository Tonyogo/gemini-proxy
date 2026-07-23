# Design Spec: Remove `isSkillTool` Special Splicing Logic

**Date:** 2026-07-23  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In `ClaudeTranslator`, there is special handling logic labeled `isSkillTool`. This logic looks ahead at the next block when translating a `Skill` (or similar) `tool_result`, replaces the tool result content with the subsequent `text` block, and mutates the message array by splicing out that sibling text block.

While this was introduced to address specific empty-response issues with Claude Code CLI, it introduces several architectural concerns:
1. **Side-effects / Mutation**: Mutating the input payload array (`msg.content.splice`) during translation violates statelessness and can lead to bugs if the client reuse requests.
2. **Leaky Abstraction**: Hardcoding check rules for specific, external tools (`'Skill'`) couples the generic API proxy to specific client-side plugin behaviors.
3. **Robustness Issues**: Splicing based on indices can be unreliable in edge cases with identical duplicate tool result blocks.

The objective is to directly **remove the `isSkillTool` special handling logic**, replace it with a noteworthy comment/warning explaining the history, and skip the corresponding unit test.

## 2. Component & Code Changes

### 2.1 Code modification in `src/services/claudeTranslator.ts`

Remove variables:
- `isSkillTool`
- `blockIndex`
- `nextBlock`

Remove conditional mutation:
```typescript
if (isSkillTool && nextBlock && nextBlock.type === 'text') {
  logger.info(`[Translator] [Skill Substitution] ...`);
  resultText = nextBlock.text;
  msg.content.splice(blockIndex + 1, 1);
}
```

Add an explanatory note directly above `resultText` assignment outlining the multi-turn context requirements.

### 2.2 Test modification in `tests/claudeTranslator.test.ts`
Mark the corresponding skill substitution test with `it.skip` so that it remains in the codebase as a historical documentation of the behavior but is no longer executed during active testing.

```typescript
it.skip('substitutes Launching skill tool_result content with subsequent text content (based on log.json)', () => { ... });
```

## 3. Testing Strategy
* Run `npm test` or `npx jest --runInBand` to verify all remaining 20 tests in `claudeTranslator.test.ts` pass successfully.
