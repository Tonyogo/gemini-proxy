# 模型调用接口超时策略与流式保活优化设计规格说明

**日期**：2026-10-25
**状态**：Draft / 待审阅

---

## 1. 背景与问题分析

当前项目的超时管理基于 `StreamLifecycleManager`（`src/utils/streamLifecycleManager.ts`）和全局/请求级超时配置（`UPSTREAM_TIMEOUT_MS` 默认 `180000ms` / `x-timeout-ms` 请求头），存在以下三项核心问题：

1. **流式绝对总时长硬切断（Wall-clock Timeout）**：
   - `StreamLifecycleManager` 在构造时启动一次性 `setTimeout(timeoutMs)`，流式连接建立并持续接收数据块（`data` 事件）期间从不重置定时器。
   - 导致深度思考或长文本输出超过 180 秒时，即使上游正在持续稳定输出 Token，也会被定时器强行 `abort()` 截断并报错 504。
2. **部分接口缺失超时控制（无 `AbortSignal`）**：
   - `claudeController.ts` 的 `handleCountTokens`、`handleListModels`、`handleRetrieveModel`（含直连与代理分支）以及 `geminiController.ts` 的非流式代理请求均未在 `fetch` 中挂载 `AbortSignal`，当上游挂起时会导致连接长时间悬空。
3. **原生 Gemini 流式代理缺失 SSE 心跳保活与精细超时响应**：
   - `geminiController.ts` 流式分支未开启 `enableSseHeartbeat: true`，无法防止 Cloudflare 100s 空闲 524 断连；且流式/非流式超时未统一返回 504 `DEADLINE_EXCEEDED` 状态。

---

## 2. 核心优化方案设计

### 2.1 `StreamLifecycleManager` 空闲超时续期机制（Idle Timeout Reset）

在 `src/utils/streamLifecycleManager.ts` 中：
1. 新增私有属性 `private timeoutMs: number = 0`，在构造函数中记录 `options.timeoutMs || 0` 并调用 `this.resetTimeout()` 启动初始等待定时器（控制首包 TTFB 超时）。
2. 新增公开方法 `public resetTimeout(): void`：
   - 若 `this.finished || this.aborted || this.timeoutMs <= 0`，直接返回。
   - 若 `this.timer` 已存在，先执行 `clearTimeout(this.timer)`（**仅重置超时定时器，不影响 `heartbeatTimer`**）。
   - 重新设置 `this.timer = setTimeout(() => { this.handleTimeout(this.timeoutMs); }, this.timeoutMs)`。
3. 在 `public attachStream(stream: any): void` 中：
   - 设置 `this.upstreamStream = stream`。
   - 立即调用一次 `this.resetTimeout()`（收到上游响应头即刷新首包计时）。
   - 若 `stream && typeof stream.on === 'function'`，注册监听：
     ```ts
     stream.on('data', () => {
       this.resetTimeout();
     });
     ```
4. 在 `private clearTimer(): void` 中保持清除 `this.timer` 与 `this.heartbeatTimer`。

### 2.2 `claudeController.ts` 补齐所有端点的超时与客户端断连控制

在 `src/proxy/controllers/claudeController.ts` 中，为以下三个方法统一接入 `extractTimeoutMs(req)` 与 `StreamLifecycleManager`：

1. **`handleCountTokens`（直连分支与代理分支）**：
   - 提取 `const timeoutMs = extractTimeoutMs(req);`
   - 创建 `const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });`
   - 在直连分支和代理分支的 `fetch(targetUrl, { ..., signal: streamManager.signal, agent })` 中传入 `signal`，并在 `fetch` 返回后调用 `streamManager.markFinished()`。
   - 当 `fetch` 抛出异常时：
     - 先调用 `streamManager.markFinished()`。
     - 若 `err.name === 'AbortError' || streamManager.isAborted`：
       - 若 `streamManager.reason === 'timeout'`：调用 `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')`，构造 504 错误载荷 `{ type: 'error', error: { type: 'timeout_error', message: \`Upstream request timed out after ${timeoutMs}ms\` } }`，记录 `payloadLogger.saveTransaction(..., 504, false)`，并返回 `res.status(504).json(errPayload)`。
       - 若为 `client_disconnect`：记录日志后直接 `return`（不触发上游节点熔断计数）。
     - 其他网络异常：调用 `upstreamManager.recordRequestResult(serverIndex, false, fetchErr.message || 'Fetch error')` 并继续向上抛出进入统一错误处理。

2. **`handleListModels`（直连分支与代理分支）**：
   - 同样提取 `timeoutMs = extractTimeoutMs(req)` 并创建 `StreamLifecycleManager({ req, res, transactionId, timeoutMs })`。
   - 将 `signal: streamManager.signal` 传入 `fetch`，完成后 `streamManager.markFinished()`。
   - 超时返回 HTTP 504 `timeout_error` 并记录熔断失败与交易日志；客户端主动断连不记熔断失败。

3. **`handleRetrieveModel`（直连分支与代理分支）**：
   - 同样提取 `timeoutMs = extractTimeoutMs(req)` 并创建 `StreamLifecycleManager({ req, res, transactionId, timeoutMs })`。
   - 将 `signal: streamManager.signal` 传入 `fetch`，完成后 `streamManager.markFinished()`。
   - 超时返回 HTTP 504 `timeout_error` 并记录熔断失败与交易日志；客户端主动断连不记熔断失败。

### 2.3 `geminiController.ts` 流式心跳保活与非流式超时控制

在 `src/proxy/controllers/geminiController.ts` 中：

1. **流式请求（`isStream === true`）**：
   - 创建 `StreamLifecycleManager` 时开启 `enableSseHeartbeat: true`：
     ```ts
     const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs, enableSseHeartbeat: true });
     ```
   - 当上游返回 `!isOk` 时：
     - 若 `!res.headersSent`，执行 `return res.status(response.status).json(errJson)`；
     - 若 `res.headersSent && !res.writableEnded`（因预发送 `: ping` 已发出 SSE 响应头），写入 `res.write(\`data: \${JSON.stringify(errJson)}\\n\\n\`)` 并 `res.end()`。
   - 当 `fetch` 返回 2xx 后：
     - 调用 `streamManager.setUpstreamStream(response.body)`（内部调用 `attachStream`，自动在每次 `data` 事件时重置空闲超时）。
     - 若 `!res.headersSent`，设置状态码与 SSE 响应头；若 `res.headersSent`（已由 `ensureSseHeaders` 发送），跳过重复 `setHeader` 以避免 `ERR_HTTP_HEADERS_SENT`。
   - 在 `response.body.on('error')` 与 `catch (err)` 中：
     - 若 `streamManager.reason === 'timeout'`：
       - 记录 `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')` 与 `accountUsageService.record(accountName, targetModelName || 'unknown', false)`。
       - 构造超时错误对象 `const timeoutErrJson = { error: { code: 504, message: \`Upstream request timed out after ${timeoutMs}ms\`, status: 'DEADLINE_EXCEEDED' } }`。
       - 记录 `payloadLogger.saveTransaction(transactionId, clientReq, clientReq, { error: 'Timeout' }, timeoutErrJson, duration, requestPath, 504, true, ...(accountName ? [accountName] : []))`。
       - 若 `!res.headersSent` 返回 `res.status(504).json(timeoutErrJson)`；否则若 `!res.writableEnded` 写入 `data: ${JSON.stringify(timeoutErrJson)}\n\n` 并 `res.end()`。
     - 若 `streamManager.reason === 'client_disconnect'`：仅记录断开日志并返回，不计入熔断。

2. **非流式请求（`isStream === false`）**：
   - 创建 `const streamManager = new StreamLifecycleManager({ req, res, transactionId, timeoutMs });`
   - 在 `fetch` 中传入 `signal: streamManager.signal`，并在响应头到达及正文读取完成后调用 `streamManager.markFinished()`。
   - 在 `catch (err)` 中：
     - 调用 `streamManager.markFinished()`。
     - 若 `streamManager.reason === 'timeout'`：
       - 记录 `upstreamManager.recordRequestResult(serverIndex, false, 'Timeout')` 与 `accountUsageService.record(accountName, targetModelName || 'unknown', false)`。
       - 构造 `const timeoutErrJson = { error: { code: 504, message: \`Upstream request timed out after ${timeoutMs}ms\`, status: 'DEADLINE_EXCEEDED' } }`。
       - 记录 `payloadLogger.saveTransaction(..., 504, false)` 并返回 `res.status(504).json(timeoutErrJson)`。
     - 若 `streamManager.reason === 'client_disconnect'`：记录日志并直接返回，不触发 `upstreamManager.recordRequestResult(serverIndex, false, ...)`。

---

## 3. 测试验证策略

1. **`tests/streamLifecycleManager.test.ts`**：
   - 验证 `attachStream` 挂载可读流后，在超时阈值（如 `5000ms`）内定期收到 `data` 事件（如每 `3000ms` 一次，共持续 `12000ms`）时**不会触发超时 abort**；当停止发送 `data` 事件后再经过 `5000ms` 则精准触发 `reason === 'timeout'`。
2. **`tests/claudeController.test.ts` / 新增超时单测**：
   - 验证 `handleCountTokens`、`handleListModels`、`handleRetrieveModel` 在上游超时后返回 HTTP 504 `timeout_error` 并记录熔断失败。
3. **`tests/geminiController.test.ts` / 新增超时单测**：
   - 验证 `geminiController` 流式请求开启了 SSE `: ping` 心跳保活，且非流式请求在超时后返回 HTTP 504 `DEADLINE_EXCEEDED`。
