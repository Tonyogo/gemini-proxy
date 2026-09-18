# Design Doc: Native Gemini API Testing Support in API Debugger (Playground)

- **Date:** 2026-09-18
- **Topic:** Native Gemini API Testing Support in API Debugger (PlaygroundView)
- **Status:** Approved

## 1. Overview & Objectives

Currently, the API Debugger (`PlaygroundView.tsx`) primarily targets Claude-compatible endpoints (`/v1/messages` and `/v1/messages/count_tokens`), using Anthropic message structure (`messages: [{ role, content }]`). Although custom endpoints can be manually specified, testing Google Gemini native API endpoints (under `/v1beta/models/*:*`) requires manual typing of complex URLs, manually adjusting streaming parameters, and crafting native JSON bodies (`contents`, `parts`, `systemInstruction`, `generationConfig`, etc.).

This design enables first-class native Gemini API testing in the Web Console API Debugger, with:
1. Unified grouped endpoint dropdown supporting Claude, Gemini native, and Custom endpoints.
2. Dynamic model name interpolation in Gemini endpoint URLs based on top-bar model selection.
3. Intelligent Stream toggle synchronization (URL action switching for Gemini vs. body payload parameter for Claude).
4. Rich native presets covering Gemini text generation, system instruction, function declarations, multimodal vision, and thinking mode (CoT).
5. Seamless response rendering for Gemini native formats (stream SSE chunks, non-stream candidates, thinking parts, tool calls, and token usage).
6. Accurate cURL command export and Concurrent Stress Test modal adaptation.
7. Full bilingual internationalization (i18n) support (Chinese & English).

---

## 2. Architecture & Detailed Specifications

### 2.1 Endpoint Abstraction & Model Name Interpolation

#### Types
```typescript
export type EndpointOption = 
  | 'claude_messages'
  | 'claude_count_tokens'
  | 'gemini_generate_content'
  | 'gemini_count_tokens'
  | 'gemini_models_list'
  | 'custom';

export type ProtocolType = 'claude' | 'gemini' | 'custom';
```

#### Dropdown Grouping (`<optgroup>`)
- **Anthropic Claude Protocol**:
  - `POST /v1/messages`
  - `POST /v1/messages/count_tokens`
- **Google Gemini Native Protocol**:
  - `POST /v1beta/models/{model}:generateContent`
  - `POST /v1beta/models/{model}:countTokens`
  - `GET /v1beta/models`
- **Custom Endpoint**:
  - `Custom Endpoint...`

#### Endpoint URL Resolver
A pure helper function `getTargetEndpoint(option, model, isStream, customMethod, customPath)`:
- `claude_messages` -> `{ url: '/v1/messages', method: 'POST', protocol: 'claude' }`
- `claude_count_tokens` -> `{ url: '/v1/messages/count_tokens', method: 'POST', protocol: 'claude' }`
- `gemini_generate_content` -> 
  - If `isStream`: `{ url: `/v1beta/models/${model}:streamGenerateContent?alt=sse`, method: 'POST', protocol: 'gemini' }`
  - If non-stream: `{ url: `/v1beta/models/${model}:generateContent`, method: 'POST', protocol: 'gemini' }`
- `gemini_count_tokens` -> `{ url: `/v1beta/models/${model}:countTokens`, method: 'POST', protocol: 'gemini' }`
- `gemini_models_list` -> `{ url: '/v1beta/models', method: 'GET', protocol: 'gemini' }`
- `custom` -> `{ url: customPath.startsWith('/') ? customPath : `/${customPath}`, method: customMethod, protocol: 'custom' }`

When the user selects a different model in the model selector dropdown, any active Gemini endpoint URL referencing `${model}` updates automatically.

---

### 2.2 Stream Toggle & Protocol Linkage

1. **Claude Protocol**:
   - Toggling the Stream button updates the `stream: boolean` field in the Monaco JSON request body.
   - Stream toggle state is derived from `parsedBody.stream === true`.
2. **Gemini Protocol**:
   - Gemini API does not use a `stream` field in the request body. Stream vs. non-stream is determined strictly by the endpoint action (`:streamGenerateContent?alt=sse` vs. `:generateContent`).
   - Clicking the Stream toggle switches an internal `geminiStreamEnabled` boolean state (default: `true`), which automatically updates the resolved endpoint URL.
   - The JSON body in the editor remains clean native Gemini format without an extraneous `stream` key.
3. **Other Endpoints**:
   - The Stream button is hidden or disabled when `endpointOption` is `claude_count_tokens`, `gemini_count_tokens`, `gemini_models_list`, or when `customMethod === 'GET'`.

---

### 2.3 Presets System (Claude & Gemini Native)

Presets dynamically adapt based on the active protocol:

#### A. Claude Presets
1. `basicChat`: Standard conversation with `stream: true`.
2. `toolUse`: Function calling tool definitions.
3. `vision`: Base64 image payload.
4. `thinkingMode`: Extended thinking configuration (`budget_tokens`).

#### B. Gemini Native Presets
1. `geminiBasicChat`:
   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "Hello! Explain quantum computing in simple terms." }]
       }
     ]
   }
   ```
2. `geminiSystemInstruction`:
   ```json
   {
     "systemInstruction": {
       "parts": [{ "text": "You are a witty, helpful AI assistant." }]
     },
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "Who are you and what can you do?" }]
       }
     ],
     "generationConfig": {
       "temperature": 0.7,
       "maxOutputTokens": 1024
     }
   }
   ```
3. `geminiToolUse`:
   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "What is the weather in Tokyo right now?" }]
       }
     ],
     "tools": [
       {
         "functionDeclarations": [
           {
             "name": "get_weather",
             "description": "Get current weather for location",
             "parameters": {
               "type": "object",
               "properties": {
                 "location": { "type": "string" },
                 "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
               },
               "required": ["location"]
             }
           }
         ]
       }
     ]
   }
   ```
4. `geminiVision`:
   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [
           {
             "inlineData": {
               "mimeType": "image/png",
               "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
             }
           },
           { "text": "Describe this 1x1 red pixel image." }
         ]
       }
     ]
   }
   ```
5. `geminiThinking`:
   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "Solve this riddle: I speak without a mouth and hear without ears. What am I?" }]
       }
     ],
     "generationConfig": {
       "thinkingConfig": {
         "thinkingBudget": 1024
       }
     }
   }
   ```
6. `geminiCountTokens`:
   ```json
   {
     "contents": [
       {
         "role": "user",
         "parts": [{ "text": "Hello! Count the tokens in this message." }]
       }
     ]
   }
   ```

---

### 2.4 Response Parsing, Preview & Metrics

The `parsedMessageView` hook is extended to parse both formats cleanly:
- **Text**:
  - Claude: `content[].text` or SSE delta `text_delta`.
  - Gemini: `candidates[0].content.parts[].text` (excluding thinking parts).
- **Thinking Process**:
  - Claude: `content[].thinking` or SSE delta `thinking_delta`.
  - Gemini: `part.thought` or `part.text` when marked as thought.
- **Function / Tool Calls**:
  - Claude: `type === 'tool_use'` -> `{ name: block.name, args: block.input }`.
  - Gemini: `part.functionCall` -> `{ name: part.functionCall.name, args: part.functionCall.args }`.
- **Token Counters**:
  - Claude: `usage.output_tokens`, `usage.input_tokens`.
  - Gemini: `usageMetadata.candidatesTokenCount`, `usageMetadata.promptTokenCount`.

---

### 2.5 cURL Export & Stress Test Modal (`ConcurrentTestModal`)

1. **cURL Export**:
   - Dynamically resolves target URL and method.
   - Adds `-H "x-goog-api-key: ${apiKey}"` alongside `-H "x-api-key: ${apiKey}"` for Gemini compatibility.
   - Produces valid, runnable commands for both protocols.
2. **ConcurrentTestModal**:
   - When running against Gemini endpoints, ensures the target URL uses non-streaming `:generateContent`.
   - Avoids appending `stream: false` into native Gemini bodies.
   - Correctly handles `{model}` replacement for custom concurrency targets.

---

### 2.6 Localization (i18n)
Update `frontend/src/i18n/locales/zh.ts` and `frontend/src/i18n/locales/en.ts` with new translations for:
- Endpoint optgroup labels (`protocolClaude`, `protocolGemini`).
- Gemini preset titles (`presetGeminiBasicChat`, `presetGeminiSystemInstruction`, `presetGeminiToolUse`, `presetGeminiVision`, `presetGeminiThinking`).
- Token count and endpoint labels.

---

## 3. Verification Plan

1. **Frontend Build**: `npm run build:frontend` to verify TypeScript and JSX compilation without errors.
2. **Unit / Integration Tests**: `npm test` to ensure existing backend and proxy routes pass.
3. **Manual Verification**:
   - Switch between Claude and Gemini endpoints in PlaygroundView.
   - Verify model changes dynamically update the Gemini URL.
   - Verify Stream button toggle switches between `:generateContent` and `:streamGenerateContent?alt=sse`.
   - Send requests using Gemini presets (chat, tool call, thinking, vision).
   - Verify preview mode displays text, thinking accordion, tool call cards, and token counts properly.
   - Test "Copy cURL" and verify generated command.
   - Test "Concurrent Stress Test" against Gemini native endpoint.
