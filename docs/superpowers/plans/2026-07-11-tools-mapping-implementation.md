# Tools Schema Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the recursive `_convertSchemaToGemini` schema sanitization function and integrate it into our tools mappings inside `src/services/claudeTranslator.js`.

**Architecture:** Recursive JSON schema node analyzer that strips blacklisted metadata properties, formats lowercase types to uppercase, translates nullable arrays, and outputs completely safe, Gemini-compliant parameters schemas.

**Tech Stack:** Node.js, Jest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (jest)
- **Framework:** Express.js
- **Statelessness:** Focuses entirely on pure translation logic within `claudeTranslator.js`.

---

### Task 1: Create failing test cases for tools schema mapping

Add unit tests verifying recursive lowercase-to-uppercase type transformation, metadata key filtering, and nullable array transformations.

**Files:**
- Modify: `tests/claudeTranslator.test.js`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Failing TDD test cases inside `tests/claudeTranslator.test.js`.

- [ ] **Step 1: Open `tests/claudeTranslator.test.js`**
We will append a new unit test suite verifying schema-cleaning operations on input tools.

- [ ] **Step 2: Append unit tests to `tests/claudeTranslator.test.js`**
Add the following assertions as a new block inside `tests/claudeTranslator.test.js`:
```javascript
describe('Claude to Gemini Tools Schema Sanitization', () => {
  it('recursively cleans and translates Claude input schemas to Gemini-compliant structures', () => {
    const claudePayload = {
      model: 'claude-3-5-sonnet',
      messages: [{ role: 'user', content: 'Use the tool.' }],
      tools: [
        {
          name: 'get_weather',
          description: 'Gets current weather',
          input_schema: {
            type: 'object',
            $schema: 'http://json-schema.org/draft-07/schema#',
            additionalProperties: false,
            properties: {
              location: {
                type: 'string',
                description: 'The city name'
              },
              unit: {
                type: ['string', 'null'],
                enum: ['celsius', 'fahrenheit'],
                default: 'celsius'
              }
            },
            required: ['location']
          }
        }
      ]
    };

    const result = translator.translateClaudeToGoogle(claudePayload);
    const params = result.googleRequest.tools[0].functionDeclarations[0].parameters;

    // Assert 1: Lowercase "object" is mapped to uppercase "OBJECT"
    expect(params.type).toEqual('OBJECT');

    // Assert 2: Blacklisted keywords ($schema, additionalProperties) must be recursively stripped
    expect(params.$schema).toBeUndefined();
    expect(params.additionalProperties).toBeUndefined();

    // Assert 3: properties location type string mapped to uppercase STRING
    expect(params.properties.location.type).toEqual('STRING');

    // Assert 4: Nullable types array ['string', 'null'] mapped to single type and nullable: true
    expect(params.properties.unit.type).toEqual('STRING');
    expect(params.properties.unit.nullable).toEqual(true);
  });
});
```

- [ ] **Step 3: Run the unit test to verify failure**
Run: `npm test tests/claudeTranslator.test.js`
Expected: FAIL with "params.properties.unit.type is an array" or uppercase validation errors.

- [ ] **Step 4: Commit test suite**
```bash
git add tests/claudeTranslator.test.js
git commit -m "test: add comprehensive tools schema cleaning unit assertions"
```

---

### Task 2: Implement recursive schema conversion and integrate with tools mapping

Implement the `_convertSchemaToGemini` recursive converter and apply it during the tools mapping step inside `claudeTranslator.js`.

**Files:**
- Modify: `src/services/claudeTranslator.js`

**Interfaces:**
- Consumes: Test specifications verifying input assertions.
- Produces: Corrected, sanitized REST schemas inside tools arrays.

- [ ] **Step 1: Open `src/services/claudeTranslator.js`**
Locate the start of the `ClaudeTranslator` class.

- [ ] **Step 2: Add `_convertSchemaToGemini` method to `ClaudeTranslator` class**
Add the complete recursive method to the class block:
```javascript
  _convertSchemaToGemini(obj, isResponseSchema = false, isProperties = false) {
    if (!obj || typeof obj !== "object") return obj;

    const result = Array.isArray(obj) ? [] : {};

    for (const key of Object.keys(obj)) {
      const unsupportedKeys = [
        "$schema",
        "additionalProperties",
        "ref",
        "$ref",
        "propertyNames",
        "patternProperties",
        "unevaluatedProperties",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "const",
        "$comment",
        "enumDescriptions"
      ];

      if (isResponseSchema) {
        unsupportedKeys.push("default", "examples", "$defs", "id");
      }

      if (!isProperties && unsupportedKeys.includes(key)) {
        continue;
      }

      if (key === "anyOf" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const variants = obj[key];
          const hasNull = variants.some(v => v.type === "null");
          const nonNullVariants = variants.filter(v => v.type !== "null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullVariants.length === 1) {
            const converted = this._convertSchemaToGemini(nonNullVariants[0], isResponseSchema, false);
            Object.assign(result, converted);
            if (hasNull) result.nullable = true;
            continue;
          } else if (nonNullVariants.length > 0) {
            result.anyOf = nonNullVariants.map(v =>
              this._convertSchemaToGemini(v, isResponseSchema, false)
            );
            continue;
          } else if (hasNull) {
            continue;
          }
        }
      }

      if (key === "type" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const types = obj[key];
          const nonNullTypes = types.filter(t => t !== "null");
          const hasNull = types.includes("null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullTypes.length === 1) {
            result[key] = nonNullTypes[0].toUpperCase();
          } else if (nonNullTypes.length > 1) {
            if (isResponseSchema) {
              result.anyOf = nonNullTypes.map(t => ({
                type: t.toUpperCase(),
              }));
            } else {
              result[key] = nonNullTypes.map(t => t.toUpperCase());
            }
          } else {
            result[key] = "STRING";
          }
        } else if (typeof obj[key] === "string") {
          result[key] = obj[key].toUpperCase();
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, false);
        } else {
          result[key] = obj[key];
        }
      } else if (key === "enum" && !isProperties) {
        if (isResponseSchema) {
          if (Array.isArray(obj[key])) {
            result[key] = obj[key].map(String);
          } else if (obj[key] !== undefined && obj[key] !== null) {
            result[key] = [String(obj[key])];
          }
          result["type"] = "STRING";
        } else {
          result[key] = obj[key];
        }
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        const nextIsProperties = key === "properties";
        const recursionFlag = isProperties ? false : nextIsProperties;

        result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, recursionFlag);
      } else {
        result[key] = obj[key];
      }
    }

    return result;
  }
```

- [ ] **Step 3: Update tools mapping inside `translateClaudeToGoogle`**
Replace the tool mapping logic in `translateClaudeToGoogle` (around lines 115-125):
```javascript
    // Handle tools mapping
    if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
      googleRequest.tools = [{
        functionDeclarations: claudeBody.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: this._convertSchemaToGemini(tool.input_schema)
        }))
      }];
    }
```

- [ ] **Step 4: Run the unit test to verify success**
Run: `npm test tests/claudeTranslator.test.js`
Expected: PASS

- [ ] **Step 5: Run all test suites recursively to confirm 100% integrity**
Run: `npm test`
Expected: ALL PASS (23/23 assertions)

- [ ] **Step 6: Commit changes**
```bash
git add src/services/claudeTranslator.js
git commit -m "feat: implement recursive _convertSchemaToGemini schema converter and map tool schemas safely"
```
