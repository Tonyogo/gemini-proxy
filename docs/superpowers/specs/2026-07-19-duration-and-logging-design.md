# Design Spec: High-Precision Request Duration Tracking and Logging

This design specification details the architecture, code modifications, storage extensions, and front-end rendering required to capture, print, and visualize end-to-end request durations for both non-stream and stream modes.

## 1. Goal

Currently, the proxy server logs request parameters but completely ignores end-to-end latency metrics (durations in milliseconds). Measuring upstream and downstream latency is highly critical when translating models, processing deep-thinking threads, or streaming structured events.

We will introduce a **High-Precision End-to-End Latency Tracker** that:
- Captures starting time stamps at route entry points.
- Measures absolute duration at completion or failure exit points (non-stream response completion or stream body `end` / `error` handlers).
- Logs time intervals directly inside console outputs (`logger.info`).
- Persists `"duration"` metrics in saved transaction JSON files.
- Serves and renders latency measurements in the Log Viewer UI.

---

## 2. Storage Expansion (`PayloadLogger`)

We will update the transaction schema saved by `payloadLogger.ts` to capture duration properties globally.

### 2.1 File: `src/services/payloadLogger.ts`
Modify `saveTransaction` method signature to receive an optional `duration` integer, inserting it as an upfront key inside the payload object:
```typescript
  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number
  ): Promise<void> {
    const payload = {
      duration: duration || null, // <-- Saved upfront
      client_req: clientReq || null,
      ...
    };
    ...
  }
```

---

## 3. High-Precision Timing Integration (`ClaudeController`)

We will wrap message handler routines inside `src/controllers/claudeController.ts` with precise epoch timer blocks.

### 3.1 Timing Block Insertion points

- **Initial Entry**:
  ```typescript
  const startTime = Date.now();
  ```

- **Non-Stream Completion Exit**:
  ```typescript
  const duration = Date.now() - startTime;
  logger.info(`[Response] [Transaction: ${transactionId}] Non-stream content successfully returned with 200 OK (duration: ${duration}ms)`);
  payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse, duration);
  ```

- **Stream Finished Exit (`end` event)**:
  ```typescript
  response.body!.on('end', () => {
    const duration = Date.now() - startTime;
    logger.info(`[Response] [Transaction: ${transactionId}] Stream generated content finished successfully (duration: ${duration}ms)`);
    payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks, duration);
    res.end();
  });
  ```

- **Rejected/Unauthorized Exit**:
  ```typescript
  const duration = Date.now() - startTime;
  ...
  payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration);
  ```

---

## 4. Metadata Extraction and Frontend Integration

To prevent performance drops while indexing, we will parse the first 2KB of saved JSON files to extract duration fields concurrently.

### 4.1 Endpoint Parsing Update (`AdminController`)
Update regex queries in `src/controllers/adminController.ts` to capture `"duration": (\d+|null)`:
```typescript
  let duration = null;
  const partialText = buffer.toString('utf8');
  const durationMatch = partialText.match(/"duration"\s*:\s*(\d+|null)/);
  if (durationMatch && durationMatch[1] && durationMatch[1] !== 'null') {
    duration = parseInt(durationMatch[1], 10);
  }
```

Return the parsed `duration` inside each log item object array.

### 4.2 Front-end High-Density Presentation (`index.html`)
Inside `src/public/index.html`, declare a formatting utility and append latency badges next to the model label:
```javascript
function formatDuration(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
```

```html
<div class="flex items-center gap-1.5 shrink-0">
  <span class="text-gray-500 text-[10px] font-normal mr-1">${formatDuration(log.duration)}</span>
  <span class="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1 py-0.2 rounded uppercase font-bold shrink-0">
    ${displayModel}
  </span>
</div>
```
