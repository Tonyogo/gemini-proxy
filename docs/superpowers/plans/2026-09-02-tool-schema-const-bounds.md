# Tool Schema Conversion Optimization (`const` and Numeric Bounds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance `_convertSchemaToGemini` in `claudeTranslator.ts` so that `const` definitions and `exclusiveMinimum` / `exclusiveMaximum` boundaries in Claude tool parameter schemas are accurately normalized and preserved for Gemini instead of being silently dropped.

**Architecture:** Update `_convertSchemaToGemini` in `src/services/claudeTranslator.ts` to inspect schema objects for `const` (converting to `enum` with type inference) and `exclusiveMinimum` / `exclusiveMaximum` (shifting discrete bounds for integers, assigning `minimum`/`maximum`, and appending human-readable constraint text to `description`) before sanitizing unsupported OpenAPI schema keys.

**Tech Stack:** TypeScript, Node.js, Express, Jest

## Global Constraints

- Preserve strict TypeScript types and style matching the existing codebase.
- Ensure all unsupported keywords (`$schema`, `const`, `exclusiveMinimum`, `exclusiveMaximum`, `additionalProperties`, etc.) are never sent to Gemini to avoid 400 validation failures.
- Zero static config caching (follow CLAUDE.md guidelines).
- All unit tests in `tests/claudeTranslator.test.ts` must pass.

---

### Task 1: Add Unit Tests for `const` Normalization & Type Inference

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `translator.translateClaudeToGoogle(claudePayload)`
- Produces: Failing test assertions verifying `const` fields are mapped to `enum` and inferred `type`.

- [ ] **Step 1: Write failing unit tests for `const` parameter conversion**

Add tests covering:
1. `const` with string value without explicit `type` (e.g. `{ const: "json" }` $\to$ `{ type: "STRING", enum: ["json"] }`).
2. `const` with integer and float number values without explicit `type` (e.g. `{ const: 100 }` $\to$ `{ type: "INTEGER", enum: [100] }`, `{ const: 3.14 }` $\to$ `{ type: "NUMBER", enum: [3.14] }`).
3. `const` with boolean value (e.g. `{ const: true }` $\to$ `{ type: "BOOLEAN", enum: [true] }`).
4. `const` when `type` is already provided (e.g. `{ type: "string", const: "v1" }` $\to$ `{ type: "STRING", enum: ["v1"] }`).
5. Ensure `const` property itself is deleted/omitted from output parameters.

```typescript
it('translates const keyword to enum and infers type when type is omitted', () => {
  const claudePayload = {
    model: 'gemini-3.5-flash',
    messages: [{ role: 'user', content: 'Use the tool.' }],
    tools: [
      {
        name: 'configure_format',
        description: 'Configure format parameters',
        input_schema: {
          type: 'object',
          properties: {
            format: {
              const: 'json',
              description: 'Target format'
            },
            version: {
              const: 2
            },
            ratio: {
              const: 1.5
            },
            enabled: {
              const: true
            },
            mode: {
              type: 'string',
              const: 'strict'
            }
          },
          required: ['format']
        }
      }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

  expect(params.properties.format.type).toEqual('STRING');
  expect(params.properties.format.enum).toEqual(['json']);
  expect(params.properties.format.const).toBeUndefined();

  expect(params.properties.version.type).toEqual('INTEGER');
  expect(params.properties.version.enum).toEqual([2]);
  expect(params.properties.version.const).toBeUndefined();

  expect(params.properties.ratio.type).toEqual('NUMBER');
  expect(params.properties.ratio.enum).toEqual([1.5]);

  expect(params.properties.enabled.type).toEqual('BOOLEAN');
  expect(params.properties.enabled.enum).toEqual([true]);

  expect(params.properties.mode.type).toEqual('STRING');
  expect(params.properties.mode.enum).toEqual(['strict']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "translates const keyword"`
Expected: FAIL (because `const` is currently stripped and `format.enum` is undefined).

---

### Task 2: Implement `const` Schema Conversion in `_convertSchemaToGemini`

**Files:**
- Modify: `src/services/claudeTranslator.ts:70-170`

**Interfaces:**
- Consumes: Claude parameter schema node with `const` property.
- Produces: Gemini-compatible schema with `enum: [obj.const]` and inferred uppercase `type`.

- [ ] **Step 1: Update `_convertSchemaToGemini` to handle `const`**

In `src/services/claudeTranslator.ts`, inside `_convertSchemaToGemini`:
When `!isProperties && !Array.isArray(obj)`:
If `obj.const !== undefined`:
1. If `obj.enum === undefined`, initialize `result.enum = [obj.const]`.
2. If `obj.type === undefined`:
   - `typeof obj.const === 'string'` $\to$ `result.type = 'STRING'`
   - `typeof obj.const === 'number'` $\to$ `result.type = Number.isInteger(obj.const) ? 'INTEGER' : 'NUMBER'`
   - `typeof obj.const === 'boolean'` $\to$ `result.type = 'BOOLEAN'`
   - `Array.isArray(obj.const)` $\to$ `result.type = 'ARRAY'`
   - `typeof obj.const === 'object' && obj.const !== null` $\to$ `result.type = 'OBJECT'`

- [ ] **Step 2: Run tests to verify `const` tests pass**

Run: `npx jest tests/claudeTranslator.test.ts -t "translates const keyword"`
Expected: PASS

- [ ] **Step 3: Commit `const` support**

```bash
git add src/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): support const keyword in tool parameter schema conversion"
```

---

### Task 3: Add Unit Tests for `exclusiveMinimum` and `exclusiveMaximum` Conversion

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: `translator.translateClaudeToGoogle(claudePayload)` with open-interval schema constraints.
- Produces: Failing test assertions verifying `exclusiveMinimum`/`exclusiveMaximum` are converted to integer-shifted or direct `minimum`/`maximum` and appended to `description`.

- [ ] **Step 1: Write failing unit tests for `exclusiveMinimum` and `exclusiveMaximum`**

Add tests covering:
1. Integer type with `exclusiveMinimum: 0` and `exclusiveMaximum: 10` $\to$ `minimum: 1`, `maximum: 9`, `description: "Item count (must be > 0, must be < 10)"`.
2. Number type with `exclusiveMinimum: 0.5` without description $\to$ `minimum: 0.5`, `description: "(must be > 0.5)"`.
3. Schema with already specified `minimum: 0` alongside `exclusiveMaximum: 100` for integer $\to$ preserves `minimum: 0`, calculates `maximum: 99`.
4. Ensure `exclusiveMinimum` and `exclusiveMaximum` are omitted from output parameters.

```typescript
it('translates exclusiveMinimum and exclusiveMaximum to shifted min/max and enhanced descriptions', () => {
  const claudePayload = {
    model: 'gemini-3.5-flash',
    messages: [{ role: 'user', content: 'Use the tool.' }],
    tools: [
      {
        name: 'set_thresholds',
        description: 'Set numerical thresholds',
        input_schema: {
          type: 'object',
          properties: {
            count: {
              type: 'integer',
              exclusiveMinimum: 0,
              exclusiveMaximum: 10,
              description: 'Total item count'
            },
            rate: {
              type: 'number',
              exclusiveMinimum: 0.0,
              exclusiveMaximum: 1.0
            },
            offset: {
              type: 'integer',
              minimum: 0,
              exclusiveMaximum: 100,
              description: 'Starting offset'
            }
          },
          required: ['count', 'rate']
        }
      }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  const params = result.googleRequest.tools![0].functionDeclarations[0].parameters;

  // Integer: exclusive bounds shifted by 1
  expect(params.properties.count.type).toEqual('INTEGER');
  expect(params.properties.count.minimum).toEqual(1);
  expect(params.properties.count.maximum).toEqual(9);
  expect(params.properties.count.description).toEqual('Total item count (must be > 0, must be < 10)');
  expect(params.properties.count.exclusiveMinimum).toBeUndefined();
  expect(params.properties.count.exclusiveMaximum).toBeUndefined();

  // Number: boundaries retained as min/max
  expect(params.properties.rate.type).toEqual('NUMBER');
  expect(params.properties.rate.minimum).toEqual(0.0);
  expect(params.properties.rate.maximum).toEqual(1.0);
  expect(params.properties.rate.description).toEqual('(must be > 0, must be < 1)');

  // Pre-existing minimum preserved
  expect(params.properties.offset.minimum).toEqual(0);
  expect(params.properties.offset.maximum).toEqual(99);
  expect(params.properties.offset.description).toEqual('Starting offset (must be < 100)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "translates exclusiveMinimum and exclusiveMaximum"`
Expected: FAIL (because `exclusiveMinimum` is stripped without setting `minimum` or augmenting `description`).

---

### Task 4: Implement `exclusiveMinimum` and `exclusiveMaximum` Conversion in `_convertSchemaToGemini`

**Files:**
- Modify: `src/services/claudeTranslator.ts:70-170`

**Interfaces:**
- Consumes: Claude parameter schema node with `exclusiveMinimum` or `exclusiveMaximum`.
- Produces: Gemini-compatible schema with `minimum`, `maximum`, and augmented `description`.

- [ ] **Step 1: Implement bounds mapping and description enhancement**

In `src/services/claudeTranslator.ts`, inside `_convertSchemaToGemini`:
When `!isProperties && !Array.isArray(obj)`:
1. Check for `exclusiveMinimum` or `exclusiveMaximum`:
   - Determine if integer: `obj.type === 'integer' || (Array.isArray(obj.type) && obj.type.includes('integer'))`
   - Handle `exclusiveMinimum`:
     - If `obj.exclusiveMinimum !== undefined && obj.minimum === undefined`:
       - `result.minimum = isInteger ? obj.exclusiveMinimum + 1 : obj.exclusiveMinimum`
   - Handle `exclusiveMaximum`:
     - If `obj.exclusiveMaximum !== undefined && obj.maximum === undefined`:
       - `result.maximum = isInteger ? obj.exclusiveMaximum - 1 : obj.exclusiveMaximum`
   - Augment description:
     - Collect clauses:
       - `if (obj.exclusiveMinimum !== undefined) clauses.push(\`must be > \${obj.exclusiveMinimum}\`)`
       - `if (obj.exclusiveMaximum !== undefined) clauses.push(\`must be < \${obj.exclusiveMaximum}\`)`
     - If `clauses.length > 0`:
       - If `obj.description`: `result.description = \`\${obj.description} (\${clauses.join(', ')})\``
       - Else: `result.description = \`(\${clauses.join(', ')})\``
2. In key loop, if `key === 'description'` and `clauses.length > 0`, skip copying `obj.description` to avoid overwriting `result.description`.

- [ ] **Step 2: Run tests to verify bounds tests pass**

Run: `npx jest tests/claudeTranslator.test.ts -t "translates exclusiveMinimum and exclusiveMaximum"`
Expected: PASS

- [ ] **Step 3: Commit bounds conversion support**

```bash
git add src/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): support exclusiveMinimum and exclusiveMaximum conversion in tool schemas"
```

---

### Task 5: Nested Schema Verification & Full Test Suite Run

**Files:**
- Modify: `tests/claudeTranslator.test.ts`
- Test: All tests in `tests/`

**Interfaces:**
- Consumes: Entire test suite across proxy and admin modules.
- Produces: All test suites passing cleanly.

- [ ] **Step 1: Add nested schema test case (array items & nested object properties)**

Add a test in `tests/claudeTranslator.test.ts` checking nested objects inside `items` and `properties` having `const` and `exclusiveMinimum`.

```typescript
it('handles nested objects and array items with const and exclusive bounds', () => {
  const claudePayload = {
    model: 'gemini-3.5-flash',
    messages: [{ role: 'user', content: 'Nested tool' }],
    tools: [
      {
        name: 'batch_update',
        description: 'Batch update items',
        input_schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  kind: { const: 'entity' },
                  score: { type: 'integer', exclusiveMinimum: 0 }
                },
                required: ['kind', 'score']
              }
            }
          }
        }
      }
    ]
  } as any;

  const result = translator.translateClaudeToGoogle(claudePayload);
  const itemProps = result.googleRequest.tools![0].functionDeclarations[0].parameters.properties.items.items.properties;

  expect(itemProps.kind.type).toEqual('STRING');
  expect(itemProps.kind.enum).toEqual(['entity']);
  expect(itemProps.score.type).toEqual('INTEGER');
  expect(itemProps.score.minimum).toEqual(1);
  expect(itemProps.score.description).toEqual('(must be > 0)');
});
```

- [ ] **Step 2: Run all translator tests**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS with all tests passing.

- [ ] **Step 3: Run complete project test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit test suite and finalize**

```bash
git add tests/claudeTranslator.test.ts
git commit -m "test(translator): add comprehensive nested schema verification for const and bounds"
```
