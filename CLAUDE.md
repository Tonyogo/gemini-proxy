# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development & Deployment Commands

- **Local Dev Mode**: `npm run dev` (starts local Cloudflare Worker development environment via `wrangler dev` listening on `http://localhost:8787`)
- **Frontend Dev Mode**: `npm run dev:frontend` (starts Vite React development server on port 5173)
- **Build Frontend**: `npm run build:frontend` (builds Vite React SPA in `frontend/` to `dist/frontend`)
- **Build All**: `npm run build` (builds frontend assets)
- **Deploy to Cloudflare**: `npm run deploy` (builds frontend assets and deploys Worker + Assets via `wrangler deploy`)
- **Set Secret**: `npx wrangler secret put ADMIN_SECRET_KEY` (sets encrypted admin key on Cloudflare)
- **Run All Tests**: `npm test` (executes complete Vitest test suite in seconds)
- **Run Single Test**: `npx vitest run tests/<test-name>.test.ts` (e.g., `npx vitest run tests/claudeTranslator.test.ts`)

## Architecture & Structure

This is a **pure Cloudflare Workers edge API gateway** that translates Anthropic Claude Messages API requests into Google Gemini API requests, translates responses (Web Standard TransformStream SSE stream or non-stream JSON) back to Claude format, and proxies native Gemini API calls transparently, alongside an out-of-band Admin Web Console hosted directly on Cloudflare Assets.

### Key Components

- **Main Edge Router (`src/index.ts`):** 
  - Built on **Hono**, handles CORS, global error normalization to Claude error format, and routes `/v1/*`, `/v1beta/*`, and `/api/admin/*`. Non-API paths fallback to `env.ASSETS` to serve the static frontend React SPA.
- **Claude Translation Proxy (`src/proxy/routes/claudeRoutes.ts` & `src/proxy/services/`):**
  - Routes `/v1/messages`, `/v1/messages/count_tokens`, `/v1/models`.
  - `claudeTranslator.ts`: Pure functional conversion engine for messages, system prompt, tool use schema, multimodal images/documents, thinking modes, and ephemeral instructions.
  - `streamTranscoder.ts`: W3C Web Streams `TransformStream` pipeline converting Gemini SSE chunks to Claude SSE events with zero buffering and low TTFT.
  - `upstreamService.ts`: Direct multi-key rotation (round-robin/weighted), 429 quota exhaustion 60s cooldown circuit breaker, and timeout/abort cancellation.
- **Native Gemini API Proxy (`src/proxy/routes/geminiRoutes.ts`):**
  - Handles `/v1beta/*` and `/v1/models/*` with model mapping and thinking mode suffix (-high) injection.
- **Edge Storage & Administration (`src/admin/`, `src/config/`):**
  - `configManager.ts`: Dynamic configuration provider. Reads defaults from Worker `env`, dynamic overrides from `CONFIG_KV` (key: `runtime_config`), with an in-memory 15s cache TTL.
  - `r2LoggerService.ts`: Non-blocking transaction audit logging via `c.executionCtx.waitUntil(env.LOGS_BUCKET.put(...))`. Saves sanitized JSON into `logs/YYYY-MM-DD/HH/mmss_<transactionId>.json` directory structure compatible with the frontend inspector.
  - `adminRoutes.ts`: Exposes `/api/admin/status`, `/api/admin/config`, `/api/admin/models`, `/api/admin/stats`, `/api/admin/logs`, and `/api/admin/accounts`. Protected by `ADMIN_SECRET_KEY` via `x-admin-key` or `Bearer`.
- **Frontend SPA Hosting (`frontend/`):**
  - Vite React SPA hosted via Worker `[assets]` binding in `wrangler.toml` pointing to `./dist/frontend`.

## Code Style & Guidelines

- **Strict TypeScript & Web Standards**: Rely strictly on standard Web APIs (`Request`, `Response`, `Headers`, `ReadableStream`, `TransformStream`, `fetch`). Never introduce Node.js runtime-specific modules (`fs`, `net`, `http`, `child_process`).
- **Security**: Upstream requests must always pass API keys in the `x-goog-api-key` HTTP header. Never append sensitive API keys as URL query parameters (`?key=`).
- **Sanitization**: All logs written to R2 or console must be sanitized via `sanitizeData()` to mask API keys and authorization tokens.
- **Testing**: Write Vitest unit and integration test suites using `app.request()` for fast, deterministic verification without port binding.
