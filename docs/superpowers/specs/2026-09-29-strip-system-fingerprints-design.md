# Strip Claude System Prompt Fingerprints Design

**Goal:** Prevent upstream detection and proxy fingerprinting by sanitizing Claude system prompts: dropping blocks with `x-anthropic-billing-header` completely and neutralizing identity/attribution fingerprints when `STRIP_SYSTEM_FINGERPRINTS` is enabled.

## Requirements

1. **Configuration**:
   - `STRIP_SYSTEM_FINGERPRINTS` (boolean, default: `true`).
   - Can be configured via environment variable `STRIP_SYSTEM_FINGERPRINTS` (`'false'` disables it; anything else or undefined defaults to `true`).
   - Integrated into `config/default.ts` with support for dynamic `updateConfig()`.

2. **Sanitization Logic in `claudeTranslator.ts`**:
   - Applies to `claudeBody.system` and any `role === 'system'` messages (whether converted to `systemInstruction` via `systemRoleToInstruction` or wrapped in user message turns).
   - If `config.stripSystemFingerprints` is `false`, leaves content untouched.
   - **Billing Header Drop (Option A)**:
     - If the text starts with `x-anthropic-billing-header` (case-insensitive, optional leading whitespace), the entire system content/block is dropped completely (`null`).
   - **Identity & Attribution Neutralization**:
     - Replace `You are Claude Code, Anthropic's official CLI for Claude.` -> `You are an AI code assistant.`
     - Replace `You are Claude, a large language model created by Anthropic.` -> `You are an AI assistant.`
     - Strip Git commit attribution instructions (e.g., `End git commit messages with:\s*\n- Co-Authored-By: Claude Code...` and `🤖 Generated with [Claude Code]...`).
     - Neutralize explicit remaining mentions of `Claude Code` -> `AI Assistant`, `Anthropic` -> `AI`.
     - Compress multiple consecutive newlines.
