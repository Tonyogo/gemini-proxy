# Design Spec: Side-by-Side Preview & Raw Split Logs Inspector

## Executive Summary
This design specifies the Chrome DevTools-inspired Side-by-Side Split Logs Inspector with a dual Preview / Raw JSON mode for `gemini-proxy`.

The goal is to provide developers with a clear, simultaneous comparison between incoming Claude API messages and outgoing translated Gemini requests/responses.

## Architecture & Layout (`frontend/src/components/LogsView.tsx`)

### 1. Inspector Toolbar
- **View Mode Switcher**:
  - `Preview Mode` (Default): Parses and renders clean visual cards (System Prompts, Chat Bubbles, Thinking Chains, Tool Calls, Token Usage).
  - `Raw JSON Mode`: Displays formatted JSON code trees for `client_req`, `gem_req`, `gem_res`, and `claude_res`.
- **Transaction Metadata**: Latency duration badge, status code, and model mapping overview.

### 2. Side-by-Side Split Grid (50% / 50%)
- **Left Column: Claude API Protocol**
  - **Request**: Client System Prompts, User/Assistant Messages, Tool definitions.
  - **Response**: Generated Claude Assistant text, thinking chain blocks, token usage.
- **Right Column: Gemini API Protocol**
  - **Request**: Mapped `systemInstruction`, converted `contents` (`parts`: text, inlineData, functionCall), `generationConfig` (temperature, topP, thinkingConfig).
  - **Response**: Gemini native `candidates`, `finishReason`, `usageMetadata`.

## UI/UX Feature Highlights
1. **Chat Bubble Rendering**: Message history rendered as clean, alternating user/assistant cards.
2. **Thinking Chain Support**: CoT (Chain of Thought / thinking blocks) rendered inside collapsible "💭 Thinking Process" panels with distinct styling.
3. **Structured Tool Invocations**: Visual tags highlighting `tool_use` and `functionCall` parameters.
