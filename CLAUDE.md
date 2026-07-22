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
  - Extracts the Gemini API Key from headers (`x-api-key`, `Authorization: Bearer <key>`, `x-goog-api-key`, or `query.key`) and proxies it upstream.
  - Automatically filters/sanitizes internal mapping metadata (`gemini_mapping`) when returning available models.

- **Translation Service (`src/services/claudeTranslator.ts`):**
  - **JSON Schema Translation**: Recursively converts Claude tool schemas to Gemini-compatible specifications (handling upper-casing, type transformations, and stripping unsupported features like `$schema`, `additionalProperties`, etc.).
  - **System Message Mapping**: Handles `system` prompt blocks and wraps inline system history roles as `user` content enclosed in `<system-reminder>` tags to maintain pure chronological turn orders.
  - **Special Skill Substitution Hook**: Intercepts `Skill` tool uses and substitutes the subsequently received instructions directly into the tool result. This maintains robust behavior under Claude Code workflows, preventing Gemini empty responses.
  - **Thinking Mode Mapping**: Maps Claude's `thinking` parameters to Gemini's thinking budget and includes thoughts token usage calculations in response token counts.

- **Payload Debug Logger (`src/services/payloadLogger.ts`):**
  - Asynchronously saves JSON transaction details (client requests/responses and Gemini requests/responses) into `data/debug/transaction_<id>.json`.

### Configuration Files

- `config/models.json`: **Source of truth for supported models.** Generated directly from native Gemini API model listings. Modifying this adds transparent pass-through support. *Avoid hardcoding model names in the codebase; update this file instead.*
- `config/default.ts`: Standard Express app configuration using environment variables from `.env` (`PORT`, `GEMINI_BASE_URL`, `LOG_LEVEL`).

## Code Style & Guidelines

- **Strict TypeScript**: Maintain strict TypeScript patterns. Ensure complete type safety and update `src/types/index.ts` first when adding support for new API payload extensions.
- **Data & Logic Separation**: Do not hardcode new model translations. Update `config/models.json` to declare new models or aliases.
- **Testing**: Every translator feature should have corresponding assertion test suites inside `tests/claudeTranslator.test.ts` or as a standalone integration test. Ensure mock headers are set appropriately in `supertest` routes.
