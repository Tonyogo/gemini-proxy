# Multimodal tool_result Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ClaudeTranslator.translateClaudeToGoogle` to parse array-based multimodal `tool_result` content blocks, extracting image blocks into nested `inlineData` parts inside `functionResponse.parts` according to Gemini's function response specification.

**Architecture:** Extend `tool_result` block processing in `ClaudeTranslator` and update unit tests in `tests/claudeTranslator.test.ts`.

**Tech Stack:** TypeScript, Express, Jest

## Global Constraints
- Strictly maintain TypeScript strict typing (`strict: true`, `noImplicitAny: true` in `tsconfig.json`).
- Ensure all Jest tests pass perfectly with `npm test`.

---

### Task 1: Update ClaudeTranslator to Support Multimodal tool_result

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Produces: Updated `functionResponse` generation in `translateClaudeToGoogle` supporting image extraction.

- [ ] **Step 1: Refactor `tool_result` handling in `src/services/claudeTranslator.ts`**

Read `src/services/claudeTranslator.ts` and locate `else if (block.type === 'tool_result')` (around line 227).

Replace the handling logic with the following:

```typescript
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              const geminiResponseId = block.tool_use_id && block.tool_use_id.startsWith('toolu_g_') ? block.tool_use_id.substring(8) : block.tool_use_id;

              const isSkillTool = matchedName === 'Skill' || matchedName.endsWith(':Skill');
              const blockIndex = msg.content.indexOf(block);
              const nextBlock = msg.content[blockIndex + 1];

              let resultText: any = block.content;
              const imageParts: any[] = [];

              if (isSkillTool && nextBlock && nextBlock.type === 'text') {
                logger.info(`[Translator] [Skill Substitution] Active Skill interception applied: Substituting text block content as response result for tool_use_id '${block.tool_use_id}' and skipping redundant text block.`);
                resultText = nextBlock.text;
                msg.content.splice(blockIndex + 1, 1);
              } else if (Array.isArray(block.content)) {
                const textCollector: string[] = [];
                for (const item of block.content) {
                  if (typeof item === 'string') {
                    textCollector.push(item);
                  } else if (item && item.type === 'text') {
                    if (item.text) textCollector.push(item.text);
                  } else if (item && item.type === 'image' && item.source) {
                    imageParts.push({
                      inlineData: {
                        mimeType: item.source.media_type,
                        data: item.source.data
                      }
                    });
                  }
                }
                resultText = textCollector.join('\n');
              }

              const functionResponseObj: any = {
                name: matchedName,
                response: { result: resultText },
                id: geminiResponseId
              };

              if (imageParts.length > 0) {
                functionResponseObj.parts = imageParts;
              }

              parts.push({
                functionResponse: functionResponseObj
              });
            }
```

- [ ] **Step 2: Run build to verify compilation**

Run: `npm run build`  
Expected: Succeeded.

---

### Task 2: Add Multimodal tool_result Unit Tests

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

- [ ] **Step 1: Add a test case verifying multimodal tool_result conversion in `tests/claudeTranslator.test.ts`**

Read `tests/claudeTranslator.test.ts` and append the following test inside `Claude Tools Interaction Roundtrips`:

```typescript
  it('correctly extracts image blocks inside tool_result to functionResponse.parts as inlineData', () => {
    const claudePayload = {
      model: 'gemini-3.5-flash',
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_g_take_screenshot',
              name: 'take_screenshot',
              input: {}
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_g_take_screenshot',
              content: [
                { type: 'text', text: 'Screenshot captured successfully' },
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: 'iVBORw0KGgoAAAANSUhEUgAA...'
                  }
                }
              ]
            }
          ]
        }
      ]
    } as any;

    const result = translator.translateClaudeToGoogle(claudePayload);
    const userBubble = result.googleRequest.contents[1];
    expect(userBubble.role).toEqual('user');

    const funcResp = userBubble.parts[0].functionResponse!;
    expect(funcResp.name).toEqual('take_screenshot');
    expect(funcResp.response.result).toEqual('Screenshot captured successfully');
    expect(funcResp.parts).toBeDefined();
    expect(funcResp.parts!.length).toEqual(1);
    expect(funcResp.parts![0].inlineData!.mimeType).toEqual('image/png');
    expect(funcResp.parts![0].inlineData!.data).toEqual('iVBORw0KGgoAAAANSUhEUgAA...');
  });
```

- [ ] **Step 2: Run test suite**

Run: `npm test`  
Expected: All 8 test suites pass successfully.
