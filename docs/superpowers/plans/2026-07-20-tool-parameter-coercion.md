# Tool Parameter Type Coercion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a schema-driven coercion layer in `src/services/claudeTranslator.ts` that normalizes Gemini response function call parameters to match the client's original JSON schema types, preventing crashes in downstream tools like Claude Code.

**Architecture:** Integrate `_coerceArguments` helper into `ClaudeTranslator` and update non-streaming/streaming response paths to consume it with the client's schema.

**Tech Stack:** TypeScript, Express, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Add Coercion Logic and Update Translate Signatures

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: `tools` array from `convertGoogleToClaudeNonStream` and `translateGoogleToClaudeStream`.
- Produces: 
  - `_coerceArguments(toolName: string, args: Record<string, any>, tools?: any[]): Record<string, any>`

- [ ] **Step 1: Edit `src/services/claudeTranslator.ts` to implement `_coerceArguments`**

Read `src/services/claudeTranslator.ts` and add `_coerceArguments` to the class:

```typescript
  /**
   * Coerces Gemini's returned function call arguments to match the types expected
   * by the client's original JSON schema definition.
   */
  public _coerceArguments(toolName: string, args: Record<string, any>, tools?: any[]): Record<string, any> {
    if (!tools || !Array.isArray(tools) || !args || typeof args !== 'object') {
      return args;
    }

    // Find the original tool schema definition
    const originalTool = tools.find((t: any) => t && t.name === toolName);
    if (!originalTool || !originalTool.input_schema || typeof originalTool.input_schema !== 'object') {
      return args;
    }

    const properties = originalTool.input_schema.properties;
    if (!properties || typeof properties !== 'object') {
      return args;
    }

    const coercedArgs = { ...args };

    for (const propName of Object.keys(properties)) {
      const propSchema = properties[propName];
      if (!propSchema || typeof propSchema !== 'object') continue;

      const rawValue = coercedArgs[propName];
      if (rawValue === undefined || rawValue === null) continue;

      // Get expected types (could be a string or array of strings, e.g. ['string', 'null'])
      let expectedTypes: string[] = [];
      if (typeof propSchema.type === 'string') {
        expectedTypes = [propSchema.type];
      } else if (Array.isArray(propSchema.type)) {
        expectedTypes = propSchema.type.filter((t: any) => typeof t === 'string');
      }

      const actualType = typeof rawValue;

      // Coerce if string is expected but got number or boolean
      if (expectedTypes.includes('string') && actualType !== 'string') {
        logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from ${actualType} to string. Value: ${rawValue}`);
        coercedArgs[propName] = String(rawValue);
      }

      // Coerce if integer/number is expected but got string
      else if ((expectedTypes.includes('number') || expectedTypes.includes('integer')) && actualType === 'string') {
        const parsed = Number(rawValue);
        if (!isNaN(parsed)) {
          logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from string to number. Value: '${rawValue}' -> ${parsed}`);
          coercedArgs[propName] = parsed;
        }
      }

      // Coerce if boolean is expected but got string or number
      else if (expectedTypes.includes('boolean') && actualType !== 'boolean') {
        let coercedBool: boolean | undefined;
        if (actualType === 'string') {
          if (rawValue.toLowerCase() === 'true') coercedBool = true;
          if (rawValue.toLowerCase() === 'false') coercedBool = false;
        } else if (actualType === 'number') {
          if (rawValue === 1) coercedBool = true;
          if (rawValue === 0) coercedBool = false;
        }

        if (coercedBool !== undefined) {
          logger.info(`[Translator] [Coercion] Coercing property '${propName}' of tool '${toolName}' from ${actualType} to boolean. Value: ${rawValue} -> ${coercedBool}`);
          coercedArgs[propName] = coercedBool;
        }
      }
    }

    return coercedArgs;
  }
```

- [ ] **Step 2: Update `convertGoogleToClaudeNonStream` and `translateGoogleToClaudeStream` methods**

1. Update the signature of `convertGoogleToClaudeNonStream`:
   ```typescript
   public convertGoogleToClaudeNonStream(googleResponse: any, modelName: string, tools?: any[]) {
   ```
2. In `convertGoogleToClaudeNonStream`, find the `else if (part.functionCall)` block:
   Replace:
   ```typescript
           } else if (part.functionCall) {
             const callId = part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_fake_${Math.random().toString(36).substring(2, 11)}`;
             content.push({
               id: callId,
               type: 'tool_use',
               name: part.functionCall.name,
               input: part.functionCall.args || {}
             });
           }
   ```
   With:
   ```typescript
           } else if (part.functionCall) {
             const callId = part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_fake_${Math.random().toString(36).substring(2, 11)}`;
             const coercedArgs = this._coerceArguments(part.functionCall.name, part.functionCall.args || {}, tools);
             content.push({
               id: callId,
               type: 'tool_use',
               name: part.functionCall.name,
               input: coercedArgs
             });
           }
   ```

3. In `translateGoogleToClaudeStream`, add `const tools = streamState.tools;` at the top of the method.
4. In the `part.functionCall` block inside `translateGoogleToClaudeStream`:
   Replace:
   ```typescript
             const callId = part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_stream_${Math.random().toString(36).substring(2, 11)}`;
             // 1. Send content_block_start with empty input object
             events.push({
               type: 'content_block_start',
               index: streamState.contentBlockIndex,
               content_block: {
                 type: 'tool_use',
                 id: callId,
                 name: part.functionCall.name,
                 input: {}
               }
             });
             // 2. Send content_block_delta with input_json_delta format
             events.push({
               type: 'content_block_delta',
               index: streamState.contentBlockIndex,
               delta: {
                 type: 'input_json_delta',
                 partial_json: JSON.stringify(part.functionCall.args || {})
               }
             });
   ```
   With:
   ```typescript
             const callId = part.functionCall.id ? `toolu_g_${part.functionCall.id}` : `toolu_stream_${Math.random().toString(36).substring(2, 11)}`;
             const coercedArgs = this._coerceArguments(part.functionCall.name, part.functionCall.args || {}, tools);
             // 1. Send content_block_start with empty input object
             events.push({
               type: 'content_block_start',
               index: streamState.contentBlockIndex,
               content_block: {
                 type: 'tool_use',
                 id: callId,
                 name: part.functionCall.name,
                 input: {}
               }
             });
             // 2. Send content_block_delta with input_json_delta format
             events.push({
               type: 'content_block_delta',
               index: streamState.contentBlockIndex,
               delta: {
                 type: 'input_json_delta',
                 partial_json: JSON.stringify(coercedArgs)
               }
             });
   ```

- [ ] **Step 3: Run typescript compiler to verify zero compilation errors**

Run: `npm run build`  
Expected: Successfully compiles.

---

### Task 2: Pass Tools Schema from ClaudeController

**Files:**
- Modify: `src/controllers/claudeController.ts`

**Interfaces:**
- Consumes: `clientReq.tools`
- Produces: Updates to `convertGoogleToClaudeNonStream` and `translateGoogleToClaudeStream` method calls passing `clientReq.tools`.

- [ ] **Step 1: Edit `src/controllers/claudeController.ts` to pass tools schema**

Read `src/controllers/claudeController.ts` and modify the streaming and non-streaming call paths:

1. In the streaming generation path (around lines 108):
   Change:
   ```typescript
           const streamState = {};
   ```
   To:
   ```typescript
           const streamState = { tools: clientReq.tools };
   ```

2. In the non-streaming generation path (around line 219):
   Change:
   ```typescript
         const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);
   ```
   To:
   ```typescript
         const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName, clientReq.tools);
   ```

- [ ] **Step 2: Run build to verify**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 3: Add Unit Tests and Validate

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

- [ ] **Step 1: Add a test suite verifying type coercion inside `tests/claudeTranslator.test.ts`**

Add the following tests at the end of `tests/claudeTranslator.test.ts`:

```typescript
describe('Claude Translator Argument Type Coercion', () => {
  const mockTools = [
    {
      name: 'update_task',
      description: 'Update task',
      input_schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          percentage: { type: 'number' },
          active: { type: 'boolean' }
        }
      }
    }
  ];

  it('coerces numeric or boolean types to strings if schema expects string', () => {
    const rawArgs = {
      taskId: 25,
      active: true
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.taskId).toEqual('25');
    // Ensure active is not converted to string because schema expects boolean
    expect(coerced.active).toEqual(true);
  });

  it('coerces stringified numbers to number types if schema expects number/integer', () => {
    const rawArgs = {
      percentage: '85.5'
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.percentage).toEqual(85.5);
  });

  it('coerces strings or numbers to boolean if schema expects boolean', () => {
    const rawArgs = {
      active: 'true'
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.active).toEqual(true);

    const rawArgsBinary = {
      active: 0
    };
    const coercedBinary = translator._coerceArguments('update_task', rawArgsBinary, mockTools);
    expect(coercedBinary.active).toEqual(false);
  });

  it('preserves fields if types match or field does not exist in schema properties', () => {
    const rawArgs = {
      taskId: '55',
      percentage: 100,
      unmappedField: 123
    };
    const coerced = translator._coerceArguments('update_task', rawArgs, mockTools);
    expect(coerced.taskId).toEqual('55');
    expect(coerced.percentage).toEqual(100);
    expect(coerced.unmappedField).toEqual(123);
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`  
Expected: All tests pass.
