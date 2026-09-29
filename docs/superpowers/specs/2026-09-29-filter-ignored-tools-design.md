# Filter Ignored Tools in Claude Translation Design

**Date:** 2026-09-29
**Status:** Approved

## 1. Goal
When translating Anthropic Claude Messages API requests to Google Gemini requests, automatically filter out unnecessary or Claude-internal tools (such as `Artifact`, `ArtifactCheck`, `ArtifactData`, `ArtifactComments`) so they are not declared in `functionDeclarations` sent to upstream Gemini. This saves prompt tokens and prevents upstream models from generating calls to tools that cannot be executed downstream.

## 2. Requirements & Behavior

1. **Configuration**:
   - Built-in default ignored tools:
     ```typescript
     export const DEFAULT_IGNORED_TOOLS = [
       'Artifact',
       'ArtifactCheck',
       'ArtifactData',
       'ArtifactComments'
     ];
     ```
   - Configurable via environment variable `IGNORED_TOOLS` (supporting JSON array, comma-separated, or newline-separated strings).
   - Integrated into `config/default.ts` under `config.ignoredTools` with zero-cache dynamic access and `updateConfig` support.

2. **Translation Filtering in `claudeTranslator.ts`**:
   - In `translateClaudeToGoogle`:
     - Inspect `claudeBody.tools`.
     - Case-insensitive comparison against `config.ignoredTools`.
     - Strip out any tool whose `name` matches an entry in the ignored tools set.
     - If after filtering, valid tools remain, declare them under `googleRequest.tools[0].functionDeclarations`.
     - If after filtering no valid tools remain (or original `claudeBody.tools` only contained ignored tools), omit `googleRequest.tools` entirely from the Gemini request.

3. **Per-turn / Scope**:
   - Historical messages are not mutated (per user decision).
   - `_coerceArguments` continues to safely handle the original tools array.

## 3. Testing
- Test default tools filtering (`Artifact`, `ArtifactCheck`, `ArtifactData`, `ArtifactComments`).
- Test case-insensitivity (`artifact`, `ARTIFACT_CHECK`).
- Test custom config override (`config.ignoredTools`).
- Test empty `googleRequest.tools` when all tools are filtered.
- Test that non-ignored tools pass through untouched.
