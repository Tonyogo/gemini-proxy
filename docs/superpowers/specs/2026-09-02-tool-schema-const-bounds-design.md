# Tool Schema Conversion Optimization: `const` and Exclusive Numeric Bounds

## 1. Context & Motivation
In Claude Messages API request payloads, tool definitions (`tools[].input_schema`) frequently leverage standard JSON Schema keywords such as:
- `const`: Defining fixed parameter constants (e.g. `{ const: "application/json" }`).
- `exclusiveMinimum` / `exclusiveMaximum`: Enforcing strict open-interval bounds (e.g. `{ type: "integer", exclusiveMinimum: 0 }`).

Previously, `_convertSchemaToGemini` inside `src/services/claudeTranslator.ts` treated `const`, `exclusiveMinimum`, and `exclusiveMaximum` as unsupported keys and silently stripped them. This caused:
1. `const` fields without an explicit `type` or `enum` to be lost or degraded into unconstrained generic fields.
2. Numeric boundary restrictions to be lost, allowing the model to produce invalid arguments (e.g., passing `0` when `> 0` was required).

## 2. Technical Design

### 2.1 `const` Keyword Normalization
When `obj.const` is present on a schema node (and `isProperties` is false):
1. **Enum Conversion**: If `result.enum` is not already defined, assign `result.enum = [obj.const]`.
2. **Type Inference**: If `obj.type` is not explicitly provided on the schema node, infer Gemini-compatible type based on `typeof obj.const`:
   - `string` $\to$ `"STRING"`
   - `number` $\to$ `Number.isInteger(obj.const) ? "INTEGER" : "NUMBER"`
   - `boolean` $\to$ `"BOOLEAN"`
   - `array` $\to$ `"ARRAY"`
   - `object` (non-null) $\to$ `"OBJECT"`
3. **Key Sanitization**: `const` remains stripped from the final Gemini parameter output to ensure Gemini OpenAPI Schema compliance.

### 2.2 `exclusiveMinimum` and `exclusiveMaximum` Bounds Mapping
When `exclusiveMinimum` or `exclusiveMaximum` is present on a numeric schema node (and `isProperties` is false):
1. **Numeric Range Mapping**:
   - For integer types (`obj.type === "integer"` or `result.type === "INTEGER"`):
     - If `obj.exclusiveMinimum !== undefined` and `result.minimum === undefined`: `result.minimum = obj.exclusiveMinimum + 1`
     - If `obj.exclusiveMaximum !== undefined` and `result.maximum === undefined`: `result.maximum = obj.exclusiveMaximum - 1`
   - For generic number types (`number` or unspecified):
     - If `obj.exclusiveMinimum !== undefined` and `result.minimum === undefined`: `result.minimum = obj.exclusiveMinimum`
     - If `obj.exclusiveMaximum !== undefined` and `result.maximum === undefined`: `result.maximum = obj.exclusiveMaximum`
2. **Description Augmentation**:
   - Collect constraint clauses:
     - `must be > ${obj.exclusiveMinimum}` (if `exclusiveMinimum` defined)
     - `must be < ${obj.exclusiveMaximum}` (if `exclusiveMaximum` defined)
   - Append to `description`:
     - If original `description` exists: `${obj.description} (${clauses.join(', ')})`
     - If no `description` exists: `(${clauses.join(', ')})`
3. **Key Sanitization**: `exclusiveMinimum` and `exclusiveMaximum` remain stripped from the final Gemini parameter output.

## 3. Scope of Changes
- `src/services/claudeTranslator.ts`:
  - Enhance `_convertSchemaToGemini()` to handle `const`, `exclusiveMinimum`, and `exclusiveMaximum` prior to / during property traversal.
- `tests/claudeTranslator.test.ts`:
  - Add comprehensive test assertions for `const` type inference & enum wrapping.
  - Add test assertions for integer/number open-interval conversion and description enhancement.
  - Add test assertions for nested schema structures.

## 4. Verification & Testing Strategy
- Execute `npx jest tests/claudeTranslator.test.ts` to confirm translation accuracy and zero regression across existing tool/translator test cases.
- Execute full test suite `npm test` to guarantee system-wide stability.
