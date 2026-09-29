# Strip Claude System Prompt Fingerprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanitize Claude system prompts during protocol translation to neutralize Claude/Anthropic identity fingerprints and completely drop blocks starting with `x-anthropic-billing-header`, guarded by `STRIP_SYSTEM_FINGERPRINTS` configuration.

**Architecture:** Extend `config/default.ts` with a hot-reloadable `stripSystemFingerprints` flag (default `true`). Add a `cleanSystemContent` sanitizer in `src/proxy/services/claudeTranslator.ts` that detects and drops `x-anthropic-billing-header` blocks and neutralizes identity and Git attribution fingerprints before feeding prompts into Gemini's `systemInstruction` or message context.

**Tech Stack:** TypeScript, Node.js, Express, Jest.

**Spec:** `docs/superpowers/specs/2026-09-29-strip-system-fingerprints-design.md`

## Global Constraints

- Default value of `stripSystemFingerprints` must be `true` unless `process.env.STRIP_SYSTEM_FINGERPRINTS === 'false'`.
- Billing header check must be case-insensitive and handle leading/trailing whitespace (`/^\s*x-anthropic-billing-header/i`).
- If an entire system message or system block matches the billing header, it must be completely discarded (producing no content in Gemini request).
- Existing `systemRoleToInstruction` and `ephemeralSystemMessages` pipelines must remain intact and functional.

## Review Focus

1. **System prompt as an array of blocks where one block has billing header**: Only the billing header block should be dropped, preserving non-billing sibling blocks.
2. **Whitespace/Newlines around billing header**: Content with leading empty lines or spaces before `x-anthropic-billing-header` must still match and be dropped.
3. **Empty system instruction after dropping**: If `claudeBody.system` only contained billing header content, `systemInstruction` must remain undefined/null on `googleRequest`, rather than creating an empty `parts: [{ text: "" }]`.
4. **Disabled configuration (`stripSystemFingerprints = false`)**: System prompt containing billing headers and Claude identity must pass through unchanged.
5. **Combined system content**: When `customSystemInstruction` is present and client `system` has billing header, client system is dropped but `customSystemInstruction` is preserved.

---

### Task 1: Add `stripSystemFingerprints` to Configuration

**Files:**
- Modify: `config/default.ts:200-280`
- Test: `tests/config.test.ts` (or `tests/claudeTranslator.test.ts`)

**Interfaces:**
- Produces: `config.stripSystemFingerprints: boolean`

- [ ] **Step 1: Write test for configuration default and override**

Add tests in `tests/claudeTranslator.test.ts`:
```typescript
it('has stripSystemFingerprints enabled by default in config', () => {
  expect(config.stripSystemFingerprints).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "has stripSystemFingerprints enabled by default"`
Expected: FAIL with `expect(received).toBe(expected)` (received undefined).

- [ ] **Step 3: Implement config addition**

In `config/default.ts`:
1. In `getEnvConfig()`:
```typescript
stripSystemFingerprints: process.env.STRIP_SYSTEM_FINGERPRINTS !== 'false',
```
2. In `config` object:
```typescript
stripSystemFingerprints: process.env.STRIP_SYSTEM_FINGERPRINTS !== 'false',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeTranslator.test.ts -t "has stripSystemFingerprints enabled by default"`
Expected: PASS.

- [ ] **Step 5: Commit changes**

```bash
git add config/default.ts tests/claudeTranslator.test.ts
git commit -m "feat(config): add stripSystemFingerprints configuration"
```

---

### Task 2: Implement `cleanSystemContent` in `ClaudeTranslator`

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts:380-450`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Produces: `claudeTranslator.cleanSystemContent(content: any): string | null`
- Consumes: `config.stripSystemFingerprints`

- [ ] **Step 1: Write failing tests for prompt sanitization**

Add to `tests/claudeTranslator.test.ts`:
```typescript
describe('Claude System Prompt Fingerprint Sanitization', () => {
  it('completely drops system prompt starting with x-anthropic-billing-header', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: 'x-anthropic-billing-header: cc_version=2.1.284.551; cc_entrypoint=cli;\nYou are Claude Code.',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeUndefined();
  });

  it('neutralizes Claude identity and Git attribution in system prompts', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: "You are Claude Code, Anthropic's official CLI for Claude.\nEnd git commit messages with:\n- Co-Authored-By: Claude Code <noreply@anthropic.com>",
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    const systemText = result.googleRequest.systemInstruction!.parts[0].text;
    expect(systemText).not.toContain('Claude Code');
    expect(systemText).not.toContain('Anthropic');
    expect(systemText).not.toContain('Co-Authored-By');
    expect(systemText).toContain('AI');
  });

  it('drops billing header blocks in array system prompts while retaining other blocks', () => {
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: [
        { type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1;\nDrop this block' },
        { type: 'text', text: 'Keep this project instruction' }
      ],
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.systemInstruction).toBeDefined();
    expect(result.googleRequest.systemInstruction!.parts[0].text).toEqual('Keep this project instruction');
  });

  it('preserves billing header and Claude identity when stripSystemFingerprints is false', () => {
    config.stripSystemFingerprints = false;
    const claudePayload = {
      model: 'gemini-2.5-flash',
      system: 'x-anthropic-billing-header: test\nYou are Claude Code',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result = translator.translateClaudeToGoogle(claudePayload);
    config.stripSystemFingerprints = true;
    expect(result.googleRequest.systemInstruction).toBeDefined();
    expect(result.googleRequest.systemInstruction!.parts[0].text).toContain('x-anthropic-billing-header');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/claudeTranslator.test.ts -t "Claude System Prompt Fingerprint Sanitization"`
Expected: FAIL.

- [ ] **Step 3: Implement `cleanSystemContent` and integrate into `translateClaudeToGoogle`**

In `src/proxy/services/claudeTranslator.ts`:
1. Add public/helper method:
```typescript
public cleanSystemContent(rawText: string): string | null {
  if (!rawText) return null;
  if (!config.stripSystemFingerprints) return rawText;

  // Option A: Drop entire block if it starts with x-anthropic-billing-header
  if (/^\s*x-anthropic-billing-header/i.test(rawText)) {
    logger.info('[Translator] Dropping system content block starting with x-anthropic-billing-header');
    return null;
  }

  let cleaned = rawText;

  // 1. Identity Neutralization
  cleaned = cleaned.replace(/You are Claude Code, Anthropic's official CLI for Claude\./gi, 'You are an AI code assistant.');
  cleaned = cleaned.replace(/You are Claude,? (a large language model created by Anthropic|helpful and harmless)[^\.\n]*\./gi, 'You are an AI assistant.');
  
  // 2. Git Attribution Removal
  cleaned = cleaned.replace(/End git commit messages with:\s*\n- Co-Authored-By: Claude Code[^\n]*/gi, '');
  cleaned = cleaned.replace(/- Co-Authored-By: Claude Code <noreply@anthropic\.com>/gi, '');
  cleaned = cleaned.replace(/🤖 Generated with \[Claude Code\][^\n]*/gi, '');

  // 3. Generic Brand Neutralization
  cleaned = cleaned.replace(/Claude Code/g, 'AI Assistant');
  cleaned = cleaned.replace(/Anthropic/g, 'AI');

  // Compress redundant line breaks
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || null;
}
```

2. Update `appendSystemContent`:
```typescript
const appendSystemContent = (content: any) => {
  let text = "";
  if (typeof content === "string") {
    const cleaned = this.cleanSystemContent(content);
    if (cleaned) text = cleaned;
  } else if (Array.isArray(content)) {
    text = content
      .map((block: any) => {
        let blockText = "";
        if (typeof block === "string") blockText = block;
        else if (block && block.type === "text") blockText = block.text || "";
        else if (block?.text) blockText = block.text || "";

        return this.cleanSystemContent(blockText);
      })
      .filter(Boolean)
      .join("\n");
  }

  if (!text) return;

  if (systemInstruction) {
    systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n\n${text}`;
  } else {
    systemInstruction = {
      parts: [{ text }],
      role: "user"
    };
  }
};
```

3. Update `wrapSystemMessageContent` for inline system messages:
```typescript
const wrapSystemMessageContent = (content: any): GeminiPart[] => {
  const parts: GeminiPart[] = [];
  if (typeof content === 'string') {
    const cleaned = this.cleanSystemContent(content);
    if (cleaned) {
      parts.push({ text: `<${tag}>\n${cleaned}\n</${tag}>` });
    }
  } else if (Array.isArray(content)) {
    for (const block of content) {
      let blockText = '';
      if (typeof block === 'string') blockText = block;
      else if (block?.type === 'text') blockText = block.text || '';
      else if (block?.text) blockText = block.text || '';

      if (blockText) {
        const cleaned = this.cleanSystemContent(blockText);
        if (cleaned) {
          parts.push({ text: `<${tag}>\n${cleaned}\n</${tag}>` });
        }
      } else {
        parts.push(block);
      }
    }
  }
  return parts;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/claudeTranslator.test.ts -t "Claude System Prompt Fingerprint Sanitization"`
Expected: PASS.

- [ ] **Step 5: Run full test suite for regression verification**

Run: `npm test`
Expected: 100% tests pass.

- [ ] **Step 6: Commit changes**

```bash
git add src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): strip Claude system prompt fingerprints and billing header"
```
