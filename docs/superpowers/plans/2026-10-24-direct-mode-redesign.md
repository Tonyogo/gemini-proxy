# Direct Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign upstream Direct Mode (`type: 'direct'`) so that requests routed to direct nodes skip Claude-to-Gemini protocol translation, run four lightweight preprocessing steps (model mapping without `-high` stripping, top-level system prompt cleaning/injection, ephemeral message filtering without inline `role: 'system'` conversion, and ignored tools filtering), forward directly to the upstream server with passthrough client auth headers, and display only the model usage overview card in AccountsView.

**Architecture:** `ClaudeController` resolves model mappings and selects the target upstream server via `upstreamManager` before choosing the pipeline. When `serverType === 'direct'`, it executes `claudeTranslator.preprocessClaudeDirectRequest()`, builds passthrough headers via `buildDirectUpstreamHeaders()`, forwards to native `/v1/*` paths, streams or returns responses directly while logging transactions to `payloadLogger` and recording per-node model usage in `accountUsageService` under `__direct_node_${serverIndex}__`. When `serverType === 'proxy'`, the existing Claude-to-Gemini translation pipeline runs unchanged.

**Tech Stack:** TypeScript, Express, node-fetch, React (Vite + Tailwind CSS), Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-24-direct-mode-redesign-design.md`

## Global Constraints

- Zero static config caching: always read `config.*` dynamically at request time.
- Deep-clone `req.body` into `clientReq` on entry so `payloadLogger` always logs the unmodified client request as `clientReq` and the preprocessed direct payload as `gemReq`.
- In Direct Mode, ignore `-high` model suffixes (do not strip `-high` and do not inject `thinking` or `thinkingConfig`).
- In Direct Mode, do not extract, deduplicate, or wrap `role: 'system'` messages inside `body.messages`.
- Remove local `apiKeys` key-pool rotation from Direct Mode; forward client authentication and Anthropic protocol headers directly.

## Review Focus

- Direct mode streaming SSE responses that contain multi-chunk split lines, `event:` lines, `: ping` comments, or `[DONE]` frames must be written to `res` verbatim without corrupting chunk boundaries while still parsing `data: {...}` JSON payloads into `sseEvents` for `payloadLogger`.
- Direct mode `system` field can be `undefined`, a `string`, or an `Array` of content blocks; when `x-anthropic-billing-header` is stripped and `customSystemInstruction` is empty, an empty array or empty string must delete `directReq.system` rather than sending `system: ""` or `system: []`.
- `filterEphemeralMessages` in direct mode must not mutate `clientReq.messages` in place when filtering content blocks of historical user messages.
- Direct mode error responses (4xx/5xx from upstream) in both streaming and non-streaming modes must still update `upstreamManager.recordRequestResult` (5xx = failure, 4xx = alive) and `accountUsageService.record(..., false)`.
- In `AccountsView.tsx`, when switching to a direct mode server (`isCurrentDirect === true`), the top `Node Model Usage Overview` card must still render and compute model breakdown stats from `accounts`, while the toolbar and account table below it are hidden.

---

### Task 1: Direct Mode Request Preprocessor & Headers Builder

**Files:**
- Modify: `src/proxy/services/claudeTranslator.ts`
- Modify: `src/utils/requestHelper.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- Produces in `src/proxy/services/claudeTranslator.ts`:
  ```ts
  public preprocessClaudeDirectRequest(claudeBody: ClaudeRequest): {
    directRequest: ClaudeRequest;
    cleanModelName: string;
    strategy?: SchedulingStrategy;
    isStream: boolean;
  }
  ```
- Produces in `src/utils/requestHelper.ts`:
  ```ts
  export function buildDirectUpstreamHeaders(
    req: Request,
    effectiveApiKey: string,
    customHeaders?: Record<string, string>
  ): Record<string, string>
  ```

- [ ] **Step 1: Write the failing unit tests in `tests/claudeTranslator.test.ts`**

Append a new `describe('Claude Direct Mode Preprocessing & Headers', ...)` block to `tests/claudeTranslator.test.ts`:

```ts
import { buildDirectUpstreamHeaders } from '../src/utils/requestHelper';

describe('Claude Direct Mode Preprocessing & Headers', () => {
  beforeEach(() => {
    config.customSystemInstruction = '';
    config.stripSystemFingerprints = true;
    config.modelMappings = {};
    config.ignoredTools = ['Artifact', 'ArtifactCheck'];
    config.ephemeralUserMessages = ['[ephemeral-user-hint]'];
    config.ephemeralSystemMessages = ['[ephemeral-sys-hint]'];
  });

  it('maps model name, preserves -high suffix without injecting thinking, and leaves inline system messages untouched', () => {
    config.modelMappings = {
      'claude-sonnet': { target: 'claude-sonnet-4-5-high', strategy: 'least-used' }
    };
    const input = {
      model: 'claude-sonnet',
      stream: true,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'Inline system message stays as-is' },
        { role: 'user', content: 'Hello world' }
      ]
    } as any;

    const { directRequest, cleanModelName, strategy, isStream } =
      translator.preprocessClaudeDirectRequest(input);

    expect(cleanModelName).toBe('claude-sonnet-4-5-high');
    expect(directRequest.model).toBe('claude-sonnet-4-5-high');
    expect(directRequest.thinking).toBeUndefined();
    expect(strategy).toBe('least-used');
    expect(isStream).toBe(true);
    expect(directRequest.messages).toEqual([
      { role: 'system', content: 'Inline system message stays as-is' },
      { role: 'user', content: 'Hello world' }
    ]);
  });

  it('cleans x-anthropic-billing-header from top-level system array/string and appends customSystemInstruction', () => {
    config.customSystemInstruction = 'Custom direct instruction';
    const inputWithArray = {
      model: 'claude-3-5-sonnet',
      system: [
        { type: 'text', text: 'x-anthropic-billing-header: cc_version=2.1' },
        { type: 'text', text: 'Keep this system block' }
      ],
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;

    const resArray = translator.preprocessClaudeDirectRequest(inputWithArray);
    expect(resArray.directRequest.system).toEqual([
      { type: 'text', text: 'Keep this system block' },
      { type: 'text', text: 'Custom direct instruction' }
    ]);

    config.customSystemInstruction = '';
    const inputOnlyBilling = {
      model: 'claude-3-5-sonnet',
      system: 'x-anthropic-billing-header: cc_version=2.1',
      messages: [{ role: 'user', content: 'Hi' }]
    } as any;
    const resEmpty = translator.preprocessClaudeDirectRequest(inputOnlyBilling);
    expect(resEmpty.directRequest.system).toBeUndefined();
  });

  it('filters historical ephemeral messages and removes ignoredTools without mutating input', () => {
    const original = {
      model: 'claude-3-5-sonnet',
      messages: [
        { role: 'system', content: '[ephemeral-sys-hint] drop me' },
        {
          role: 'user',
          content: [
            { type: 'text', text: '[ephemeral-user-hint] drop block' },
            { type: 'text', text: 'keep block' }
          ]
        },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'final user turn [ephemeral-user-hint]' }
      ],
      tools: [
        { name: 'Artifact', input_schema: { type: 'object' } },
        { name: 'Bash', input_schema: { type: 'object' } }
      ]
    } as any;

    const snapshot = JSON.parse(JSON.stringify(original));
    const { directRequest } = translator.preprocessClaudeDirectRequest(original);

    expect(original).toEqual(snapshot);
    expect(directRequest.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'keep block' }] },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'final user turn [ephemeral-user-hint]' }
    ]);
    expect(directRequest.tools).toEqual([
      { name: 'Bash', input_schema: { type: 'object' } }
    ]);
  });

  it('builds direct upstream headers preserving client auth and anthropic headers', () => {
    const fakeReq = {
      headers: {
        'x-api-key': 'sk-ant-client',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'Prompt-Caching-2024-07-31'
      }
    } as any;

    const headers = buildDirectUpstreamHeaders(fakeReq, 'sk-ant-client', {
      'x-scheduling-strategy': 'round-robin'
    });

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-api-key']).toBe('sk-ant-client');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-beta']).toBe('Prompt-Caching-2024-07-31');
    expect(headers['x-scheduling-strategy']).toBe('round-robin');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: FAIL (`translator.preprocessClaudeDirectRequest is not a function` / `buildDirectUpstreamHeaders is not a function`)

- [ ] **Step 3: Implement `preprocessClaudeDirectRequest` in `src/proxy/services/claudeTranslator.ts` and `buildDirectUpstreamHeaders` in `src/utils/requestHelper.ts`**

In `src/proxy/services/claudeTranslator.ts`, add `preprocessClaudeDirectRequest(claudeBody: ClaudeRequest)`:
- Throw `{ status: 400, message: "Missing required parameter: 'model'" }` if `!claudeBody || !claudeBody.model`.
- Deep-clone `claudeBody` into `directRequest: ClaudeRequest = JSON.parse(JSON.stringify(claudeBody))`.
- Resolve `const mappingInfo = this.getModelMappingInfo(claudeBody.model)` and set `cleanModelName = mappingInfo.targetModel || claudeBody.model.replace(/^models\//, '')` and `directRequest.model = cleanModelName`.
- Clean `directRequest.system`:
  - If `typeof directRequest.system === 'string'`: apply `this.cleanSystemContent(directRequest.system)`; if `null`, `delete directRequest.system`, else set `directRequest.system = cleaned`.
  - Else if `Array.isArray(directRequest.system)`: filter/map blocks where text blocks pass through `this.cleanSystemContent(blockText)` (dropping blocks that return `null`); if resulting array is empty, `delete directRequest.system`.
- Append `config.customSystemInstruction`:
  - If `config.customSystemInstruction && config.customSystemInstruction.trim()`:
    - If `Array.isArray(directRequest.system)`, push `{ type: 'text', text: config.customSystemInstruction }`.
    - Else if `typeof directRequest.system === 'string' && directRequest.system.length > 0`, set `directRequest.system = `${directRequest.system}\n\n${config.customSystemInstruction}``.
    - Else set `directRequest.system = config.customSystemInstruction`.
- Filter ephemeral messages: if `Array.isArray(directRequest.messages)`, set `directRequest.messages = this.filterEphemeralMessages(directRequest.messages)`.
- Filter ignored tools: if `Array.isArray(directRequest.tools)` and `Array.isArray(config.ignoredTools) && config.ignoredTools.length > 0`, filter out tools whose `(tool.name || tool.function?.name || '').trim().toLowerCase()` is in `ignoredSet`; if `directRequest.tools.length === 0`, `delete directRequest.tools`.
- Return `{ directRequest, cleanModelName, strategy: mappingInfo.strategy, isStream: Boolean(directRequest.stream) }`.

In `src/utils/requestHelper.ts`, add `buildDirectUpstreamHeaders(req: Request, effectiveApiKey: string, customHeaders?: Record<string, string>): Record<string, string>`:
- Initialize `headers: Record<string, string> = { 'Content-Type': 'application/json', ...customHeaders }`.
- Forward client auth headers if present on `req.headers`: `x-api-key`, `authorization` (as `Authorization`), `x-goog-api-key`.
- If none of `x-api-key`, `Authorization`, or `x-goog-api-key` were present on `req.headers` and `effectiveApiKey` is non-empty, set `headers['x-api-key'] = effectiveApiKey` and `headers['Authorization'] = `Bearer ${effectiveApiKey}``.
- If `config.adminSecretKey && effectiveApiKey === config.adminSecretKey && !headers['Authorization']`, set `headers['Authorization'] = `Bearer ${effectiveApiKey}``.
- Forward `anthropic-version` and `anthropic-beta` from `req.headers` if present (as strings).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/services/claudeTranslator.ts src/utils/requestHelper.ts tests/claudeTranslator.test.ts
git commit -m "feat(translator): add direct mode request preprocessor and header builder

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Remove Local `apiKeys` Pool Rotation from `UpstreamManager`

**Files:**
- Modify: `src/types/index.ts:120-153`
- Modify: `src/utils/upstreamManager.ts:21-40,103-120,268-283,332-346,390-404,429-435`
- Modify: `tests/upstreamServerType.test.ts`

**Interfaces:**
- Modifies `UpstreamServerSelection` in `src/types/index.ts` (removes `selectedApiKey?: string`).
- Modifies `UpstreamManager.getUpstreamServer` in `src/utils/upstreamManager.ts` (removes `selectDirectApiKey` and `directKeyIndexMap`).

- [ ] **Step 1: Update `tests/upstreamServerType.test.ts` to assert direct mode server selection without key pool rotation**

Update the second `describe('UpstreamManager direct mode scheduling', ...)` block in `tests/upstreamServerType.test.ts` so it asserts `sel.serverType === 'direct'`, `sel.serverUrl`, and `allowedModels` filtering without `selectedApiKey`:

```ts
describe('UpstreamManager direct mode scheduling', () => {
  const originalServers = config.upstreamServers;

  afterEach(() => {
    config.upstreamServers = originalServers;
    upstreamManager.reset();
  });

  it('returns serverType direct for configured direct server', () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server'
      }
    ];

    const sel = upstreamManager.getUpstreamServer();
    expect(sel.serverType).toBe('direct');
    expect(sel.serverUrl).toBe('https://direct-claude.example.com');
    expect((sel as any).selectedApiKey).toBeUndefined();
  });

  it('respects allowedModels filter on direct mode server', () => {
    config.upstreamServers = [
      {
        url: 'https://proxy.example.com',
        weight: 1,
        enabled: true,
        type: 'proxy',
        allowedModels: ['gemini-2.5-flash']
      },
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        allowedModels: ['claude-sonnet-4-5']
      }
    ];

    const sel = upstreamManager.getUpstreamServer({ model: 'claude-sonnet-4-5' });
    expect(sel.serverType).toBe('direct');
    expect(sel.serverIndex).toBe(1);
    expect(sel.serverUrl).toBe('https://direct-claude.example.com');
  });
});
```

- [ ] **Step 2: Run the test to see `selectedApiKey` assertions or unused fields**

Run: `npx jest tests/upstreamServerType.test.ts`

- [ ] **Step 3: Remove `selectedApiKey` and `selectDirectApiKey` from `src/types/index.ts` and `src/utils/upstreamManager.ts`**

In `src/types/index.ts`:
- Remove `selectedApiKey?: string;` from `UpstreamServerSelection`.

In `src/utils/upstreamManager.ts`:
- Remove `private directKeyIndexMap` and `private selectDirectApiKey(...)`.
- Remove `selectedApiKey` from the return objects in `getUpstreamServer()` and remove `this.directKeyIndexMap.clear()` from `reset()`.

- [ ] **Step 4: Run `tests/upstreamServerType.test.ts` to verify it passes**

Run: `npx jest tests/upstreamServerType.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/utils/upstreamManager.ts tests/upstreamServerType.test.ts
git commit -m "refactor(upstream): remove local apiKeys pool rotation from direct mode

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Direct Mode Passthrough in `ClaudeController` and `GeminiController`

**Files:**
- Modify: `src/proxy/controllers/claudeController.ts`
- Modify: `src/proxy/controllers/geminiController.ts`
- Modify: `tests/directModeProxy.test.ts`
- Modify: `tests/directModeCustomDomain.test.ts`
- Modify: `tests/claudeControllerThinkingDirect.test.ts`
- Modify: `tests/geminiControllerThinkingDirect.test.ts`

**Interfaces:**
- Consumes `claudeTranslator.preprocessClaudeDirectRequest(clientReq)` and `buildDirectUpstreamHeaders(req, apiKey, customUpstreamHeaders)` from Task 1.
- Consumes `upstreamManager.getUpstreamServer(...)` from Task 2.
- Records direct node model usage via `accountUsageService.record(accountName || \`__direct_node_${serverIndex}__\`, cleanModelName, isSuccess)`.

- [ ] **Step 1: Write tests for Direct Mode passthrough in `tests/directModeProxy.test.ts`, `tests/claudeControllerThinkingDirect.test.ts`, and `tests/geminiControllerThinkingDirect.test.ts`**

Update `tests/directModeProxy.test.ts` to test:
1. Non-streaming `POST /v1/messages` on a `type: 'direct'` node:
   - Preprocesses `clientReq` (maps model, strips `x-anthropic-billing-header` in `system`, appends `customSystemInstruction`, filters ephemeral messages, removes `ignoredTools`, preserves inline `role: 'system'` in `messages`, preserves `-high` suffix).
   - Forwards `POST ${serverUrl}/v1/messages` with `buildDirectUpstreamHeaders` (`x-api-key`, `anthropic-version`, `x-scheduling-strategy`).
   - Returns upstream Claude JSON response directly without Gemini translation.
   - Calls `payloadLogger.saveTransaction` with `(transactionId, clientReq, directReq, upstreamRes, upstreamRes, duration, '/v1/messages', 200, false, '__direct_node_0__')`.
   - Records model usage in `accountUsageService` under `'__direct_node_0__'`.
2. Streaming `POST /v1/messages` (`stream: true`) on a `type: 'direct'` node:
   - Streams raw Claude SSE events from upstream directly to client response and logs parsed `data:` JSON chunks to `payloadLogger.saveTransaction`.
3. `POST /v1/messages/count_tokens` and `GET /v1/models` on a `type: 'direct'` node:
   - Forwards to `${serverUrl}/v1/messages/count_tokens` and `${serverUrl}/v1/models` directly.

Update `tests/claudeControllerThinkingDirect.test.ts` and `tests/geminiControllerThinkingDirect.test.ts`:
- Assert that in `direct` mode, `-high` is **not** stripped and `thinking` / `thinkingConfig` is **not** injected, whereas in `proxy` mode `-high` **is** stripped and `thinkingLevel: 'HIGH'` **is** injected.

- [ ] **Step 2: Run the updated tests to verify they fail**

Run: `npx jest tests/directModeProxy.test.ts tests/claudeControllerThinkingDirect.test.ts tests/geminiControllerThinkingDirect.test.ts`
Expected: FAIL (controllers still translate to `/v1beta/models/...:generateContent` and strip `-high` in direct mode)

- [ ] **Step 3: Implement Direct Mode passthrough in `src/proxy/controllers/claudeController.ts` and `src/proxy/controllers/geminiController.ts`**

In `src/proxy/controllers/claudeController.ts`:
- Import `buildDirectUpstreamHeaders` from `../../utils/requestHelper`.
- In `handleMessages`:
  - First validate `clientReq.model` (or throw 400 via translator), resolve `mappingInfo = claudeTranslator.getModelMappingInfo(clientReq.model)`, check `upstreamManager.hasUpstreamForModel(clientModel, mappingInfo.targetModel)`.
  - Select upstream server via `upstreamManager.getUpstreamServer({ model: mappingInfo.targetModel, originalModel: clientModel, resolvedModel: mappingInfo.targetModel })`.
  - If `serverSelection.serverType === 'direct'`, delegate to a dedicated helper `this.handleDirectMessages(req, res, clientReq, apiKey, timeoutMs, transactionId, startTime, requestPath, serverSelection)`:
    - Run `const { directRequest, cleanModelName, strategy, isStream } = claudeTranslator.preprocessClaudeDirectRequest(clientReq)`.
    - Compute `effectiveStrategy = strategy || extractClientSchedulingStrategy(req)` and `customUpstreamHeaders`.
    - Build `targetUrl = `${serverSelection.serverUrl}/${requestPath.replace(/^\/+/, '')}`` (defaulting path to `v1/messages`).
    - Build `upstreamHeaders = buildDirectUpstreamHeaders(req, apiKey, customUpstreamHeaders)` and `agent = proxyAgentManager.getAgent(serverSelection)`.
    - Handle `isStream` and non-stream branches:
      - Determine `accountKey = response.headers?.get?.('x-account-name') || \`__direct_node_${serverIndex}__\``.
      - On non-2xx: record circuit breaker (5xx -> `false`, 4xx -> `true`), record `accountUsageService.record(accountKey, cleanModelName, false)`, normalize error via `claudeTranslator.normalizeError`, log transaction with `directRequest`, and return error response.
      - On 2xx stream: pipe chunks directly to `res.write(chunk)` after `streamManager.ensureSseHeaders()`, parse `data:` lines into `sseEvents` array in parallel, and on `end` record usage, circuit breaker, and `payloadLogger.saveTransaction(transactionId, clientReq, directRequest, sseEvents, sseEvents, duration, requestPath, 200, true, accountKey)`.
      - On 2xx non-stream: parse upstream JSON `upstreamData`, record usage, circuit breaker, `payloadLogger.saveTransaction(transactionId, clientReq, directRequest, upstreamData, upstreamData, duration, requestPath, 200, false, accountKey)`, and `return res.status(200).json(upstreamData)`.
  - If `serverSelection.serverType === 'proxy'`, keep the existing `translateClaudeToGoogle` flow (passing `serverSelection` so `getUpstreamServer` is not called a second time).
- In `handleCountTokens`:
  - Select server via `upstreamManager.getUpstreamServer(...)`.
  - If `serverSelection.serverType === 'direct'`:
    - Run `preprocessClaudeDirectRequest(clientReq)` (if `config.countTokensModel?.trim()`, set `directRequest.model = claudeTranslator.getCleanModelName(config.countTokensModel.trim())`).
    - Forward `POST ${serverSelection.serverUrl}/v1/messages/count_tokens` with `buildDirectUpstreamHeaders(req, apiKey)`.
    - Return `{ input_tokens: data.input_tokens ?? data.totalTokens ?? 0 }` and log transaction.
- In `handleListModels` and `handleRetrieveModel`:
  - Select server via `upstreamManager.getUpstreamServer(...)`.
  - If `serverSelection.serverType === 'direct'`:
    - Forward `GET ${serverSelection.serverUrl}/v1/models` (or `/v1/models/${resolvedModelId}`) with `buildDirectUpstreamHeaders(req, apiKey)`.
    - If upstream response already has `data` (list) or `type === 'model'` (retrieve), return it directly and log transaction; otherwise fall back to mapping `models` array.

In `src/proxy/controllers/geminiController.ts`:
- Remove `selectedApiKey` usage (always use client `apiKey` or `buildDirectUpstreamHeaders` / `buildUpstreamHeaders(apiKey, customUpstreamHeaders)`).
- Only strip `-high` and inject `thinkingConfig` when `serverType !== 'direct'`.
- When `serverType === 'direct'`, set `accountName = response.headers?.get?.('x-account-name') || \`__direct_node_${serverIndex}__\``.

Also update `tests/directModeCustomDomain.test.ts` to expect `/v1/messages` and client `x-api-key` passthrough when `type === 'direct'`.

- [ ] **Step 4: Run the controller test suites to verify they pass**

Run: `npx jest tests/directModeProxy.test.ts tests/directModeCustomDomain.test.ts tests/claudeControllerThinkingDirect.test.ts tests/geminiControllerThinkingDirect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/proxy/controllers/claudeController.ts src/proxy/controllers/geminiController.ts tests/directModeProxy.test.ts tests/directModeCustomDomain.test.ts tests/claudeControllerThinkingDirect.test.ts tests/geminiControllerThinkingDirect.test.ts
git commit -m "feat(proxy): forward direct mode requests without protocol translation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Direct Mode Node Usage Aggregation & Admin UI Simplification

**Files:**
- Modify: `src/admin/controllers/accountController.ts:46-101`
- Modify: `frontend/src/components/AccountsView.tsx:965-1008,1075-1345,2020-2090`
- Modify: `frontend/src/components/ConfigModal.tsx:61-72,495-510,1148-1155,1197-1216,1318-1346,1495-1500,1537-1598`
- Modify: `tests/accountDirectMode.test.ts`
- Modify: `tests/accountDirectModeModelUsageUnification.test.ts`
- Modify: `tests/upstreamServerTypeE2E.test.ts`
- Modify: `tests/configModalMobile.test.ts`
- Modify: `tests/configModalUpstreamCompact.test.ts`

**Interfaces:**
- `GET /api/admin/accounts/status?serverId=<idx>` for a `type: 'direct'` server returns:
  ```ts
  {
    isDirectMode: true,
    status: {
      isSystemBusy: false,
      streamingMode: 'DIRECT',
      usageCount: number,
      failureCount: number,
      accountDetails: Array<{
        index: 0,
        name: string,
        status: 'ACTIVE',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: false,
        hasContext: false,
        canonicalIndex: null,
        usage: {
          total: number,
          totalRequests: number,
          totalSuccess: number,
          totalError: number,
          byModel: Record<string, { usage: number; requests: number; success: number; error: number }>
        }
      }>
    }
  }
  ```

- [ ] **Step 1: Update tests in `tests/accountDirectMode.test.ts`, `tests/accountDirectModeModelUsageUnification.test.ts`, `tests/upstreamServerTypeE2E.test.ts`, `tests/configModalMobile.test.ts`, and `tests/configModalUpstreamCompact.test.ts`**

1. In `tests/accountDirectMode.test.ts`:
   - Seed `accountUsageService.record('__direct_node_0__', 'claude-sonnet-4-5', true)`.
   - Verify `GET /api/admin/accounts/status?serverIndex=0` returns `isDirectMode: true`, `status.usageCount === 1`, and `status.accountDetails[0].usage.byModel['claude-sonnet-4-5'].requests === 1`.
2. In `tests/accountDirectModeModelUsageUnification.test.ts`:
   - Verify `AccountsView.tsx` renders the `Node Model Usage Overview` card for both direct and proxy nodes, and hides the Action Toolbar and account table when `isCurrentDirect` is true (`!isCurrentDirect && (`).
3. In `tests/upstreamServerTypeE2E.test.ts`:
   - Verify mixed cluster routing where Server 0 (`proxy`) translates to `/v1beta/models/...:generateContent` and Server 1 (`direct`) forwards directly to `/v1/messages` and aggregates node model usage in `/api/admin/accounts/status?serverId=1`.
4. In `tests/configModalMobile.test.ts` and `tests/configModalUpstreamCompact.test.ts`:
   - Update assertions to reflect removal of the Direct Mode API keys textarea and `targetOfficialEndpoint` badge.

- [ ] **Step 2: Run the updated admin/UI tests to verify they fail**

Run: `npx jest tests/accountDirectMode.test.ts tests/accountDirectModeModelUsageUnification.test.ts tests/upstreamServerTypeE2E.test.ts tests/configModalMobile.test.ts tests/configModalUpstreamCompact.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `accountController.ts`, `AccountsView.tsx`, and `ConfigModal.tsx` updates**

1. In `src/admin/controllers/accountController.ts`:
   - In `getStatus`, when `targetServer && targetServer.type === 'direct'`:
     - Look up `const nodeAccountKey = \`__direct_node_${serverIdx}__\`` in `accountUsageService.getUsageForAccount(nodeAccountKey)`.
     - Build `byModelCompat` from `localStats?.byModel`.
     - Populate `accountDetails` with a single virtual entry (when `localStats` has requests, or a single zero-usage entry) so `calculateServerModelStats(accounts)` in `AccountsView.tsx` computes `serverModelStats.models`, `totalRequests`, and `successRate`.
2. In `frontend/src/components/AccountsView.tsx`:
   - In the multi-server tab bar and mobile status bar, only display the account count badge when `serversMeta[idx]?.type !== 'direct'`.
   - Keep the `Node Model Usage Overview` card visible for all nodes.
   - Wrap the `Action Toolbar` (`<div className="ui-card p-2 sm:p-3.5 shrink-0">...</div>`) and the main account list/table section in `{!isCurrentDirect && ( ... )}` so direct mode only displays the model usage overview card and nothing below it.
   - Remove the obsolete `/* Desktop Direct Mode Table */` and `/* Mobile Direct Mode Card List */` branches inside the accounts table card.
3. In `frontend/src/components/ConfigModal.tsx`:
   - Remove the `{server.type === 'direct' && ( ... )}` API Keys textarea block and the collapsed `Key ×{rawKeyCount}` badge.
   - Remove the `targetOfficialEndpoint` badge and stop forcing `https://generativelanguage.googleapis.com` when switching a node to `type: 'direct'`.

- [ ] **Step 4: Run the full test suite and frontend/backend build**

Run: `npx jest --runInBand && npm run build`
Expected: All test suites PASS and both frontend and backend build cleanly with zero TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/admin/controllers/accountController.ts frontend/src/components/AccountsView.tsx frontend/src/components/ConfigModal.tsx tests/accountDirectMode.test.ts tests/accountDirectModeModelUsageUnification.test.ts tests/upstreamServerTypeE2E.test.ts tests/configModalMobile.test.ts tests/configModalUpstreamCompact.test.ts
git commit -m "feat(admin): show only model usage overview for direct nodes and remove key pool UI

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
