# Tool Use Empty Text Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify the Google-to-Claude translation layer to forcefully inject an empty text block before outputting a raw `tool_use` block, ensuring strict Claude client SDK compatibility.

**Architecture:** Augments `convertGoogleToClaudeNonStream` to prefix an empty text block to an empty content array before pushing a `tool_use`. Augments `translateGoogleToClaudeStream` to emit a synthetic `content_block_start` and `content_block_stop` using a `streamState.hasEmittedText` flag.

**Tech Stack:** Node.js, TypeScript, Jest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (jest)
- **Framework:** Express.js
- **Statelessness:** Modifies pure translation helper in `claudeTranslator.ts`.

---

### Task 1: Create failing test cases for tool_use prefix injection

Add comprehensive unit tests verifying that an empty text block is prefixed to `tool_use` in both streaming and non-streaming modes when Gemini API omits text.

**Files:**
- Modify: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Consumes: None (starting task)
- Produces: Failing TDD test cases inside `tests/claudeTranslator.test.ts`.

- [ ] **Step 1: Open `tests/claudeTranslator.test.ts`**
We will update the `converts Gemini functionCall response back to Claude tool_use format` test for non-streaming, and add a new test for streaming.

- [ ] **Step 2: Update the non-streaming unit test**
Replace the assertion section of the existing non-streaming `functionCall` test (around line 200) to check that `content[0]` is the empty text block and `content[1]` is the `tool_use`.
```typescript
    const result = translator.convertGoogleToClaudeNonStream(geminiResponse, 'gemini-3.5-flash');

    // Assert 1: output prefixes an empty text block before the tool_use
    expect(result.content.length).toEqual(2);
    expect(result.content[0].type).toEqual('text');
    expect(result.content[0].text).toEqual('');

    // Assert 2: tool_use is preserved at index 1
    expect(result.content[1].type).toEqual('tool_use');
    expect(result.content[1].name).toEqual('TaskCreate');
    expect(result.content[1].input.subject).toEqual('Explore project context');
    expect(result.content[1].input.description).toEqual('Check files, docs, and recent commits to understand transaction logging.');
    expect(result.content[1].id).toBeDefined();

    expect(result.usage.input_tokens).toEqual(47883);
    expect(result.usage.output_tokens).toEqual(53 + 291); // candidates + thoughts
    expect(result.stop_reason).toEqual('tool_use');
```

- [ ] **Step 3: Append streaming test to `tests/claudeTranslator.test.ts`**
```typescript
describe('Gemini to Claude Stream Response Translation', () => {
  it('injects synthetic empty text block before tool_use in stream if missing', () => {
    const streamState: any = {};
    const chunk = {
      candidates: [{
        content: {
          parts: [{ functionCall: { name: 'get_weather', args: { location: 'SF' } } }]
        }
      }]
    };

    const eventString = translator.translateGoogleToClaudeStream(JSON.stringify(chunk), 'gemini-3.5-flash', streamState);
    
    // Split events by double newline to parse individual SSE blocks
    const events = eventString!.split('\n\n').filter(Boolean);
    
    // First is message_start
    expect(events[0]).toContain('message_start');
    
    // Second should be synthetic text block start
    expect(events[1]).toContain('content_block_start');
    expect(events[1]).toContain('"type":"text"');
    expect(events[1]).toContain('"text":""');
    
    // Third should be synthetic text block stop
    expect(events[2]).toContain('content_block_stop');
    expect(events[2]).toContain('"index":0');
    
    // Fourth should be the actual tool_use start
    expect(events[3]).toContain('content_block_start');
    expect(events[3]).toContain('tool_use');
    expect(events[3]).toContain('get_weather');
    expect(events[3]).toContain('"index":1');
  });
});
```

- [ ] **Step 4: Run the test to make sure they fail**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: FAIL due to missing synthetic text block and length mismatch.

- [ ] **Step 5: Commit tests**
```bash
git add tests/claudeTranslator.test.ts
git commit -m "test: add tool_use empty text block prefix assertions for streaming and non-streaming"
```

---

### Task 2: Implement tool_use empty text injection

Implement the text block injection checks inside `claudeTranslator.ts`.

**Files:**
- Modify: `src/services/claudeTranslator.ts`

**Interfaces:**
- Consumes: Test specifications.
- Produces: Properly prefixed arrays and stream blocks.

- [ ] **Step 1: Open `src/services/claudeTranslator.ts`**
Locate the `convertGoogleToClaudeNonStream` and `translateGoogleToClaudeStream` methods.

- [ ] **Step 2: Fix `convertGoogleToClaudeNonStream`**
In `convertGoogleToClaudeNonStream`, find the `else if (part.functionCall)` block:
```typescript
        } else if (part.functionCall) {
          // CLAUDE SDK FIX: Inject empty text block if tool_use is first
          if (content.length === 0) {
            content.push({ type: 'text', text: '' });
          }
          content.push({
            id: `toolu_fake_${Math.random().toString(36).substring(2, 11)}`,
            type: 'tool_use',
            name: part.functionCall.name,
            input: part.functionCall.args || {}
          });
        }
```

- [ ] **Step 3: Fix `translateGoogleToClaudeStream`**
In `translateGoogleToClaudeStream`, add `hasEmittedText` checking:

Inside the `for (const part of candidate.content.parts)` loop:
```typescript
        if (part.thought === true && part.text) {
          streamState.hasEmittedText = true;
          if (!streamState.thinkingBlockStarted) {
// ...
        } else if (part.text) {
          streamState.hasEmittedText = true;
          if (streamState.thinkingBlockStarted) {
// ...
        } else if (part.functionCall) {
          // CLAUDE SDK FIX: Inject synthetic empty text block if none emitted yet
          if (!streamState.hasEmittedText) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'text', text: '' }
            });
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.contentBlockIndex++;
            streamState.hasEmittedText = true;
          }

          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_stream_${Math.random().toString(36).substring(2, 11)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            }
          });
          events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
          streamState.contentBlockIndex++;
        }
```

- [ ] **Step 4: Run the unit test suite to verify passing**
Run: `npm test tests/claudeTranslator.test.ts`
Expected: PASS

- [ ] **Step 5: Run all test suites recursively to confirm absolute safety**
Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Build project**
Run: `npm run build`
Expected: Build successfully without errors.

- [ ] **Step 7: Commit changes**
```bash
git add src/services/claudeTranslator.ts
git commit -m "fix: inject empty text block before tool_use to comply with Claude SDK requirements"
```
