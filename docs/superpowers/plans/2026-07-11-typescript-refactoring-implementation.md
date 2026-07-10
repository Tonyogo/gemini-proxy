# TypeScript Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entire `gemini-proxy` JavaScript codebase to strict TypeScript with `tsc` compilation to CommonJS output, and `ts-jest` for testing.

**Architecture:** Moves the main entry point to `src/index.ts`. All existing `.js` files in `config/`, `src/`, and `tests/` are renamed to `.ts` and updated with strict type interfaces (`ClaudeRequest`, `GeminiRequest`, etc.) defined in `src/types/index.ts`. Jest is reconfigured to run `.ts` natively without a build step.

**Tech Stack:** Node.js, TypeScript, Jest, ts-jest, Supertest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** `typescript`, `ts-jest`, `@types/node`, `@types/express`, `@types/jest`, `@types/supertest`, `ts-node-dev` must be installed as devDependencies.
- **Framework:** Express.js
- **Statelessness:** Output directory strictly set to `dist/`. Build runs `tsc`.

---

### Task 1: Environment and TypeScript Initialization

Install necessary dependencies, create `tsconfig.json`, `jest.config.js`, update `package.json` scripts, and move the root `index.js` into the `src/` directory as `index.ts`.

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Modify: Move `index.js` to `src/index.ts` and rename `config/default.js` to `config/default.ts`

**Interfaces:**
- Consumes: None (starting task)
- Produces: A ready TypeScript build and testing environment.

- [ ] **Step 1: Update `package.json` dependencies and scripts**
Modify `package.json`:
```json
{
  "name": "gemini-proxy",
  "version": "1.0.0",
  "description": "Stateless Claude-to-Gemini API proxy",
  "main": "dist/src/index.js",
  "type": "commonjs",
  "scripts": {
    "build": "tsc",
    "start": "node dist/src/index.js",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "test": "jest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "node-fetch": "^2.7.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "typescript": "^5.4.5",
    "ts-node-dev": "^2.0.0",
    "ts-jest": "^29.1.2",
    "@types/node": "^20.12.7",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/supertest": "^6.0.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "rootDir": "./",
    "outDir": "./dist",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "config/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `jest.config.js`**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  clearMocks: true
};
```

- [ ] **Step 4: Rename configurations and entry points to TypeScript**
Run exact commands:
```bash
npm install
mv index.js src/index.ts
mv config/default.js config/default.ts
```

- [ ] **Step 5: Fix `config/default.ts` and `src/index.ts` syntax for TS**
In `config/default.ts`:
```typescript
import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  defaultModel: process.env.DEFAULT_GEMINI_MODEL || 'gemini-2.5-flash',
  logLevel: process.env.LOG_LEVEL || 'info',
  modelMapping: {
    "claude-3-5-sonnet": "gemini-2.5-pro",
    "claude-3-5-sonnet-20241022": "gemini-2.5-pro",
    "claude-3-5-haiku": "gemini-2.5-flash",
    "claude-3-5-haiku-20241022": "gemini-2.5-flash",
    "claude-3-opus": "gemini-2.5-pro",
    "claude-3-sonnet": "gemini-2.5-flash",
    "claude-3-haiku": "gemini-2.5-flash",
    "claude-opus-4-7": "gemini-2.5-flash",
    "claude-sonnet-4-6": "gemini-2.5-flash-lite"
  } as Record<string, string>,
  allowedKeys: [] as string[]
};
export default config;
```

In `src/index.ts`:
```typescript
import app from './app';
import config from '../config/default';
import logger from './utils/logger';

app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});
```
*(Wait, `app` and `logger` are still `.js` and CommonJS exports, which may complain. We will convert them in the next task).*

- [ ] **Step 6: Commit initialization**
```bash
git add package.json tsconfig.json jest.config.js src/index.ts config/default.ts
git commit -m "build: initialize typescript compilation environment and ts-jest test runner"
```

---

### Task 2: Define Core Typings

Implement standard API interfaces for Claude and Gemini payloads.

**Files:**
- Create: `src/types/index.ts`

**Interfaces:**
- Produces: Globally exported interfaces `ClaudeRequest`, `GeminiRequest`, etc.

- [ ] **Step 1: Write `src/types/index.ts`**
```typescript
export interface ClaudeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | any[];
}

export interface ClaudeRequest {
  model?: string;
  system?: string | any[];
  messages: ClaudeMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  tools?: any[];
  tool_choice?: any;
  output_format?: any;
  output_config?: any;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, any> };
  functionResponse?: { name: string; response: any };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[]; role: 'user' };
  generationConfig?: Record<string, any>;
  thinkingConfig?: { thinkingBudget?: number };
  tools?: any[];
}
```

- [ ] **Step 2: Commit typings**
```bash
git add src/types/index.ts
git commit -m "feat: declare strict typescript interfaces for claude and gemini api payloads"
```

---

### Task 3: Refactor Services and Utilities to TypeScript

Rename and refactor `logger.js`, `payloadLogger.js`, and `claudeTranslator.js` to TypeScript.

**Files:**
- Modify: `src/utils/logger.ts` (renamed from .js)
- Modify: `src/services/payloadLogger.ts` (renamed from .js)
- Modify: `src/services/claudeTranslator.ts` (renamed from .js)

**Interfaces:**
- Consumes: Typings from `src/types/index.ts`.

- [ ] **Step 1: Rename files**
```bash
mv src/utils/logger.js src/utils/logger.ts
mv src/services/payloadLogger.js src/services/payloadLogger.ts
mv src/services/claudeTranslator.js src/services/claudeTranslator.ts
```

- [ ] **Step 2: Refactor `src/utils/logger.ts`**
```typescript
import config from '../../config/default';

const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const log = (level: string, message: string) => {
  if (levels[level] <= currentLevel) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
  }
};

const logger = {
  error: (msg: string) => log('error', msg),
  warn: (msg: string) => log('warn', msg),
  info: (msg: string) => log('info', msg),
  debug: (msg: string) => log('debug', msg)
};

export default logger;
```

- [ ] **Step 3: Refactor `src/services/payloadLogger.ts`**
```typescript
import { promises as fs } from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

class PayloadLogger {
  private debugDir: string;
  private initialized: boolean;

  constructor() {
    this.debugDir = path.join(process.cwd(), 'data', 'debug');
    this.initialized = false;
  }

  private async _ensureDirectory(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      this.initialized = true;
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to create debug directory: ${err.message}`);
    }
  }

  public async saveTransaction(transactionId: string, clientReq: any, gemReq: any, gemRes: any): Promise<void> {
    try {
      await this._ensureDirectory();

      const payload = {
        client_req: clientReq || null,
        gem_req: gemReq || null,
        gem_res: gemRes || null
      };

      const filePath = path.join(this.debugDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: transaction_${transactionId}.json`);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

export default new PayloadLogger();
```

- [ ] **Step 4: Refactor `src/services/claudeTranslator.ts`**
Add ESM imports and parameter types `any` where complex.
```typescript
import config from '../../config/default';
import logger from '../utils/logger';
import { ClaudeRequest, GeminiRequest, GeminiContent, GeminiPart } from '../types';

class ClaudeTranslator {
  public _convertSchemaToGemini(obj: any, isResponseSchema: boolean = false, isProperties: boolean = false): any {
    if (!obj || typeof obj !== "object") return obj;

    const result: any = Array.isArray(obj) ? [] : {};

    for (const key of Object.keys(obj)) {
      const unsupportedKeys = [
        "$schema", "additionalProperties", "ref", "$ref", "propertyNames",
        "patternProperties", "unevaluatedProperties", "exclusiveMinimum",
        "exclusiveMaximum", "const", "$comment", "enumDescriptions"
      ];

      if (isResponseSchema) {
        unsupportedKeys.push("default", "examples", "$defs", "id");
      }

      if (!isProperties && unsupportedKeys.includes(key)) {
        continue;
      }

      if (key === "anyOf" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const variants = obj[key];
          const hasNull = variants.some((v: any) => v.type === "null");
          const nonNullVariants = variants.filter((v: any) => v.type !== "null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullVariants.length === 1) {
            const converted = this._convertSchemaToGemini(nonNullVariants[0], isResponseSchema, false);
            Object.assign(result, converted);
            if (hasNull) result.nullable = true;
            continue;
          } else if (nonNullVariants.length > 0) {
            result.anyOf = nonNullVariants.map((v: any) =>
              this._convertSchemaToGemini(v, isResponseSchema, false)
            );
            continue;
          } else if (hasNull) {
            continue;
          }
        }
      }

      if (key === "type" && !isProperties) {
        if (Array.isArray(obj[key])) {
          const types = obj[key];
          const nonNullTypes = types.filter((t: any) => t !== "null");
          const hasNull = types.includes("null");

          if (hasNull) {
            result.nullable = true;
          }

          if (nonNullTypes.length === 1) {
            result[key] = nonNullTypes[0].toUpperCase();
          } else if (nonNullTypes.length > 1) {
            if (isResponseSchema) {
              result.anyOf = nonNullTypes.map((t: any) => ({
                type: t.toUpperCase(),
              }));
            } else {
              result[key] = nonNullTypes.map((t: any) => t.toUpperCase());
            }
          } else {
            result[key] = "STRING";
          }
        } else if (typeof obj[key] === "string") {
          result[key] = obj[key].toUpperCase();
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, false);
        } else {
          result[key] = obj[key];
        }
      } else if (key === "enum" && !isProperties) {
        if (isResponseSchema) {
          if (Array.isArray(obj[key])) {
            result[key] = obj[key].map(String);
          } else if (obj[key] !== undefined && obj[key] !== null) {
            result[key] = [String(obj[key])];
          }
          result["type"] = "STRING";
        } else {
          result[key] = obj[key];
        }
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        const nextIsProperties = key === "properties";
        const recursionFlag = isProperties ? false : nextIsProperties;

        result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, recursionFlag);
      } else {
        result[key] = obj[key];
      }
    }

    return result;
  }

  public translateClaudeToGoogle(claudeBody: ClaudeRequest) {
    const rawModel = claudeBody.model || config.defaultModel;
    const cleanModelName = config.modelMapping[rawModel] || config.defaultModel;

    let systemInstruction: any = null;

    const appendSystemContent = (content: any) => {
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        text = content
          .map((block: any) => {
            if (typeof block === "string") return block;
            if (block && block.type === "text") return block.text || "";
            return block?.text || "";
          })
          .filter(Boolean)
          .join("\n");
      }

      if (!text) return;

      if (systemInstruction) {
        systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n${text}`;
      } else {
        systemInstruction = {
          parts: [{ text }],
          role: "user"
        };
      }
    };

    if (claudeBody.system) {
      appendSystemContent(claudeBody.system);
    }

    const contents: GeminiContent[] = [];
    const toolIdToNameMap = new Map<string, string>();

    if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
      for (const msg of claudeBody.messages) {
        if (msg.role === 'system') {
          appendSystemContent(msg.content);
          continue;
        }

        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: GeminiPart[] = [];

        if (typeof msg.content === 'string') {
          parts.push({ text: msg.content });
        } else if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                inlineData: {
                  mimeType: block.source.media_type,
                  data: block.source.data
                }
              });
            } else if (block.type === 'tool_use') {
              toolIdToNameMap.set(block.id, block.name);
              parts.push({
                functionCall: {
                  name: block.name,
                  args: block.input || {}
                }
              });
            } else if (block.type === 'tool_result') {
              const matchedName = toolIdToNameMap.get(block.tool_use_id) || 'unknown_tool';
              parts.push({
                functionResponse: {
                  name: matchedName,
                  response: { content: block.content }
                }
              });
            }
          }
        }
        contents.push({ role, parts });
      }
    }

    const googleRequest: GeminiRequest = { contents };
    if (systemInstruction) {
      googleRequest.systemInstruction = systemInstruction;
    }

    const generationConfig: any = {};
    if (claudeBody.max_tokens) {
      generationConfig.maxOutputTokens = claudeBody.max_tokens;
    }
    if (claudeBody.temperature !== undefined) {
      generationConfig.temperature = claudeBody.temperature;
    }
    if (claudeBody.top_p !== undefined) {
      generationConfig.topP = claudeBody.top_p;
    }
    if (Object.keys(generationConfig).length > 0) {
      googleRequest.generationConfig = generationConfig;
    }

    if (claudeBody.thinking && claudeBody.thinking.type === 'enabled') {
      googleRequest.thinkingConfig = {
        thinkingBudget: claudeBody.thinking.budget_tokens || 1024
      };
    }

    if (claudeBody.tools && Array.isArray(claudeBody.tools)) {
      googleRequest.tools = [{
        functionDeclarations: claudeBody.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          parameters: this._convertSchemaToGemini(tool.input_schema)
        }))
      }];
    }

    return {
      googleRequest,
      cleanModelName,
      isStream: claudeBody.stream === true
    };
  }

  public convertGoogleToClaudeNonStream(googleResponse: any, modelName: string) {
    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata || {};

    const content: any[] = [];
    const messageId = `msg_fake_${Math.random().toString(36).substring(2, 11)}`;

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          content.push({
            type: 'thinking',
            thinking: part.text,
            signature: part.thoughtSignature || 'dummy_signature'
          });
        } else if (part.text) {
          content.push({
            type: 'text',
            text: part.text
          });
        } else if (part.functionCall) {
          content.push({
            id: `toolu_fake_${Math.random().toString(36).substring(2, 11)}`,
            type: 'tool_use',
            name: part.functionCall.name,
            input: part.functionCall.args || {}
          });
        }
      }
    }

    if (content.length === 0) {
      content.push({ type: 'text', text: '' });
    }

    let stopReason = 'end_turn';
    if (candidate && candidate.finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    } else if (candidate && candidate.content && candidate.content.parts.some((p: any) => p.functionCall)) {
      stopReason = 'tool_use';
    }

    return {
      id: messageId,
      type: 'message',
      role: 'assistant',
      model: modelName,
      content,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0)
      }
    };
  }

  public translateGoogleToClaudeStream(googleChunk: string, modelName: string, streamState: any) {
    if (!googleChunk || googleChunk.trim() === '') return null;

    let jsonString = googleChunk;
    if (jsonString.startsWith('data: ')) {
      jsonString = jsonString.substring(6).trim();
    }
    if (jsonString === '[DONE]') return null;

    let googleResponse;
    try {
      googleResponse = JSON.parse(jsonString);
    } catch (e) {
      return null;
    }

    const candidate = googleResponse.candidates?.[0];
    const usage = googleResponse.usageMetadata;
    const events: any[] = [];

    if (!streamState.messageId) {
      streamState.messageId = `msg_stream_${Math.random().toString(36).substring(2, 11)}`;
      streamState.contentBlockIndex = 0;
    }

    if (!streamState.messageStartSent) {
      events.push({
        type: 'message_start',
        message: {
          id: streamState.messageId,
          type: 'message',
          role: 'assistant',
          model: modelName,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage ? usage.promptTokenCount || 0 : 0,
            output_tokens: 0
          }
        }
      });
      streamState.messageStartSent = true;
    }

    if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
      for (const part of candidate.content.parts) {
        if (part.thought === true && part.text) {
          if (!streamState.thinkingBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'thinking', thinking: '', signature: part.thoughtSignature || 'dummy' }
            });
            streamState.thinkingBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'thinking_delta', thinking: part.text }
          });
        } else if (part.text) {
          if (streamState.thinkingBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.thinkingBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          if (!streamState.textBlockStarted) {
            events.push({
              type: 'content_block_start',
              index: streamState.contentBlockIndex,
              content_block: { type: 'text', text: '' }
            });
            streamState.textBlockStarted = true;
          }
          events.push({
            type: 'content_block_delta',
            index: streamState.contentBlockIndex,
            delta: { type: 'text_delta', text: part.text }
          });
        } else if (part.functionCall) {
          if (streamState.textBlockStarted) {
            events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
            streamState.textBlockStarted = false;
            streamState.contentBlockIndex++;
          }
          events.push({
            type: 'content_block_start',
            index: streamState.contentBlockIndex,
            content_block: {
              type: 'tool_use',
              id: `toolu_stream_${Math.random().toString(36).substring(2, 11)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {}
            }
          });
          events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
          streamState.contentBlockIndex++;
        }
      }
    }

    if (usage && googleResponse.candidates?.[0]?.finishReason) {
      if (streamState.textBlockStarted) {
        events.push({ type: 'content_block_stop', index: streamState.contentBlockIndex });
        streamState.textBlockStarted = false;
      }
      let stopReason = 'end_turn';
      if (candidate.finishReason === 'MAX_TOKENS') {
        stopReason = 'max_tokens';
      }
      events.push({
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0) }
      });
      events.push({ type: 'message_stop' });
    }

    if (events.length === 0) return null;

    return events.map((ev: any) => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`).join('');
  }

  public normalizeError(error: any) {
    logger.error(`API Error: ${error.message || error}`);
    const status = error.status || 500;
    let type = 'api_error';
    if (status === 400) type = 'invalid_request_error';
    if (status === 401 || status === 403) type = 'authentication_error';
    if (status === 429) type = 'rate_limit_error';

    return {
      status,
      payload: {
        type: 'error',
        error: {
          type,
          message: error.message || 'Internal Server Error'
        }
      }
    };
  }
}

export default new ClaudeTranslator();
```

- [ ] **Step 5: Commit typings to git**
```bash
git add src/utils/logger.ts src/services/payloadLogger.ts src/services/claudeTranslator.ts
git commit -m "refactor: translate services and utils to typescript ESM syntax"
```

---

### Task 4: Refactor Controllers and App entry points

Rename routes and app, and refactor Express interfaces to support TS typing.

**Files:**
- Modify: `src/controllers/claudeController.ts`
- Modify: `src/routes/claudeRoutes.ts`
- Modify: `src/app.ts`

**Interfaces:**
- Produces: fully typed routes serving the Express server logic.

- [ ] **Step 1: Rename files**
```bash
mv src/controllers/claudeController.js src/controllers/claudeController.ts
mv src/routes/claudeRoutes.js src/routes/claudeRoutes.ts
mv src/app.js src/app.ts
```

- [ ] **Step 2: Refactor `src/controllers/claudeController.ts`**
Apply `import` semantics, types for `Request` and `Response`, and fix export default.
```typescript
import { Request, Response } from 'express';
// We use dynamic import for node-fetch if it causes CJS compat issues, but standard default import here.
import fetch from 'node-fetch';
import config from '../../config/default';
import claudeTranslator from '../services/claudeTranslator';
import payloadLogger from '../services/payloadLogger';
import logger from '../utils/logger';

const SUPPORTED_MODELS = [
  { "type": "model", "id": "claude-opus-4-7", "display_name": "Claude 4.7 Opus (Gemini Flash)", "created_at": "2026-07-10T00:00:00Z" },
  { "type": "model", "id": "claude-sonnet-4-6", "display_name": "Claude 4.6 Sonnet (Gemini Flash Lite)", "created_at": "2026-07-10T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-sonnet-20241022", "display_name": "Claude 3.5 Sonnet (New)", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-sonnet", "display_name": "Claude 3.5 Sonnet", "created_at": "2024-06-20T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-haiku-20241022", "display_name": "Claude 3.5 Haiku", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-5-haiku", "display_name": "Claude 3.5 Haiku (Standard)", "created_at": "2024-10-22T00:00:00Z" },
  { "type": "model", "id": "claude-3-opus", "display_name": "Claude 3 Opus", "created_at": "2024-03-07T00:00:00Z" },
  { "type": "model", "id": "claude-3-sonnet", "display_name": "Claude 3 Sonnet", "created_at": "2024-02-29T00:00:00Z" },
  { "type": "model", "id": "claude-3-haiku", "display_name": "Claude 3 Haiku", "created_at": "2024-03-07T00:00:00Z" }
];

class ClaudeController {
  private _extractClientKey(req: Request): string | null {
    let clientKey: string | null = null;
    if (req.headers["x-api-key"]) {
      clientKey = req.headers["x-api-key"] as string;
    } else if (req.headers["x-goog-api-key"]) {
      clientKey = req.headers["x-goog-api-key"] as string;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      clientKey = req.headers.authorization.substring(7).trim();
    } else if (req.query && req.query.key) {
      clientKey = req.query.key as string;
    }
    return clientKey;
  }

  private _getUpstreamUrl(pathAndQuery: string): string {
    const base = config.geminiBaseUrl.replace(/\/+$/, '');
    const cleanPath = pathAndQuery.replace(/^\/+/, '');
    return `${base}/${cleanPath}`;
  }

  private _generateTransactionId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  public async handleMessages(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    const clientReq = req.body;
    let gemReq: any = null;

    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        payloadLogger.saveTransaction(transactionId, clientReq, null, errPayload);
        return res.status(401).json(errPayload);
      }

      logger.debug(`[Request] Incoming Claude payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName, isStream } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;

      if (isStream) {
        const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:streamGenerateContent?alt=sse&key=${apiKey}`);
        const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
        logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gemReq)
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorJson;
          try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
          const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
          const errStatus = response.status;
          const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
          return res.status(normalized.status).json(normalized.payload);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const streamState = {};
        const gemResChunks: any[] = [];

        response.body!.on('data', (buffer: Buffer) => {
          const text = buffer.toString('utf8');
          const lines = text.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.substring(6).trim();
              if (jsonStr !== '[DONE]') {
                try {
                  gemResChunks.push(JSON.parse(jsonStr));
                } catch (e) { /* ignore */ }
              }
            }

            const translated = claudeTranslator.translateGoogleToClaudeStream(trimmed, cleanModelName, streamState);
            if (translated) {
              res.write(translated);
            }
          }
        });

        response.body!.on('end', () => {
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks);
          res.end();
        });

        response.body!.on('error', (err: any) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message, partial_chunks: gemResChunks });
          res.end();
        });

        return;
      }

      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json(translatedResponse);
    } catch (err: any) {
      logger.error(`Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message });
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    const clientReq = req.body;
    let gemReq: any = null;

    try {
      const apiKey = this._extractClientKey(req);

      if (!apiKey) {
        const errPayload = {
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided in headers (x-api-key, Authorization Bearer, or x-goog-api-key).'
          }
        };
        payloadLogger.saveTransaction(transactionId, clientReq, null, errPayload);
        return res.status(401).json(errPayload);
      }

      logger.debug(`[Request] Incoming Claude CountTokens payload body: ${JSON.stringify(clientReq)}`);

      const { googleRequest, cleanModelName } = claudeTranslator.translateClaudeToGoogle(clientReq);
      gemReq = googleRequest;

      logger.debug(`[Adapter] Mapped Gemini CountTokens request body: ${JSON.stringify(gemReq)}`);

      const clientEndpoint = `${req.method} ${req.originalUrl || req.path}`;
      const targetUrl = this._getUpstreamUrl(`/v1beta/models/${cleanModelName}:countTokens?key=${apiKey}`);
      const safeDisplayUrl = targetUrl.replace(/\?key=.*/, '?key=***');
      logger.info(`[Request] Received ${clientEndpoint} -> Proxying to Gemini: POST ${safeDisplayUrl}`);

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gemReq)
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore */ }
        const errMessage = errorJson?.error?.message || errorText || 'Gemini upstream API error';
        const errStatus = response.status;
        const normalized = claudeTranslator.normalizeError({ status: errStatus, message: errMessage });

        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage });
        return res.status(normalized.status).json(normalized.payload);
      }

      const geminiData: any = await response.json();

      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData);
      return res.status(200).json({
        input_tokens: geminiData.totalTokens || 0
      });
    } catch (err: any) {
      logger.error(`Unhandled count tokens error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message });
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleListModels(req: Request, res: Response): Promise<any> {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      return res.status(200).json({
        data: SUPPORTED_MODELS,
        has_more: false,
        first_id: SUPPORTED_MODELS[0].id,
        last_id: SUPPORTED_MODELS[SUPPORTED_MODELS.length - 1].id
      });
    } catch (err: any) {
      logger.error(`Unhandled list models error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }

  public async handleRetrieveModel(req: Request, res: Response): Promise<any> {
    try {
      const apiKey = this._extractClientKey(req);
      if (!apiKey) {
        return res.status(401).json({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Access denied. A valid Google Gemini API key was not provided.'
          }
        });
      }

      const modelId = req.params.model_id;
      const model = SUPPORTED_MODELS.find(m => m.id === modelId);

      if (!model) {
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `Model '${modelId}' does not exist.`
          }
        });
      }

      return res.status(200).json(model);
    } catch (err: any) {
      logger.error(`Unhandled retrieve model error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      return res.status(normalized.status).json(normalized.payload);
    }
  }
}

export default new ClaudeController();
```

- [ ] **Step 3: Refactor `src/routes/claudeRoutes.ts`**
```typescript
import { Router, Request, Response } from 'express';
import claudeController from '../controllers/claudeController';

const router = Router();

router.post('/messages', (req: Request, res: Response) => claudeController.handleMessages(req, res));
router.post('/messages/count_tokens', (req: Request, res: Response) => claudeController.handleCountTokens(req, res));

router.get('/models', (req: Request, res: Response) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req: Request, res: Response) => claudeController.handleRetrieveModel(req, res));

export default router;
```

- [ ] **Step 4: Refactor `src/app.ts`**
```typescript
import express, { Request, Response } from 'express';
import claudeRoutes from './routes/claudeRoutes';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
```

- [ ] **Step 5: Commit route/controller changes**
```bash
git add src/routes/claudeRoutes.ts src/controllers/claudeController.ts src/app.ts
git commit -m "refactor: convert controllers and express routes to typescript"
```

---

### Task 5: Refactor Test Files to TypeScript

Update imports in all tests and run tests.

**Files:**
- Rename and modify all files in `tests/` from `.js` to `.ts`

**Interfaces:**
- Produces: 100% passing tests via `ts-jest`.

- [ ] **Step 1: Rename test files**
```bash
for file in tests/*.js; do mv "$file" "${file%.js}.ts"; done
```

- [ ] **Step 2: Update imports in test files**
Update `require` references to `import` where appropriate, or verify they run. `ts-jest` parses CommonJS syntax natively inside `.ts` files, so if we use `import`, we must change `const app = require('../src/app')` to `import app from '../src/app'`.

For instance, in `tests/health.test.ts`:
```typescript
import request from 'supertest';
import app from '../src/app';

describe('GET /health', () => {
  it('should return status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

Repeat this change (`const X = require` -> `import X from`) across all test files.

- [ ] **Step 3: Run `npm test`**
Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 4: Run `npm run build`**
Run: `npm run build`
Expected: `dist/` created containing strictly typed js files.

- [ ] **Step 5: Commit test migrations**
```bash
git add tests/*.ts
git commit -m "test: migrate all jest tests to typescript and verify ts-jest compilation"
```
