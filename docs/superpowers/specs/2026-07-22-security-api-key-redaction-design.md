# Design Spec: Security Fix - Upstream API Key Header Pass-Through & Data Redaction

## Overview

This specification addresses security vulnerabilities related to Google Gemini API Key leakage via URL Query parameters and log files in `gemini-proxy`. The goal is to enforce HTTP Header-based API key transport (`x-goog-api-key`) for all upstream Google Gemini requests, completely stripping sensitive credentials from URL Query strings, and implementing automated sanitization in payload debug logs and console logs.

## Objectives & Constraints

- **Eliminate Query Param Credentials**: All requests sent from `gemini-proxy` to Gemini upstream (`https://generativelanguage.googleapis.com`) must carry the API key via the `x-goog-api-key` HTTP Header. URL Query string `?key=...` is completely removed.
- **Client Authentication Compatibility**: Downstream clients can continue to send credentials via `x-api-key`, `Authorization: Bearer <key>`, `x-goog-api-key`, or query param `?key=...`. The proxy extracts this key and forwards it exclusively via upstream headers.
- **Payload & Log Sanitization**: Loggers (`payloadLogger.ts` and `logger.ts`) must pass payloads through sanitization utilities to prevent token/key leaks in disk transaction logs or terminal outputs.
- **Zero Breaking Changes for Clients**: Downstream API response interfaces remain 100% compliant with Anthropic Claude specifications.

## Component Architecture & Detailed Changes

### 1. `src/utils/requestHelper.ts`

Introduce unified request header builders and credential masking helper functions:

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

### 2. `src/controllers/claudeController.ts`

Refactor all 5 upstream HTTP fetch endpoints to use header-based credential passing:

1. **Stream Generation (`handleMessages`)**:
   - Upstream URL: `getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse`)`
   - Headers: `buildUpstreamHeaders(apiKey)`
2. **Non-Stream Generation (`handleMessages`)**:
   - Upstream URL: `getUpstreamUrl(`/v1beta/models/${cleanModelName}:generateContent`)`
   - Headers: `buildUpstreamHeaders(apiKey)`
3. **Count Tokens (`handleCountTokens`)**:
   - Upstream URL: `getUpstreamUrl(`/v1beta/models/${cleanModelName}:countTokens`)`
   - Headers: `buildUpstreamHeaders(apiKey)`
4. **List Models (`handleListModels`)**:
   - Upstream URL: `getUpstreamUrl('/v1beta/models')`
   - Headers: `buildUpstreamHeaders(apiKey)`
5. **Retrieve Model Metadata (`handleRetrieveModel`)**:
   - Upstream URL: `getUpstreamUrl(`/v1beta/models/${resolvedModelId}`)`
   - Headers: `buildUpstreamHeaders(apiKey)`

*Log output cleanup*: Display target path without query string regex replacement since query keys no longer exist.

### 3. `src/services/payloadLogger.ts`

In `saveTransaction`, invoke `sanitizeData()` on `clientReq`, `gemReq`, `gemRes`, and `claudeRes` prior to serialization and disk persistence (`fs.writeFile`).

### 4. Tests (`tests/`)

- Add unit tests in `tests/claudeController.test.ts` for `buildUpstreamHeaders`, `maskApiKey`, and `sanitizeData`.
- Update any existing mocks or assertions expecting `?key=` in request URLs to expect `x-goog-api-key` in request headers.

## Verification Plan

1. **Unit Testing**: Run `npm test` and ensure all 8 test suites pass.
2. **Header Inspection**: Verify via unit test assertions that upstream `fetch` calls receive `x-goog-api-key` in header and no `key=` parameter in URL.
3. **Sanitization Verification**: Pass dummy keys through `sanitizeData()` and verify masked outputs in transaction file mocks.
