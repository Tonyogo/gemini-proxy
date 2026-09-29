# Filter Ignored Tools in Claude Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter out internal/useless tools (e.g. `Artifact`, `ArtifactCheck`, `ArtifactData`, `ArtifactComments`) when translating Claude API tools into Gemini function declarations, with support for configurable `IGNORED_TOOLS`.

**Architecture:** Add `DEFAULT_IGNORED_TOOLS` and `ignoredTools` config in `config/default.ts` supporting environment variables and hot runtime overrides. In `claudeTranslator.ts:translateClaudeToGoogle`, perform case-insensitive filtering on `claudeBody.tools` before mapping to Gemini's `functionDeclarations`. If all tools are filtered out, omit `googleRequest.tools` entirely.

**Tech Stack:** TypeScript, Node.js, Jest

**Spec:** `docs/superpowers/specs/2026-09-29-filter-ignored-tools-design.md`

## Global Constraints

- Configuration properties must not be statically cached in module scope; access via `config.ignoredTools` dynamically.
- Filter comparison must be case-insensitive.
- Upstream requests must omit `tools` key entirely if the resulting function declarations list is empty.
- Code style must match existing repo conventions with strict TypeScript.

## Review Focus

1. Tool names with surrounding whitespace or different casing (e.g., `'  artifact  '`) must still match and be filtered.
2. Tools array containing null, undefined, or missing `name` field must not crash the translator.
3. When all tools in `claudeBody.tools` are ignored, `googleRequest.tools` must be undefined (not empty array `[{ functionDeclarations: [] }]`).
4. Overriding `config.ignoredTools` via `updateConfig` or runtime settings must immediately take effect without server restart.
5. Mixed tools list (some ignored, some valid) must preserve all valid tools in original order with full schemas intact.

---

### Task 1: Configuration Support for `ignoredTools`

**Files:**
- Modify: `config/default.ts`
- Modify: `src/types/index.ts`
- Test: `tests/config.test.ts` (or add assertion in `tests/claudeTranslator.test.ts`)

**Interfaces:**
- Produces: `DEFAULT_IGNORED_TOOLS: string[]` exported from `config/default.ts`
- Produces: `config.ignoredTools: string[]` accessible on configuration object

- [x] **Step 1: Write the failing test**

In `tests/claudeTranslator.test.ts`:
```typescript
it('provides default ignoredTools configuration and allows runtime updates', () => {
  expect(config.ignoredTools).toBeDefined();
  expect(config.ignoredTools).toContain('Artifact');
  expect(config.ignoredTools).toContain('ArtifactCheck');
  expect(config.ignoredTools).toContain('ArtifactData');
  expect(config.ignoredTools).toContain('ArtifactComments');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "provides default ignoredTools"`
Expected: FAIL (`config.ignoredTools` is undefined)

- [x] **Step 3: Implement configuration in `config/default.ts`**

In `config/default.ts`:
1. Define and export `DEFAULT_IGNORED_TOOLS`:
```typescript
export const DEFAULT_IGNORED_TOOLS: string[] = [
  'Artifact',
  'ArtifactCheck',
  'ArtifactData',
  'ArtifactComments'
];
```
2. Parse from `process.env.IGNORED_TOOLS` using `parseListEnv`:
```typescript
const parsedIgnoredTools = parseListEnv(
  process.env.IGNORED_TOOLS,
  DEFAULT_IGNORED_TOOLS
);
```
3. Add `ignoredTools: (runtimeOverrides.ignoredTools !== undefined ? runtimeOverrides.ignoredTools : parsedIgnoredTools) as string[]` to `getEnvConfig()` and `config` object.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeTranslator.test.ts -t "provides default ignoredTools"`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add config/default.ts tests/claudeTranslator.test.ts
git commit -m "feat(config): add default and configurable ignoredTools"
```

---

### Task 2: Implement Tool Filtering in `ClaudeTranslator`

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `config.ignoredTools` from `config/default.ts`
- Modifies: `ClaudeTranslator.translateClaudeToGoogle`

- [x] **Step 1: Write failing tests for tool filtering**

In `tests/claudeTranslator.test.ts`:
```typescript
it('filters out default ignored tools from claudeBody.tools', () => {
  const claudePayload = {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Draw something' }],
    tools: [
      { name: 'Artifact', description: 'claude artifact tool', input_schema: { type: 'object' } },
      { name: 'ArtifactCheck', description: 'check tool', input_schema: { type: 'object' } },
      { name: 'Bash', description: 'execute bash', input_schema: { type: 'object' } }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  expect(result.googleRequest.tools).toBeDefined();
  expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
  expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('Bash');
});

it('omits googleRequest.tools completely when all tools are ignored', () => {
  const claudePayload = {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'Draw something' }],
    tools: [
      { name: 'Artifact', description: 'artifact tool', input_schema: { type: 'object' } },
      { name: 'artifactcomments', description: 'case insensitive check', input_schema: { type: 'object' } }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  expect(result.googleRequest.tools).toBeUndefined();
});

it('filters tools case-insensitively and trims whitespace', () => {
  const claudePayload = {
    model: 'gemini-2.5-flash',
    messages: [{ role: 'user', content: 'test' }],
    tools: [
      { name: '  aRtIfAcT  ', description: 'artifact tool', input_schema: { type: 'object' } },
      { name: 'custom_tool', description: 'keep this', input_schema: { type: 'object' } }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
  expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('custom_tool');
});

it('respects dynamic custom config.ignoredTools', () => {
  const originalIgnored = config.ignoredTools;
  try {
    config.ignoredTools = ['CustomUselessTool'];
    const claudePayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'test' }],
      tools: [
        { name: 'CustomUselessTool', description: 'ignored', input_schema: { type: 'object' } },
        { name: 'Artifact', description: 'now kept because overridden', input_schema: { type: 'object' } }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    expect(result.googleRequest.tools![0].functionDeclarations).toHaveLength(1);
    expect(result.googleRequest.tools![0].functionDeclarations[0].name).toBe('Artifact');
  } finally {
    config.ignoredTools = originalIgnored;
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "filters out default ignored tools"`
Expected: FAIL (all tools including `Artifact` are currently preserved)

- [x] **Step 3: Implement tool filtering in `translateClaudeToGoogle`**

In `src/proxy/services/claudeTranslator.ts`:
Update the `tools` handling section (around line 634):
```typescript
if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
  const ignoredToolsList = config.ignoredTools || [];
  const ignoredSet = new Set(ignoredToolsList.map((t: string) => String(t || '').trim().toLowerCase()).filter(Boolean));

  const validTools = claudeBody.tools.filter((tool: any) => {
    if (!tool || typeof tool !== 'object') return false;
    const name = String(tool.name || '').trim().toLowerCase();
    return name && !ignoredSet.has(name);
  });

  if (validTools.length > 0) {
    googleRequest.tools = [{
      functionDeclarations: validTools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        parameters: this._convertSchemaToGemini(tool.input_schema)
      }))
    }];
  }
}
```

- [x] **Step 4: Run all translator tests to verify they pass**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: ALL PASS

- [x] **Step 5: Run full test suite to ensure zero regressions**

Run: `npm test`
Expected: ALL PASS

- [x] **Step 6: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): filter ignored tools when translating to Gemini"
```
