# Claude API to Gemini Proxy Design Specification

**Date:** 2026-07-10  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This specification details the design for a lightweight, stateless, high-performance API proxy server called **gemini-proxy**. The proxy acts as a seamless, drop-in replacement for the Anthropic Claude Messages API, taking incoming Claude API requests, converting them into equivalent Google AI Studio (Gemini) API requests, calling the official Google AI Studio endpoints, and translating the responses (streaming or non-streaming) back into Claude format.

---

## 2. Core Requirements
- **Stateless Architecture:** No session databases, browser pools, or rotation queues. Every request is handled entirely in memory.
- **Node.js & Express:** Implemented in lightweight Node.js using the Express framework.
- **Official Google AI Studio Integration:** Calls downstream endpoints at `generativelanguage.googleapis.com` using official Google API keys.
- **API Key Pass-Through:** If the incoming client request provides an API key via the `Authorization: Bearer <key>` header, that key is forwarded to Google. Otherwise, it falls back to the server's `.env`-configured `GEMINI_API_KEY`.
- **Streaming & Non-Streaming Generation:** Seamless translation of standard text, base64 images, tool uses, system prompts, and thinking parameters under both non-streaming and real-time streaming (SSE) modes.
- **Count Tokens Endpoint:** Full support for `/v1/messages/count_tokens`.
- **Robust Error Translation:** Translates Gemini JSON error formats into official Claude Message API error structures.

---

## 3. Project File Structure
```text
gemini-proxy/
├── config/
│   └── default.js             # Configuration loader, model mapping, and port defaults
├── src/
│   ├── routes/
│   │   └── claudeRoutes.js    # Express route mappings for /v1/messages and /v1/messages/count_tokens
│   ├── controllers/
│   │   └── claudeController.js# Request/response controllers, handles AI Studio fetch & streams
│   ├── services/
│   │   └── claudeTranslator.js# The translation logic (adapted from GeminiToAPI's FormatConverter.js)
│   ├── utils/
│   │   └── logger.js          # Standardized simple console logger
│   └── app.js                 # Express application setup (middlewares, router attachment)
├── .env                       # Local secrets & variables (GEMINI_API_KEY, PORT, etc.)
├── index.js                   # Main application entry point (server listener)
├── package.json               # Dependencies and npm scripts
└── README.md                  # Project documentation
```

---

## 4. Key Components Design

### 4.1. Server & Router Configuration (`app.js` & `index.js`)
A minimal Express.js bootstrap that loads environment variables from `.env`, registers `express.json({ limit: '50mb' })` to support large base64 image uploads, registers request-logging middleware, and forwards all requests under `/v1` to `claudeRoutes.js`.

### 4.2. Claude Router (`claudeRoutes.js`)
Configures endpoints:
- `POST /v1/messages` -> mapped to `claudeController.handleMessages`
- `POST /v1/messages/count_tokens` -> mapped to `claudeController.handleCountTokens`

### 4.3. Claude Controller (`claudeController.js`)
Orchestrates the lifecycle of a request:
1. Extract the Claude API request body.
2. Extract the API key from `req.headers.authorization` (Bearer schema). If absent, use `process.env.GEMINI_API_KEY`.
3. Call `claudeTranslator.translateClaudeToGoogle(body)` to obtain the mapped model name, converted Gemini request body, and streaming parameters.
4. Prepare the downstream target URL:
   - For streaming: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={API_KEY}`
   - For non-streaming: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}`
5. Use `node-fetch` or native `fetch` to send the payload.
6. Process the response:
   - **Non-Streaming:** Parse JSON response, call `claudeTranslator.convertGoogleToClaudeNonStream(geminiResponse, model)`, and return HTTP 200 with the Claude-formatted JSON body.
   - **Streaming:** Set headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`. Read the incoming Gemini chunk stream (Server-Sent Events), parse each SSE chunk, pass it to `claudeTranslator.translateGoogleToClaudeStream(chunk, model, state)`, and write the translated event to the client in real-time.
7. Catch any errors, call `claudeTranslator.normalizeError(error)`, and return the appropriate HTTP error code and Claude Error JSON payload.

### 4.4. Claude Translator Service (`claudeTranslator.js`)
Contains the mapping logic, adapted and simplified from the original `FormatConverter.js`:

#### Model Names
Converts common Claude models to Gemini equivalents:
- `claude-3-5-sonnet` / `claude-3-5-sonnet-241022` -> `gemini-2.5-pro`
- `claude-3-5-haiku` / `claude-3-5-haiku-241022` -> `gemini-2.5-flash`
- Default fallback -> `gemini-2.5-flash`

#### System Instruction
Extracts Claude's `system` field and maps it to Gemini's `systemInstruction.parts[0].text`.

#### Message Array & Roles
Maps `messages` array:
- `role: "user"` -> `role: "user"`
- `role: "assistant"` -> `role: "model"`

#### Content Blocks
- **Text:** `block.type === "text"` -> `{ text: block.text }`
- **Images:** `block.type === "image"` -> `{ inlineData: { mimeType: block.source.media_type, data: block.source.data } }`
- **Tool Use:** `block.type === "tool_use"` -> `{ functionCall: { name: block.name, args: block.input } }`
- **Tool Result:** `block.type === "tool_result"` -> Tracks mapping of `tool_use_id` to function names, then builds a Gemini `{ functionResponse: { name, response: { content: block.content } } }`.

#### Thinking Configuration
If Claude `thinking` object is present (e.g. `thinking: { type: "enabled", budget_tokens: 2048 }`), sets the corresponding Gemini request parameters:
- `thinkingConfig: { thinkingBudget: budget_tokens }` (when targeting models like `gemini-2.5-pro` / `gemini-2.5-flash` that support thinking modes).

#### Tools
Maps Claude's `tools` array to Gemini's `tools.functionDeclarations`.

---

## 5. Error Mapping Matrix

| Gemini Response Status / Error | Claude API HTTP Code | Claude Error Type |
|--------------------------------|----------------------|-------------------|
| `HTTP 400` (Validation / Bad Format) | `400` | `invalid_request_error` |
| `HTTP 401 / 403` (Invalid Key) | `401` | `authentication_error` |
| `HTTP 429` (Quota / Rate Limit) | `429` | `rate_limit_error` |
| `HTTP 500` / `503` (Internal Server/Overloaded) | `500` / `503` | `api_error` or `overloaded_error` |

---

## 6. Implementation Milestones & Verification Plan
1. **Milestone 1:** Initialize the repository, package.json, and Express server scaffolding.
2. **Milestone 2:** Implement and unit-test the `claudeTranslator.js` converter for request mapping (text, image, system prompt, tools, thinking).
3. **Milestone 3:** Implement the route handling, integration with Google AI Studio API, and non-streaming generation response.
4. **Milestone 4:** Implement full SSE streaming chunk translation for real-time text and tool-use generation.
5. **Milestone 5:** Implement `/v1/messages/count_tokens` endpoint.
6. **Milestone 6:** End-to-end integration testing using official Python/JS Anthropic SDKs (or cURL requests) pointed to `http://localhost:3000`.
