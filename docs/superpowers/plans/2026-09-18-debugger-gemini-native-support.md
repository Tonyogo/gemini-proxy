# Native Gemini API Testing Support in API Debugger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable comprehensive first-class testing of native Google Gemini API endpoints (`/v1beta/models/*:*`, `/v1beta/models`) in the Web Console API Debugger (`PlaygroundView`), including grouped endpoints, URL model interpolation, stream action switching, rich native presets, and dual-protocol response parsing.

**Architecture:** Extend `PlaygroundView.tsx` and `ConcurrentTestModal.tsx` to abstract endpoints into protocol-aware choices (`claude` vs `gemini` vs `custom`), dynamically interpolate the selected model into the endpoint path, link the Stream button to Gemini action suffixes (`:streamGenerateContent?alt=sse` vs `:generateContent`), enrich presets for Gemini native formats (`contents/parts`), update response parsers for Gemini thinking/tools/usage, and extend i18n dictionaries.

**Tech Stack:** React 18, TypeScript, Monaco Editor, Lucide React, Tailwind CSS, Vite.

## Global Constraints

- Preserve existing Claude Messages API debugging flows and presets (`/v1/messages`, `/v1/messages/count_tokens`).
- Strict TypeScript: no `any` leaks where precise types are viable, zero compiler errors under `npm run build:frontend`.
- Zero backend API regressions: all proxy tests must continue to pass (`npm test`).
- Bilingual i18n: all new user-facing labels must exist in both `frontend/src/i18n/locales/zh.ts` and `frontend/src/i18n/locales/en.ts`.
- Security: pass authentication headers with both `x-api-key` and `x-goog-api-key` when executing or copying cURL.

---

### Task 1: Internationalization (i18n) Extensions for Gemini Debugging

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts:255-295`
- Modify: `frontend/src/i18n/locales/zh.ts:256-296`

**Interfaces:**
- Produces: i18n keys under `playground.*`:
  - `protocolClaude`: "Claude Protocol" / "Claude 协议"
  - `protocolGemini`: "Gemini Native Protocol" / "Gemini 原生协议"
  - `endpointClaudeMessages`: "POST /v1/messages"
  - `endpointClaudeCountTokens`: "POST /v1/messages/count_tokens"
  - `endpointGeminiGenerate`: "POST /v1beta/models/{model}:generateContent"
  - `endpointGeminiCountTokens`: "POST /v1beta/models/{model}:countTokens"
  - `endpointGeminiListModels`: "GET /v1beta/models"
  - `presetGeminiBasicChat`: "Gemini Chat" / "Gemini 基础对话"
  - `presetGeminiSystemInstruction`: "System Instruction" / "系统指令与生成配置"
  - `presetGeminiToolUse`: "Function Calling" / "原生工具调用 (Function Call)"
  - `presetGeminiVision`: "Multimodal Vision" / "多模态视觉理解"
  - `presetGeminiThinking`: "Thinking Mode" / "思维链模式 (CoT)"

- [x] **Step 1: Update English translations dictionary**

In `frontend/src/i18n/locales/en.ts`, add the new keys under `playground`:
```typescript
    protocolClaude: "Anthropic Claude API",
    protocolGemini: "Google Gemini Native API",
    endpointClaudeMessages: "POST /v1/messages",
    endpointClaudeCountTokens: "POST /v1/messages/count_tokens",
    endpointGeminiGenerate: "POST /v1beta/models/{model}:generateContent",
    endpointGeminiCountTokens: "POST /v1beta/models/{model}:countTokens",
    endpointGeminiListModels: "GET /v1beta/models",
    presetGeminiBasicChat: "Gemini Chat (Stream)",
    presetGeminiSystemInstruction: "System Instruction & Config",
    presetGeminiToolUse: "Function Calling (Tools)",
    presetGeminiVision: "Multimodal Vision (Image)",
    presetGeminiThinking: "Thinking Mode (CoT)",
```

- [x] **Step 2: Update Chinese translations dictionary**

In `frontend/src/i18n/locales/zh.ts`, add the matching keys under `playground`:
```typescript
    protocolClaude: "Anthropic Claude 协议",
    protocolGemini: "Google Gemini 原生协议",
    endpointClaudeMessages: "POST /v1/messages",
    endpointClaudeCountTokens: "POST /v1/messages/count_tokens",
    endpointGeminiGenerate: "POST /v1beta/models/{model}:generateContent",
    endpointGeminiCountTokens: "POST /v1beta/models/{model}:countTokens",
    endpointGeminiListModels: "GET /v1beta/models",
    presetGeminiBasicChat: "Gemini 对话 (流式)",
    presetGeminiSystemInstruction: "系统指令与生成配置",
    presetGeminiToolUse: "原生工具调用 (Function Call)",
    presetGeminiVision: "多模态视觉理解",
    presetGeminiThinking: "思维链模式 (CoT)",
```

- [x] **Step 3: Verify TypeScript compilation**

Run: `npm run build:frontend`
Expected: Build passes without type mismatch in i18n dictionaries.

- [x] **Step 4: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add playground gemini native translations"
```

---

### Task 2: Implement Endpoint Definitions, Types and Gemini Native Presets

**Files:**
- Create: `frontend/src/utils/playgroundPresets.ts`
- Test / Verify: `npm run build:frontend`

**Interfaces:**
- Produces:
  - `type EndpointOption = 'claude_messages' | 'claude_count_tokens' | 'gemini_generate_content' | 'gemini_count_tokens' | 'gemini_models_list' | 'custom'`
  - `type ProtocolType = 'claude' | 'gemini' | 'custom'`
  - `type PresetKey = 'basicChat' | 'toolUse' | 'vision' | 'thinkingMode' | 'geminiBasicChat' | 'geminiSystemInstruction' | 'geminiToolUse' | 'geminiVision' | 'geminiThinking'`
  - `const CLAUDE_PRESETS: Record<string, any>`
  - `const GEMINI_PRESETS: Record<string, any>`
  - `function getProtocolForEndpoint(option: EndpointOption): ProtocolType`
  - `function resolveTargetEndpoint(params: { option: EndpointOption, model: string, isStream: boolean, customMethod: string, customPath: string }): { url: string, method: string, protocol: ProtocolType }`

- [x] **Step 1: Create `playgroundPresets.ts` module**

Write `frontend/src/utils/playgroundPresets.ts` containing:
```typescript
export type EndpointOption =
  | 'claude_messages'
  | 'claude_count_tokens'
  | 'gemini_generate_content'
  | 'gemini_count_tokens'
  | 'gemini_models_list'
  | 'custom';

export type ProtocolType = 'claude' | 'gemini' | 'custom';

export type ClaudePresetKey = 'basicChat' | 'toolUse' | 'vision' | 'thinkingMode';
export type GeminiPresetKey = 'geminiBasicChat' | 'geminiSystemInstruction' | 'geminiToolUse' | 'geminiVision' | 'geminiThinking';
export type PresetKey = ClaudePresetKey | GeminiPresetKey;

export const CLAUDE_PRESETS: Record<ClaudePresetKey, any> = {
  basicChat: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "Hello! Explain quantum computing in simple terms." }
    ],
    stream: true
  },
  toolUse: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string", description: "City and state, e.g. San Francisco, CA" },
            unit: { type: "string", enum: ["celsius", "fahrenheit"] }
          },
          required: ["location"]
        }
      }
    ],
    messages: [
      { role: "user", content: "What is the weather in Tokyo right now?" }
    ],
    stream: false
  },
  vision: {
    model: "gemini-flash-lite-latest",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          },
          {
            type: "text",
            text: "Describe this 1x1 red pixel image."
          }
        ]
      }
    ],
    stream: true
  },
  thinkingMode: {
    model: "gemini-pro-latest",
    max_tokens: 2048,
    thinking: {
      type: "enabled",
      budget_tokens: 1024
    },
    messages: [
      { role: "user", content: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }
    ],
    stream: true
  }
};

export const GEMINI_PRESETS: Record<GeminiPresetKey, any> = {
  geminiBasicChat: {
    contents: [
      {
        role: "user",
        parts: [{ text: "Hello! Explain quantum computing in simple terms." }]
      }
    ]
  },
  geminiSystemInstruction: {
    systemInstruction: {
      parts: [{ text: "You are a witty, helpful AI assistant." }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: "Who are you and what can you do?" }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024
    }
  },
  geminiToolUse: {
    contents: [
      {
        role: "user",
        parts: [{ text: "What is the weather in Tokyo right now?" }]
      }
    ],
    tools: [
      {
        functionDeclarations: [
          {
            name: "get_weather",
            description: "Get the current weather for a location",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string", description: "City and state, e.g. San Francisco, CA" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] }
              },
              required: ["location"]
            }
          }
        ]
      }
    ]
  },
  geminiVision: {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
          },
          { text: "Describe this 1x1 red pixel image." }
        ]
      }
    ]
  },
  geminiThinking: {
    contents: [
      {
        role: "user",
        parts: [{ text: "Solve this riddle: I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?" }]
      }
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 1024
      }
    }
  }
};

export const GEMINI_COUNT_TOKENS_PRESET = {
  contents: [
    {
      role: "user",
      parts: [{ text: "Hello! Count the tokens in this message." }]
    }
  ]
};

export function getProtocolForEndpoint(option: EndpointOption): ProtocolType {
  if (option.startsWith('claude_')) return 'claude';
  if (option.startsWith('gemini_')) return 'gemini';
  return 'custom';
}

export function resolveTargetEndpoint(params: {
  option: EndpointOption;
  model: string;
  isStream: boolean;
  customMethod: string;
  customPath: string;
}): { url: string; method: string; protocol: ProtocolType } {
  const { option, model, isStream, customMethod, customPath } = params;
  const protocol = getProtocolForEndpoint(option);

  switch (option) {
    case 'claude_messages':
      return { url: '/v1/messages', method: 'POST', protocol: 'claude' };
    case 'claude_count_tokens':
      return { url: '/v1/messages/count_tokens', method: 'POST', protocol: 'claude' };
    case 'gemini_generate_content':
      return {
        url: isStream
          ? `/v1beta/models/${model}:streamGenerateContent?alt=sse`
          : `/v1beta/models/${model}:generateContent`,
        method: 'POST',
        protocol: 'gemini'
      };
    case 'gemini_count_tokens':
      return {
        url: `/v1beta/models/${model}:countTokens`,
        method: 'POST',
        protocol: 'gemini'
      };
    case 'gemini_models_list':
      return {
        url: '/v1beta/models',
        method: 'GET',
        protocol: 'gemini'
      };
    case 'custom': {
      const cleanPath = customPath.startsWith('/') ? customPath : `/${customPath}`;
      return {
        url: cleanPath,
        method: customMethod.toUpperCase(),
        protocol: 'custom'
      };
    }
  }
}
```

- [x] **Step 2: Verify TypeScript compilation**

Run: `npm run build:frontend`
Expected: Compiles cleanly with zero errors.

- [x] **Step 3: Commit**

```bash
git add frontend/src/utils/playgroundPresets.ts
git commit -m "feat(playground): add endpoint resolvers and gemini native presets"
```

---

### Task 3: Upgrade `PlaygroundView.tsx` Control Bar & State Logic

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx`

**Interfaces:**
- Consumes: `playgroundPresets.ts` (`EndpointOption`, `getProtocolForEndpoint`, `resolveTargetEndpoint`, `CLAUDE_PRESETS`, `GEMINI_PRESETS`)
- Updates:
  - `endpointOption` state initialized to `'claude_messages'` (supporting backward compatibility).
  - `geminiStreamEnabled` state (`true` by default) controlling Gemini `:streamGenerateContent?alt=sse` vs `:generateContent`.
  - Stream toggle button UI: handles both Claude (`stream` payload field) and Gemini (`geminiStreamEnabled` switch).
  - Presets dropdown: dynamically lists Claude presets when `protocol === 'claude'`, or Gemini presets when `protocol === 'gemini'`.
  - cURL generator: uses `resolveTargetEndpoint` and injects `-H "x-goog-api-key"` alongside `-H "x-api-key"`.

- [x] **Step 1: Refactor PlaygroundView state & imports**

Import definitions from `../utils/playgroundPresets`.
Replace local `EndpointOption`, `PRESETS`, `DEFAULT_PRESETS` with imports.
Add `geminiStreamEnabled` boolean state (default: `true`).

- [x] **Step 2: Wire up Dynamic Endpoint Resolution & Stream Toggle**

Update `isStreamChecked`:
- If protocol is `'claude'`: `Boolean(memoizedParsedPayload && memoizedParsedPayload.stream === true)`
- If protocol is `'gemini'`: `geminiStreamEnabled`
- If protocol is `'custom'`: `Boolean(memoizedParsedPayload && memoizedParsedPayload.stream === true)`

Update `handleToggleStreamInBody`:
- If protocol is `'claude'` or `'custom'`: toggles `stream` in `requestBody`.
- If protocol is `'gemini'`: sets `setGeminiStreamEnabled(!geminiStreamEnabled)`.

- [x] **Step 3: Update Endpoint Dropdown with `<optgroup>`**

Render:
```tsx
<select
  value={endpointOption}
  onChange={(e) => handleEndpointOptionChange(e.target.value as EndpointOption)}
  className="bg-transparent text-xs text-[var(--text-primary)] focus:outline-none font-mono cursor-pointer truncate w-full"
>
  <optgroup label={t('playground.protocolClaude')}>
    <option value="claude_messages">POST /v1/messages</option>
    <option value="claude_count_tokens">POST /v1/messages/count_tokens</option>
  </optgroup>
  <optgroup label={t('playground.protocolGemini')}>
    <option value="gemini_generate_content">{`POST /v1beta/models/${selectedModel}:generateContent`}</option>
    <option value="gemini_count_tokens">{`POST /v1beta/models/${selectedModel}:countTokens`}</option>
    <option value="gemini_models_list">GET /v1beta/models</option>
  </optgroup>
  <optgroup label={t('playground.customEndpoint')}>
    <option value="custom">{t('playground.customEndpoint')}</option>
  </optgroup>
</select>
```

- [x] **Step 4: Update Presets Dropdown and Endpoint Change Handler**

When `handleEndpointOptionChange(option)` is called:
- If switched to `gemini_generate_content`: load `GEMINI_PRESETS.geminiBasicChat`, set active preset to `'geminiBasicChat'`.
- If switched to `gemini_count_tokens`: load `GEMINI_COUNT_TOKENS_PRESET`.
- If switched to `gemini_models_list`: clear request body or set to empty (since it's a GET request).
- If switched to `claude_messages`: load `CLAUDE_PRESETS.basicChat`, set active preset to `'basicChat'`.

Presets dropdown displays:
- When protocol is `'claude'`: `basicChat`, `toolUse`, `vision`, `thinkingMode`
- When protocol is `'gemini'` and option is `'gemini_generate_content'`: `geminiBasicChat`, `geminiSystemInstruction`, `geminiToolUse`, `geminiVision`, `geminiThinking`.

- [x] **Step 5: Verify build**

Run: `npm run build:frontend`
Expected: Build succeeds.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): integrate grouped endpoints and protocol-aware stream toggle"
```

---

### Task 4: Enhance Response Parsers, cURL Export & Request Execution for Native Gemini

**Files:**
- Modify: `frontend/src/components/PlaygroundView.tsx`

**Interfaces:**
- Consumes: `resolveTargetEndpoint`, `responseStreamChunks`, `responseJson`
- Updates:
  - `handleCopyCurl`: uses `resolveTargetEndpoint` to compute target URL and method, adds `x-goog-api-key`.
  - `handleSend`: uses `resolveTargetEndpoint`, handles SSE chunks without requiring Claude-specific structures, captures `usageMetadata.candidatesTokenCount` or `totalTokenCount`.
  - `parsedMessageView`: detects and formats Gemini `candidates[0].content.parts`, extracting `part.text`, `part.thought`, `part.functionCall`.

- [x] **Step 1: Update `handleCopyCurl`**

Refactor `handleCopyCurl`:
```typescript
const { url: resolvedPath, method: targetMethod, protocol } = resolveTargetEndpoint({
  option: endpointOption,
  model: selectedModel,
  isStream: isStreamChecked,
  customMethod,
  customPath
});
const origin = window.location.origin;
const targetUrl = `${origin}${resolvedPath}`;

const apiKeyToUse = effectiveApiKey || 'YOUR_ADMIN_SECRET_KEY';
const headers = [
  `-H "x-api-key: ${apiKeyToUse}"`,
  `-H "x-admin-key: ${apiKeyToUse}"`,
  `-H "Content-Type: application/json"`
];
if (protocol === 'gemini') {
  headers.push(`-H "x-goog-api-key: ${apiKeyToUse}"`);
}
```

- [x] **Step 2: Update `handleSend` for Native SSE and Non-stream Gemini Responses**

Ensure that:
1. `fetchOptions.headers` includes `'x-goog-api-key': effectiveApiKey`.
2. Target URL is obtained from `resolveTargetEndpoint`.
3. If method is `GET`, do not attach request body.
4. Stream processing handles SSE formatted `data: { ... }` from Gemini upstream (which outputs Gemini candidate chunks), extracting `usageMetadata.candidatesTokenCount || usageMetadata.totalTokenCount`.

- [x] **Step 3: Update `parsedMessageView` for Gemini native candidates & thoughts**

Ensure `parsedMessageView`:
```typescript
// For streaming chunks:
if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
  for (const part of chunk.candidates[0].content.parts) {
    if (part.thought) {
      thinking += part.thought;
    } else if (part.text) {
      text += part.text;
    }
    if (part.functionCall) {
      toolCalls.push(part.functionCall);
    }
  }
}
// For non-streaming responseJson:
if (responseJson?.candidates && responseJson.candidates[0]?.content?.parts) {
  for (const part of responseJson.candidates[0].content.parts) {
    if (part.thought) {
      thinking += part.thought;
    } else if (part.text) {
      text += part.text;
    }
    if (part.functionCall) {
      toolCalls.push(part.functionCall);
    }
  }
}
// Token usage:
if (responseJson?.usageMetadata) {
  const meta = responseJson.usageMetadata;
  const count = meta.candidatesTokenCount || meta.totalTokenCount;
  if (count) setTokenCount(count);
}
```

- [x] **Step 4: Verify Frontend Build**

Run: `npm run build:frontend`
Expected: Build succeeds without TypeScript or Vite errors.

- [x] **Step 5: Commit**

```bash
git add frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): enhance response parsing and curl generation for gemini native"
```

---

### Task 5: Adapt `ConcurrentTestModal` for Gemini Native Endpoints

**Files:**
- Modify: `frontend/src/components/ConcurrentTestModal.tsx`
- Modify: `frontend/src/components/PlaygroundView.tsx:891-899`

**Interfaces:**
- Consumes: target URL, method, and payload from `PlaygroundView`
- Updates:
  - Correctly sets target URL to non-streaming endpoint (`:generateContent`) when testing Gemini native generation.
  - Ensures `stream: false` is only injected into Claude payloads and not into native Gemini `contents` payloads.
  - Passes `x-goog-api-key` in `fetchOptions.headers`.
  - Replaces `{model}` in URL if the user switches target model inside the modal.

- [x] **Step 1: Update `ConcurrentTestModal.tsx` request logic**

In `ConcurrentTestModal.tsx`:
1. Check if `targetUrl.includes('/v1beta/models/')`:
   - If so, update the model in the URL path when `targetModel` changes (e.g., `targetUrl.replace(/\/models\/[^:/?]+/, `/models/${targetModel}`)`).
   - Do NOT inject `testPayload.stream = false;`.
   - Ensure the URL action is `:generateContent` rather than `:streamGenerateContent`.
2. In `executeSingleRequest`:
   - Add `'x-goog-api-key': apiKey` to headers.

- [x] **Step 2: Update `ConcurrentTestModal` invocation in `PlaygroundView.tsx`**

Pass resolved non-streaming target URL and method to `ConcurrentTestModal`:
```tsx
const modalTarget = resolveTargetEndpoint({
  option: endpointOption,
  model: selectedModel,
  isStream: false,
  customMethod,
  customPath
});

<ConcurrentTestModal
  isOpen={showConcurrentModal}
  onClose={() => setShowConcurrentModal(false)}
  targetUrl={modalTarget.url}
  targetMethod={modalTarget.method}
  parsedPayload={memoizedParsedPayload}
  apiKey={effectiveApiKey}
/>
```

- [x] **Step 3: Verify Frontend Build and Backend Tests**

Run: `npm run build:frontend && npm test`
Expected: Both frontend compile and backend test suite pass completely.

- [x] **Step 4: Commit**

```bash
git add frontend/src/components/ConcurrentTestModal.tsx frontend/src/components/PlaygroundView.tsx
git commit -m "feat(playground): adapt concurrent test modal for gemini native endpoints"
```

---

### Task 6: End-to-End Build & Verification

**Files:**
- Verify: Full repository build (`npm run build`)
- Verify: Jest test suite (`npm test`)

- [x] **Step 1: Execute Full Clean Build**

Run: `npm run build`
Expected:
1. `npm run build:frontend` generates assets into `dist/frontend`.
2. `npm run build:backend` compiles TypeScript backend into `dist/src`.

- [x] **Step 2: Execute Backend Test Suite**

Run: `npm test`
Expected: All Jest test suites pass.

- [x] **Step 3: Final Verification & Commit**

```bash
git status
git log -n 5 --oneline
```
Verify clean workspace and commit history.
