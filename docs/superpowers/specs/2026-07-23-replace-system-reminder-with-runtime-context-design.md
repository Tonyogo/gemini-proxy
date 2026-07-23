# Design Spec: Replace `<system-reminder>` with `<runtime-context>`

**Date:** 2026-07-23  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

In `ClaudeTranslator`, inline system messages (such as system instructions injected dynamically by client-side workflows like Claude Code CLI) are mapped to user-role content and wrapped with special tags. Historically, the `<system-reminder>` tag was used.

To make the terminology more precise and align with current standards, this design specification covers replacing all `<system-reminder>` tag wrappers with `<runtime-context>` across translation logic and corresponding unit tests.

## 2. Detailed Changes

### 2.1 Code modification in `src/services/claudeTranslator.ts`
Update the `wrapSystemMessageContent` method to wrap lines in `<runtime-context>` instead of `<system-reminder>`:

```typescript
const wrapSystemMessageContent = (content: any): GeminiPart[] => {
  const parts: GeminiPart[] = [];
  if (typeof content === 'string') {
    parts.push({ text: `<runtime-context>\n${content}\n</runtime-context>` });
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text') {
        parts.push({ text: `<runtime-context>\n${block.text}\n</runtime-context>` });
      } else if (block.text) {
        parts.push({ text: `<runtime-context>\n${block.text}\n</runtime-context>` });
      } else {
        parts.push(block);
      }
    }
  }
  return parts;
};
```

Update comments at system message processing blocks from:
```typescript
// CLAUDE CODE CLI FIX: Map inline system roles to user role and wrap inside <system-reminder> tags
```
to:
```typescript
// CLAUDE CODE CLI FIX: Map inline system roles to user role and wrap inside <runtime-context> tags
```

### 2.2 Test modification in `tests/claudeTranslator.test.ts`
Update unit test assertion under system prompt mapping test suite to verify `<runtime-context>` tag strings.

## 3. Testing Strategy
* Run `npx jest tests/claudeTranslator.test.ts` to verify the translation output includes `<runtime-context>` block formatting.
