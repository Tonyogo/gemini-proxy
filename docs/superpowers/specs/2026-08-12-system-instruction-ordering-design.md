# Design Spec: System Instruction Ordering in Claude-to-Gemini Translation

**Date:** 2026-08-12  
**Topic:** Reordering `system_instruction` components in `src/services/claudeTranslator.ts`

---

## 1. Goal & Requirements

Update the construction order of `systemInstruction` when converting Anthropic Claude requests to Google Gemini requests in `claudeTranslator.ts`.

When `systemRoleToInstruction = true` (and across all `systemInstruction` assembly), components must be appended in the following precise order:

1. **Claude Original System Prompt**: Provided in request payload `claudeBody.system`.
2. **Adapter Prompt**: Configured via `config.customSystemInstruction` (`CUSTOM_SYSTEM_INSTRUCTION` environment variable or runtime config).
3. **Runtime Context Messages**: When `config.systemRoleToInstruction = true`, deduplicated `role: 'system'` messages from `claudeBody.messages` appended with double newlines (`\n\n`) as separator, without any `<runtime-context>` tag wrapping and without notice messages.

---

## 2. Architecture & Code Changes

### Target File: `src/services/claudeTranslator.ts`

In `translateClaudeToGoogle`:

```typescript
// 1. Claude Original System Prompt (claudeBody.system)
if (claudeBody.system) {
  appendSystemContent(claudeBody.system);
}

// 2. Adapter Prompt (CUSTOM_SYSTEM_INSTRUCTION)
if (config.customSystemInstruction) {
  appendSystemContent(config.customSystemInstruction);
}

// 3. System Role Messages (when systemRoleToInstruction is enabled)
if (config.systemRoleToInstruction) {
  const deduplicatedSystemMsgs = this.deduplicateSystemMessages(claudeBody.messages || []);
  for (const sysMsg of deduplicatedSystemMsgs) {
    appendSystemContent(sysMsg.content);
  }
}
```

---

## 3. Data Flow & Resulting Output Example

For a request payload with:
- `claudeBody.system`: `"Original Claude System"`
- `config.customSystemInstruction`: `"Custom Adapter Instruction"`
- `config.systemRoleToInstruction`: `true`
- `claudeBody.messages`: `[{ role: 'system', content: '# context\nInfo' }]`

**Generated Gemini `systemInstruction.parts[0].text`:**
```text
Original Claude System

Custom Adapter Instruction

# context
Info
```

---

## 4. Test Strategy

1. Update `tests/claudeTranslator.test.ts`:
   - Verify ordering: `claudeBody.system` -> `customSystemInstruction` -> deduplicated system messages.
   - Verify double newline separation between sections.
   - Verify there is no `<runtime-context>` tag wrapping and no notice header prefix.
2. Run full test suite (`npm test`).
