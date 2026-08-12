# Design Spec: System Instruction Ordering in Claude-to-Gemini Translation

**Date:** 2026-08-12  
**Topic:** Reordering `system_instruction` components in `src/services/claudeTranslator.ts`

---

## 1. Goal & Requirements

Update the construction order of `systemInstruction` when converting Anthropic Claude requests to Google Gemini requests in `claudeTranslator.ts`.

When `systemRoleToInstruction = true` (and across all `systemInstruction` assembly), components must be appended in the following precise order:

1. **Adapter Prompt**: Configured via `config.customSystemInstruction` (`CUSTOM_SYSTEM_INSTRUCTION` environment variable or runtime config).
2. **Claude Original System Prompt**: Provided in request payload `claudeBody.system`.
3. **Runtime Context Messages**: When `config.systemRoleToInstruction = true`, deduplicated `role: 'system'` messages from `claudeBody.messages` wrapped in `<runtime-context>` (or configured `runtimeContextTag`) tags, preceded by the notice header line.

---

## 2. Architecture & Code Changes

### Target File: `src/services/claudeTranslator.ts`

In `translateClaudeToGoogle`:

```typescript
// 1. Adapter Prompt (CUSTOM_SYSTEM_INSTRUCTION)
if (config.customSystemInstruction) {
  appendSystemContent(config.customSystemInstruction);
}

// 2. Claude Original System Prompt (claudeBody.system)
if (claudeBody.system) {
  appendSystemContent(claudeBody.system);
}

// 3. System Role Messages (when systemRoleToInstruction is enabled)
if (config.systemRoleToInstruction) {
  const deduplicatedSystemMsgs = this.deduplicateSystemMessages(claudeBody.messages || []);
  if (deduplicatedSystemMsgs.length > 0) {
    appendSystemContent(`Note: Content enclosed within <${tag}> tags contains dynamic system instructions, runtime environment state, or client tool guidance.`);
    for (const sysMsg of deduplicatedSystemMsgs) {
      const wrappedParts = wrapSystemMessageContent(sysMsg.content);
      const textBlock = wrappedParts.map((p: any) => p.text || '').filter(Boolean).join('\n');
      if (textBlock) {
        appendSystemContent(textBlock);
      }
    }
  }
}
```

---

## 3. Data Flow & Resulting Output Example

For a request payload with:
- `config.customSystemInstruction`: `"Custom Adapter Instruction"`
- `claudeBody.system`: `"Original Claude System"`
- `config.systemRoleToInstruction`: `true`
- `claudeBody.messages`: `[{ role: 'system', content: '# context\nInfo' }]`

**Generated Gemini `systemInstruction.parts[0].text`:**
```text
Custom Adapter Instruction
Original Claude System
Note: Content enclosed within <runtime-context> tags contains dynamic system instructions, runtime environment state, or client tool guidance.
<runtime-context>
# context
Info
</runtime-context>
```

---

## 4. Test Strategy

1. Update `tests/claudeTranslator.test.ts`:
   - Verify ordering when both `customSystemInstruction` and `claudeBody.system` are set.
   - Verify ordering when `systemRoleToInstruction` is enabled with `role: 'system'` messages present.
2. Run full test suite (`npm test`).
