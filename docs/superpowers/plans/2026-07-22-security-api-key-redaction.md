# Security API Key Redaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce HTTP Header-based API key transport (`x-goog-api-key`) for all upstream Google Gemini requests, completely stripping `?key=...` from URLs, and implementing automated sanitization in payload debug logs.

**Architecture:** Extend `requestHelper.ts` with `buildUpstreamHeaders`, `maskApiKey`, and `sanitizeData` helper utilities. Refactor `claudeController.ts` to use header authentication for all upstream calls. Update `payloadLogger.ts` to sanitize transaction payloads before writing to disk.

**Tech Stack:** TypeScript, Node.js, Express, Jest, Supertest.

## Global Constraints

- **Node / TS**: Strict TypeScript.
- **Upstream Key Transport**: Always pass `x-goog-api-key: <apiKey>` in HTTP Headers. No `?key=` query parameters in Gemini URLs.
- **Client Auth**: Downstream clients can authenticate via `x-api-key`, `Authorization: Bearer <key>`, `x-goog-api-key`, or `query.key`.
- **Sanitization**: Mask sensitive API keys (`AIzaSy...` -> `AIzaSy***7890`) and Bearer tokens in logs.

---

### Task 1: Add Security Helpers to `requestHelper.ts` and Unit Tests

**Files:**
- Modify: `src/utils/requestHelper.ts`
- Modify: `tests/claudeController.test.ts`

**Interfaces:**
- Produces:
  - `buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string>`
  - `maskApiKey(key: string | null | undefined): string`
  - `sanitizeData(data: any): any`

- [ ] **Step 1: Write the failing tests in `tests/claudeController.test.ts`**

Add unit tests for `buildUpstreamHeaders`, `maskApiKey`, and `sanitizeData`:

```typescript
import { buildUpstreamHeaders, maskApiKey, sanitizeData } from '../src/utils/requestHelper';

describe('Security and Request Helpers', () => {
  describe('buildUpstreamHeaders', () => {
    it('creates headers with application/json and x-goog-api-key', () => {
      const headers = buildUpstreamHeaders('my-secret-key');
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'x-goog-api-key': 'my-secret-key'
      });
    });

    it('merges custom headers', () => {
      const headers = buildUpstreamHeaders('my-secret-key', { 'X-Custom': 'val' });
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'x-goog-api-key': 'my-secret-key',
        'X-Custom': 'val'
      });
    });
  });

  describe('maskApiKey', () => {
    it('masks keys longer than 10 characters', () => {
      expect(maskApiKey('AIzaSy1234567890')).toEqual('AIzaSy***7890');
    });

    it('returns *** for short keys', () => {
      expect(maskApiKey('shortkey')).toEqual('***');
    });

    it('returns empty string for empty inputs', () => {
      expect(maskApiKey('')).toEqual('');
      expect(maskApiKey(null)).toEqual('');
      expect(maskApiKey(undefined)).toEqual('');
    });
  });

  describe('sanitizeData', () => {
    it('redacts query string keys and Bearer tokens in strings', () => {
      const input = 'https://api.com/v1?key=secret123 and Authorization: Bearer token456';
      const result = sanitizeData(input);
      expect(result).toEqual('https://api.com/v1?key=*** and Authorization: Bearer ***');
    });

    it('redacts sensitive keys in nested objects', () => {
      const input = {
        apiKey: 'AIzaSy1234567890',
        headers: {
          'x-goog-api-key': 'AIzaSy1234567890',
          authorization: 'Bearer token123'
        },
        other: 'safe_data'
      };
      const result = sanitizeData(input);
      expect(result.apiKey).toEqual('AIzaSy***7890');
      expect(result.headers['x-goog-api-key']).toEqual('AIzaSy***7890');
      expect(result.headers.authorization).toEqual('Bearer***');
      expect(result.other).toEqual('safe_data');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeController.test.ts -t "Security and Request Helpers"`
Expected: FAIL with "buildUpstreamHeaders is not a function" or import error.

- [ ] **Step 3: Implement helper functions in `src/utils/requestHelper.ts`**

Add the following implementations to `src/utils/requestHelper.ts`:

```typescript
/**
 * Builds standard HTTP headers for proxying requests to Gemini upstream.
 */
export function buildUpstreamHeaders(apiKey: string, customHeaders?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
    ...customHeaders
  };
}

/**
 * Masks a sensitive API key for safe logging (e.g., "AIzaSy1234567890" -> "AIzaSy***7890").
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 10) return '***';
  return `${key.substring(0, 6)}***${key.substring(key.length - 4)}`;
}

/**
 * Recursively redacts sensitive API keys and Bearer tokens from objects, strings, or headers.
 */
export function sanitizeData(data: any): any {
  if (!data) return data;
  if (typeof data === 'string') {
    return data
      .replace(/([?&]key=)[^&]+/g, '$1***')
      .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]+/g, '$1***');
  }
  if (typeof data === 'object') {
    const sanitized = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (['key', 'apikey', 'api_key', 'x-goog-api-key', 'authorization'].includes(k.toLowerCase()) && typeof v === 'string') {
        (sanitized as any)[k] = maskApiKey(v);
      } else {
        (sanitized as any)[k] = sanitizeData(v);
      }
    }
    return sanitized;
  }
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeController.test.ts -t "Security and Request Helpers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/requestHelper.ts tests/claudeController.test.ts
git commit -m "feat: add buildUpstreamHeaders, maskApiKey, and sanitizeData helpers

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Refactor `claudeController.ts` Upstream Fetch Calls

**Files:**
- Modify: `src/controllers/claudeController.ts`
- Modify: `tests/claudeController.test.ts`
- Modify: `tests/claudeModels.test.ts`
- Modify: `tests/claudeCountTokens.test.ts`
- Modify: `tests/claudeStreaming.test.ts`
- Modify: `tests/claudeLogging.test.ts`

**Interfaces:**
- Consumes: `buildUpstreamHeaders(apiKey: string)` from `src/utils/requestHelper.ts`

- [ ] **Step 1: Update `claudeController.ts` to use `buildUpstreamHeaders` and strip `?key=`**

In `src/controllers/claudeController.ts`:
1. Import `buildUpstreamHeaders` from `../utils/requestHelper`.
2. Refactor `handleMessages` (Stream mode):
   - Target path: `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`
   - Headers: `buildUpstreamHeaders(apiKey)`
3. Refactor `handleMessages` (Non-Stream mode):
   - Target path: `/v1beta/models/${cleanModelName}:generateContent`
   - Headers: `buildUpstreamHeaders(apiKey)`
4. Refactor `handleCountTokens`:
   - Target path: `/v1beta/models/${cleanModelName}:countTokens`
   - Headers: `buildUpstreamHeaders(apiKey)`
5. Refactor `handleListModels`:
   - Target path: `/v1beta/models`
   - Headers: `buildUpstreamHeaders(apiKey)`
6. Refactor `handleRetrieveModel`:
   - Target path: `/v1beta/models/${resolvedModelId}`
   - Headers: `buildUpstreamHeaders(apiKey)`

Code change in `handleMessages` (Stream):
```typescript
const targetPath = `/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`;
const targetUrl = getUpstreamUrl(targetPath);
logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

const response = await fetch(targetUrl, {
  method: 'POST',
  headers: buildUpstreamHeaders(apiKey),
  body: JSON.stringify(gemReq)
});
```

Code change in `handleMessages` (Non-Stream):
```typescript
const targetPath = `/v1beta/models/${cleanModelName}:generateContent`;
const targetUrl = getUpstreamUrl(targetPath);
logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

const response = await fetch(targetUrl, {
  method: 'POST',
  headers: buildUpstreamHeaders(apiKey),
  body: JSON.stringify(gemReq)
});
```

Code change in `handleCountTokens`:
```typescript
const targetPath = `/v1beta/models/${cleanModelName}:countTokens`;
const targetUrl = getUpstreamUrl(targetPath);
logger.info(`[Request] [Transaction: ${transactionId}] Proxying to Gemini: POST ${targetPath}`);

const response = await fetch(targetUrl, {
  method: 'POST',
  headers: buildUpstreamHeaders(apiKey),
  body: JSON.stringify(gemReq)
});
```

Code change in `handleListModels`:
```typescript
const targetUrl = getUpstreamUrl('/v1beta/models');
const response = await fetch(targetUrl, {
  method: 'GET',
  headers: buildUpstreamHeaders(apiKey)
});
```

Code change in `handleRetrieveModel`:
```typescript
const targetUrl = getUpstreamUrl(`/v1beta/models/${resolvedModelId}`);
const response = await fetch(targetUrl, {
  method: 'GET',
  headers: buildUpstreamHeaders(apiKey)
});
```

- [ ] **Step 2: Run all unit tests to check if any tests fail due to mock expectation mismatches**

Run: `npm test`
Expected: Check test suite execution results.

- [ ] **Step 3: Update unit test fetch mocks in tests if needed and verify test pass**

Update tests if any test asserted URL query string `key=...` or specific fetch headers.

Run: `npm test`
Expected: PASS (All 8 test suites pass).

- [ ] **Step 4: Commit**

```bash
git add src/controllers/claudeController.ts tests/
git commit -m "refactor: transmit Gemini API keys via x-goog-api-key HTTP header

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Integrate Payload Logger Sanitization in `payloadLogger.ts`

**Files:**
- Modify: `src/services/payloadLogger.ts`
- Modify: `tests/payloadLogger.test.ts`

**Interfaces:**
- Consumes: `sanitizeData(data: any)` from `src/utils/requestHelper.ts`

- [ ] **Step 1: Write failing test in `tests/payloadLogger.test.ts` for sanitization**

In `tests/payloadLogger.test.ts`, add a test verifying that `saveTransaction` sanitizes keys before saving:

```typescript
import payloadLogger from '../src/services/payloadLogger';
import { promises as fs } from 'fs';

describe('PayloadLogger Sanitization', () => {
  it('sanitizes sensitive client keys in transaction log files', async () => {
    const spyWriteFile = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined as any);
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined as any);

    await payloadLogger.saveTransaction(
      'tx123',
      { headers: { 'x-api-key': 'AIzaSy1234567890' } },
      { url: 'https://api.com?key=AIzaSy1234567890' },
      { status: 'ok' },
      { type: 'message' },
      100
    );

    expect(spyWriteFile).toHaveBeenCalled();
    const savedContent = JSON.parse(spyWriteFile.mock.calls[0][1] as string);
    expect(savedContent.client_req.headers['x-api-key']).toEqual('AIzaSy***7890');
    expect(savedContent.gem_req.url).toEqual('https://api.com?key=***');

    spyWriteFile.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/payloadLogger.test.ts -t "PayloadLogger Sanitization"`
Expected: FAIL (savedContent contains unsanitized key).

- [ ] **Step 3: Update `payloadLogger.ts` to sanitize inputs in `saveTransaction`**

In `src/services/payloadLogger.ts`:
Import `sanitizeData` from `../utils/requestHelper`.

Update `saveTransaction`:
```typescript
public async saveTransaction(
  transactionId: string,
  clientReq: any,
  gemReq: any,
  gemRes: any,
  claudeRes: any,
  duration?: number
): Promise<void> {
  try {
    const targetDir = this._getTargetDir();
    await fs.mkdir(targetDir, { recursive: true });

    const payload = {
      duration: duration !== undefined ? duration : null,
      client_req: sanitizeData(clientReq) || null,
      gem_req: sanitizeData(gemReq) || null,
      gem_res: sanitizeData(gemRes) || null,
      claude_res: sanitizeData(claudeRes) || null
    };

    const filePath = path.join(targetDir, `transaction_${transactionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
    logger.debug(`[PayloadLogger] Saved transaction log: transaction_${transactionId}.json`);
  } catch (err: any) {
    logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
  }
}
```

- [ ] **Step 4: Run all tests to verify everything passes**

Run: `npm test`
Expected: PASS (All test suites pass).

- [ ] **Step 5: Commit**

```bash
git add src/services/payloadLogger.ts tests/payloadLogger.test.ts
git commit -m "feat: sanitize debug transaction logs before writing to disk

Co-Authored-By: Claude <noreply@anthropic.com>"
```
