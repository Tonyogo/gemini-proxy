# Ephemeral Messages Cleanup Design Specification

## Overview
This specification details the design for automatically filtering ephemeral/temporary prompt messages (such as `"[Your previous response had no visible output. Please continue and produce a user-visible response.]"`) from historical conversation turns before converting Claude API requests to Gemini API requests.

The feature preserves ephemeral messages when they are the latest user turn in an active conversation, but removes them when they become historical turns.

## Architecture & Design

### 1. Configuration & Runtime Management
- **Configuration Key**: `ephemeralMessages: string[]`
- **Default Value**:
  ```json
  [
    "[Your previous response had no visible output. Please continue and produce a user-visible response.]"
  ]
  ```
- **Environment Variable**: `EPHEMERAL_MESSAGES`
  - Accepts a JSON array string `["..."]` or newline-separated values.
- **Runtime Overrides**:
  - Dynamically updated via `updateConfig({ ephemeralMessages: [...] })`.
  - Persisted to `config/runtime.json` (or `runtime.test.json` during test runs).

### 2. Translator Pre-Filtering Pipeline (`src/services/claudeTranslator.ts`)

#### Helper Functions
- `_getNormalizedTextContent(content: any): string`:
  - Extracts raw text from message content (string or array of text blocks) and returns `content.trim()`.

#### Filtering Algorithm (`filterEphemeralMessages`)
Before converting `claudeBody.messages` to Gemini `contents`:
1. Retrieve configured `ephemeralList = config.ephemeralMessages || []`. If empty, return messages unchanged.
2. Find `lastUserIndex`: the index of the last message in `claudeBody.messages` where `role === 'user'`.
3. Iterate over `claudeBody.messages`:
   - For message at index `i`:
     - If `i < lastUserIndex` (historical message) AND (`role === 'user'` OR `role === 'system'`):
       - If `_getNormalizedTextContent(msg.content)` exact-matches any string in `ephemeralList` (after `.trim()`), filter out this message.
     - Otherwise, preserve the message.
4. Pass the filtered messages list to the remaining translation logic (`systemRoleToInstruction` handling, Gemini `contents` generation, tool result formatting, etc.).

## Testing Strategy

### Unit Tests (`tests/claudeTranslator.test.ts`)
1. **Historical Ephemeral Removal**: Verify that matching `user` and `system` messages prior to `lastUserIndex` are filtered out.
2. **Latest Turn Preservation**: Verify that if the last user message matches an ephemeral string, it is retained.
3. **Dynamic Configuration**: Test updating `config.ephemeralMessages` dynamically and verifying custom string matching.
4. **Regression Suite**: Run `npm test` across all test suites to ensure zero breakage.
