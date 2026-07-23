# Design Spec: Configurable `RUNTIME_CONTEXT_TAG` Support

**Date:** 2026-07-23  
**Author:** Claude Code  
**Status:** Approved  

## 1. Overview & Objectives

Currently, system messages translated by `ClaudeTranslator` are wrapped using a hardcoded tag string `<runtime-context>`.

To support different client applications or prompt engineering requirements without requiring source code modifications, this specification introduces a configurable environment variable `RUNTIME_CONTEXT_TAG` (defaulting to `'runtime-context'`).

## 2. Component Specifications

### 2.1 Configuration (`config/default.ts`)
Add `runtimeContextTag` to `config`:

```typescript
runtimeContextTag: process.env.RUNTIME_CONTEXT_TAG || 'runtime-context'
```

### 2.2 Translation Logic (`src/services/claudeTranslator.ts`)
In `translateClaudeToGoogle`:

1. Read `const tag = config.runtimeContextTag || 'runtime-context';`.
2. Format inline system content as:
   `<${tag}>\n${content}\n</${tag}>`
3. Dynamically interpolate `tag` in `systemInstruction` explanatory notices when `SYSTEM_ROLE_TO_INSTRUCTION` is active:
   `Note: Content enclosed within <${tag}> tags contains dynamic system instructions, runtime environment state, or client tool guidance.`

## 3. Testing Strategy

Add tests in `tests/claudeTranslator.test.ts`:
1. Verify default tag mapping uses `<runtime-context>`.
2. Override `config.runtimeContextTag = 'custom-context-tag'` and verify system messages wrap using `<custom-context-tag>...</custom-context-tag>`.
