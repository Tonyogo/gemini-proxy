# Gemini-Proxy TypeScript Refactoring Design Specification

**Date:** 2026-07-11  
**Status:** Approved  
**Author:** Claude Code (Fable 5)  

---

## 1. Overview
This design specification defines the architecture and migration plan for refactoring the `gemini-proxy` project from vanilla JavaScript to robust, strict TypeScript. The goal is to provide compile-time type safety for the complex payload structures mapping Claude endpoints to Gemini endpoints, while utilizing the standard `tsc` compiler to output highly optimized CommonJS code into a `dist/` directory for production.

---

## 2. Directory and Build Architecture

### 2.1. Project Layout
The application root file `index.js` will be moved into `src/` to centralize the TypeScript source code cleanly. All `.js` files will be renamed to `.ts`.
```text
gemini-proxy/
├── config/
│   └── default.ts             # Configuration loader, fully typed
├── src/
│   ├── types/
│   │   └── index.ts           # Interfaces for Claude/Gemini payloads and configurations
│   ├── routes/
│   │   └── claudeRoutes.ts    # Express routers
│   ├── controllers/
│   │   └── claudeController.ts# Typed Express Request/Response handlers
│   ├── services/
│   │   ├── claudeTranslator.ts# Core translation logic
│   │   └── payloadLogger.ts   # File-writing service
│   ├── utils/
│   │   └── logger.ts          # Typed logger
│   ├── app.ts                 # Express application setup
│   └── index.ts               # Application entry point (Moved from root)
├── tests/
│   └── *.test.ts              # Typed test files
├── dist/                      # (Git-ignored) Compiled JS output
├── tsconfig.json              # Compilation rules
├── jest.config.js             # ts-jest runner configuration
└── package.json               # Updated scripts for build/start/dev/test
```

### 2.2. TypeScript Configuration (`tsconfig.json`)
The project targets standard modern backend environments.
- **Target:** `ES2022`
- **Module:** `CommonJS` (Safest path ensuring backward compatibility with existing Node ecosystem and simple module resolution).
- **OutDir:** `./dist`
- **Strictness:** `strict: true`, `noImplicitAny: true`

### 2.3. Package Scripts
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/src/index.js",
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "test": "jest",
    "clean": "rm -rf dist"
  }
}
```

---

## 3. Core Typings (`src/types/index.ts`)
We define explicit boundaries representing the REST schemas of both APIs to guarantee complete type fidelity during object mapping and property lookups.

### 3.1. Claude Request Payload Types
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
}
```

### 3.2. Gemini Payload Types
```typescript
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

---

## 4. Verification & Testing Strategy
- **Dependency Upgrades:** Install `typescript`, `ts-jest`, `@types/node`, `@types/express`, `@types/jest`, `@types/supertest`, `ts-node-dev`.
- **Test Runner Transition:** Add `jest.config.js` to utilize `ts-jest` for executing tests natively against `.ts` files, ensuring that developers don't have to compile to run assertions.
- **Verification Gates:** 
  1. `npm run build` MUST exit with code 0 (no TypeScript compiler syntax or reference errors).
  2. `npm test` MUST continue to pass 100% of all existing 25 assertions seamlessly through the `ts-jest` environment.
