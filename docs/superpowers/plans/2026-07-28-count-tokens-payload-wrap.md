# Count Tokens Payload Wrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the Gemini countTokens request payload inside a `generateContentRequest` root property and strip output generation parameters (`maxOutputTokens`) to prevent `INVALID_ARGUMENT` errors from Gemini upstream.

**Architecture:** Update `claudeController.handleCountTokens` to cleanse `googleRequest.generationConfig` and wrap `googleRequest` inside a `{ generateContentRequest: googleRequest }` payload before posting to Gemini's `:countTokens` endpoint.

**Tech Stack:** TypeScript, Node.js, Express, Jest, Supertest.

## Global Constraints

- Preserve strict TypeScript rules.
- Maintain existing logging and `payloadLogger.saveTransaction` behavior using the updated payload.

---

### Task 1: Update `handleCountTokens` and Unit Tests

**Files:**
- Modify: `src/controllers/claudeController.ts:323-335`
- Modify: `tests/claudeCountTokens.test.ts:12-30`

**Interfaces:**
- Consumes: `claudeTranslator.translateClaudeToGoogle`
- Produces: `POST /v1/messages/count_tokens` endpoint handler with payload wrapping `{ generateContentRequest: ... }`

- [ ] **Step 1: Update test expectations in `tests/claudeCountTokens.test.ts`**

Modify `tests/claudeCountTokens.test.ts` to assert that `fetch` is called with a body containing `generateContentRequest`.

```typescript
import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch');

describe('POST /v1/messages/count_tokens', () => {
  it('correctly translates request and wraps payload in generateContentRequest for Gemini countTokens API', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ totalTokens: 42 })
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'gemini-3.5-flash',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);

    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (fetch as unknown as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(fetchCall[1].body);

    // Verify generateContentRequest wrapping
    expect(sentBody).toHaveProperty('generateContentRequest');
    expect(sentBody.generateContentRequest).toHaveProperty('contents');
    // Verify generationConfig maxOutputTokens was cleaned
    if (sentBody.generateContentRequest.generationConfig) {
      expect(sentBody.generateContentRequest.generationConfig).not.toHaveProperty('maxOutputTokens');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeCountTokens.test.ts`
Expected: FAIL (sentBody will not have `generateContentRequest` property).

- [ ] **Step 3: Implement `handleCountTokens` payload wrapping in `src/controllers/claudeController.ts`**

Update `src/controllers/claudeController.ts`:

```typescript
      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);

      // Clean generationConfig maxOutputTokens if present as countTokens only evaluates input
      if (googleRequest.generationConfig) {
        delete googleRequest.generationConfig.maxOutputTokens;
        if (Object.keys(googleRequest.generationConfig).length === 0) {
          delete googleRequest.generationConfig;
        }
      }

      const countTokensPayload = {
        generateContentRequest: googleRequest
      };
      gemReq = countTokensPayload;

      const targetPath = `/v1beta/models/${cleanModelName}:countTokens`;
      const targetUrl = getUpstreamUrl(targetPath);
      logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: buildUpstreamHeaders(apiKey),
        body: JSON.stringify(countTokensPayload)
      });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeCountTokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full test suite to ensure no regressions**

Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 6: Commit changes**

```bash
git add src/controllers/claudeController.ts tests/claudeCountTokens.test.ts
git commit -m "fix(count_tokens): wrap payload in generateContentRequest for Gemini countTokens API Co-Authored-By: Claude <noreply@anthropic.com>"
```
