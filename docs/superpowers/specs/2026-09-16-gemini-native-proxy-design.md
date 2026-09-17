# Native Gemini API Proxy Specification & Design

## 1. Overview & Objective

### 1.1 Objective
Currently, this service functions as a stateless translation proxy from Anthropic Claude Messages API to Google Gemini API. This project requires adding native Google Gemini protocol proxy support, allowing standard Gemini SDKs, tools, and external applications to use this proxy directly without translation.

The native proxy must:
1. Support standard Google Gemini paths (`/v1beta/*` and `/v1/models/*:generateContent`, etc.).
2. Seamlessly proxy both non-streaming (`:generateContent`, `:countTokens`, `models` list/get) and streaming (`:streamGenerateContent`) endpoints.
3. Integrate with existing governance features:
   - Request & response transaction logging via `payloadLogger`.
   - Model mappings and alias resolution via `MODEL_MAPPINGS` (with `x-scheduling-strategy` forwarding).
   - Upstream timeout control (`extractTimeoutMs`).
   - AbortController stream lifecycle management (`StreamLifecycleManager`).
   - Optional `CUSTOM_SYSTEM_INSTRUCTION` injection when not explicitly overridden.

---

## 2. Architecture & Request Pipeline

```
Client (Gemini SDK / HTTP)
   │
   │ POST /v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse
   ▼
Express Route (`/v1beta`, `/v1/models/*`)
   │
   ▼
`GeminiController`
   │── 1. Extract API Key (`x-goog-api-key`, `Authorization`, query `key`)
   │── 2. Resolve Model Mapping (`gemini-pro-latest` -> `gemini-3.7-flash`)
   │── 3. (Optional) Inject `CUSTOM_SYSTEM_INSTRUCTION` into payload
   │── 4. Setup `StreamLifecycleManager` & Upstream URL
   │
   ▼
Fetch Upstream (`config.geminiBaseUrl` / Google AI Studio)
   │
   ▼
Pipe Response to Client & Asynchronously Persist to `payloadLogger`
```

---

## 3. Detailed Component Specifications

### 3.1 Routing (`src/routes/geminiRoutes.ts`)
Mount endpoints supporting official Gemini conventions:
- `ALL /v1beta/*`: Catches all calls under `/v1beta` (e.g. `/v1beta/models`, `/v1beta/models/:modelWithAction`, `/v1beta/files`, etc.).
- `ALL /v1/models/:modelWithAction`: Supports Gemini endpoints prefixed with `/v1` without colliding with Claude's `/v1/messages` and `/v1/messages/count_tokens`.

### 3.2 Controller (`src/controllers/geminiController.ts`)
Methods:
1. `handleProxy(req: Request, res: Response)`:
   - Extracts API key via `extractClientKey(req)`. Rejects 401 if missing.
   - Extracts timeout via `extractTimeoutMs(req)`.
   - Resolves target model name from path (e.g. `/models/gemini-pro-latest:generateContent` -> extracts `gemini-pro-latest`, checks `config.modelMappings`, rewrites URL path if mapped).
   - Determines if the request is streaming:
     - Detects `:streamGenerateContent` in path, or `alt=sse` query param.
   - For non-streaming requests:
     - Proxies body and headers via `fetch`.
     - Writes status and JSON response to client.
     - Logs transaction via `payloadLogger.saveTransaction`.
   - For streaming requests (`:streamGenerateContent`):
     - Uses `StreamLifecycleManager`.
     - Pipes upstream SSE / chunked chunks directly to `res`.
     - Accumulates streamed chunks in memory and saves full payload log upon stream completion.

### 3.3 App Mounting (`src/app.ts`)
- Mount `/v1beta` -> `geminiRoutes`.
- In `claudeRoutes` or `app.ts`, route `/v1/models/*:generateContent` and `/v1/models/*:streamGenerateContent` to `geminiController.handleProxy`.

---

## 4. Verification & Testing Strategy

1. **Unit & Integration Tests (`tests/geminiProxy.test.ts`)**:
   - Test non-streaming `:generateContent` forwarding.
   - Test streaming `:streamGenerateContent?alt=sse` forwarding with chunk aggregation.
   - Test model mapping and header propagation (`x-scheduling-strategy`).
   - Test missing API key 401 error.
   - Test `/v1beta/models` list forwarding.
2. **Regression Testing**:
   - Run existing test suites (`npx jest --runInBand`). Ensure existing Claude API routes remain 100% unaffected.
