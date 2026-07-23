# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` (compiles TypeScript to `dist/`)
- **Clean**: `npm run clean` (deletes built files in `dist/`)
- **Start Production**: `npm start` (automatically compiles TypeScript via `prestart` before running `dist/src/index.js`)
- **Dev Mode**: `npm run dev` (starts hot-reloading development server via `ts-node-dev`)
- **Run All Tests**: `npm test` (runs complete Jest test suite)
- **Run Single Test**: `npx jest tests/<test-name>.test.ts` (e.g., `npx jest tests/claudeTranslator.test.ts`)

## Architecture & Structure

This is a **stateless, zero-persistence API proxy** that translates Anthropic Claude Messages API requests into Google Gemini (AI Studio) API requests, and translates responses (SSE stream or non-stream) back to Claude format.

### Key Components

- **Routing & Controllers (`src/routes/`, `src/controllers/`):** 
  - Routes incoming `/v1/messages`, `/v1/messages/count_tokens`, `/v1/models`, and `/v1/models/:model_id` requests to `claudeController.ts`.
  - Extracts the Gemini API Key from incoming headers (`x-api-key`, `Authorization: Bearer <key>`, `x-goog-api-key`, or `query.key`) and passes it exclusively via the `x-goog-api-key` HTTP header to upstream Gemini endpoints.
  - Automatically filters/sanitizes internal mapping metadata (`gemini_mapping`) when returning available models.

- **Translation Service (`src/services/claudeTranslator.ts`):**
  - **JSON Schema Translation**: Recursively converts Claude tool schemas to Gemini-compatible specifications (handling upper-casing, type transformations, and stripping unsupported features like `$schema`, `additionalProperties`, etc.).
  - **System Message Mapping**: Handles `system` prompt blocks and wraps inline system history roles as `user` content enclosed in `<system-reminder>` tags to maintain pure chronological turn orders.
  - **Special Skill Substitution Hook**: Intercepts `Skill` tool uses and substitutes the subsequently received instructions directly into the tool result. This maintains robust behavior under Claude Code workflows, preventing Gemini empty responses.
  - **Thinking Mode Mapping**: Maps Claude's `thinking` parameters to Gemini's thinking budget and includes thoughts token usage calculations in response token counts.

- **Payload Debug Logger (`src/services/payloadLogger.ts`):**
  - Asynchronously saves JSON transaction details (client requests/responses and Gemini requests/responses) partitioned into date/hour subdirectories under `TRANSACTION_LOGS_DIR` (defaults to `logs/YYYY-MM-DD/HH/transaction_<id>.json`).
  - Automatically sanitizes sensitive keys and Bearer tokens via `sanitizeData()` before persisting logs to disk.

### Configuration & Environment Variables

- `config/models.json`: **Source of truth for supported models.** Modifying or declaring new models/aliases adds transparent pass-through support. *Avoid hardcoding model names in the codebase; update this file instead.*
- `config/default.ts`: Standard Express app configuration using environment variables from `.env`:
  - `PORT`: Proxy server port (default `3000`).
  - `GEMINI_BASE_URL`: Base upstream URL (default `https://generativelanguage.googleapis.com`).
  - `LOG_LEVEL`: Console logging verbosity (`error`, `warn`, `info`, `debug`).
  - `TRANSACTION_LOGS_DIR`: Partitioned log directory path.
  - `CUSTOM_SYSTEM_INSTRUCTION`: Optional custom system instructions injected as supplementary constraints into all upstream calls.
  - `MODEL_MAPPINGS`: Optional JSON mapping dictionary to alias or redirect model requests.

## Code Style & Guidelines

- **Strict TypeScript**: Maintain strict TypeScript patterns. Ensure complete type safety and update `src/types/index.ts` first when adding support for new API payload extensions.
- **Data & Logic Separation**: Do not hardcode new model translations in TypeScript files. Update `config/models.json` or `MODEL_MAPPINGS` to declare new models or aliases.
- **Security**: Upstream requests must always pass API keys in the `x-goog-api-key` HTTP header. Never append sensitive API keys as URL query parameters (`?key=`).
- **Testing**: Every translator feature should have corresponding assertion test suites inside `tests/claudeTranslator.test.ts` or standalone integration test files. Ensure mock headers are set appropriately in `supertest` routes.
