# Custom System Instruction Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement support for configurable custom system instruction injection via `CUSTOM_SYSTEM_INSTRUCTION` env var, injecting baseline instructions into Gemini's `systemInstruction` payload during translation.

**Architecture:** Extend `config/default.ts`, update `.env.example`, modify `translateClaudeToGoogle` in `claudeTranslator.ts`, and add unit test assertions in `tests/claudeTranslator.test.ts`.

**Tech Stack:** TypeScript, Express, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Add Custom System Instruction to Config and Translator

**Files:**
- Modify: `config/default.ts`
- Modify: `.env.example`
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: `process.env.CUSTOM_SYSTEM_INSTRUCTION`
- Produces: `config.customSystemInstruction: string` and injected `systemInstruction` in `translateClaudeToGoogle`.

- [ ] **Step 1: Edit `config/default.ts` to export `customSystemInstruction`**

Read `config/default.ts` and add `customSystemInstruction`:

```typescript
export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  logLevel: process.env.LOG_LEVEL || 'info',
  transactionLogsDir: process.env.TRANSACTION_LOGS_DIR || 'logs',
  modelMappings: parsedModelMappings,
  customSystemInstruction: process.env.CUSTOM_SYSTEM_INSTRUCTION || '',
  allowedKeys: [] as string[]
};
```

- [ ] **Step 2: Append documentation to `.env.example`**

Read `.env.example` and append documentation:

```properties
# 注入到 Gemini upstream 的自定义系统指令 system_instruction，用于弥补协议转换的能力差异
# 例如: 指导 Gemini 在使用 tool 时遵守特定的输出约束或角色定位
CUSTOM_SYSTEM_INSTRUCTION=
```

- [ ] **Step 3: Update `translateClaudeToGoogle` inside `src/services/claudeTranslator.ts`**

Read `src/services/claudeTranslator.ts` and find the system prompt handling block (around line 163):
Replace:
```typescript
    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }
```
With:
```typescript
    if (config.customSystemInstruction) {
      appendSystemContent(config.customSystemInstruction);
    }

    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }
```

- [ ] **Step 4: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 2: Add Unit Tests and Validate

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

- [ ] **Step 1: Add unit tests verifying custom system instruction injection inside `tests/claudeTranslator.test.ts`**

Read `tests/claudeTranslator.test.ts` and append the following test suite:

```typescript
describe('Claude Translator Custom System Instruction Injection', () => {
  it('automatically injects customSystemInstruction when configured', () => {
    config.customSystemInstruction = 'Always answer concisely in markdown.';

    const claudePayloadNoSystem = {
      model: 'gemini-3.5-flash',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result1 = translator.translateClaudeToGoogle(claudePayloadNoSystem);
    expect(result1.googleRequest.systemInstruction).toBeDefined();
    expect(result1.googleRequest.systemInstruction!.parts[0].text).toEqual('Always answer concisely in markdown.');

    const claudePayloadWithSystem = {
      model: 'gemini-3.5-flash',
      system: 'You are a code assistant.',
      messages: [{ role: 'user', content: 'Hello' }]
    } as any;
    const result2 = translator.translateClaudeToGoogle(claudePayloadWithSystem);
    expect(result2.googleRequest.systemInstruction).toBeDefined();
    expect(result2.googleRequest.systemInstruction!.parts[0].text).toEqual(
      'Always answer concisely in markdown.\nYou are a code assistant.'
    );

    config.customSystemInstruction = '';
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm run clean && npm run build && npm test`  
Expected: All 8 test suites pass successfully.
