# Request Duration Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track high-precision epoch request durations, print durations in console logger, save them in transaction logs, and visualize them on high-density sidebars.

**Architecture:** Update `saveTransaction` signature, wrap timer logs in `ClaudeController` handler exit points, enhance `AdminController` regex index, and render durations dynamically in the Log Viewer frontend.

**Tech Stack:** TypeScript, Node.js, Express, Tailwind CSS, Vanilla JS.

## Global Constraints
- Target platform: Node.js / Darwin / Express.
- Absolute type-safety on all revised function signatures.
- Consistent console printing structure: `(duration: <N>ms)`.

---

## Files To Be Created or Modified

- **Modify**:
  - `src/services/payloadLogger.ts`: Add optional `duration?: number` to `saveTransaction`.
  - `src/controllers/claudeController.ts`: Capture start timestamps and supply duration at exit channels.
  - `src/controllers/adminController.ts`: Update regex mapping in `listLogs`.
  - `src/public/index.html`: Append `formatDuration(ms)` helper and inject duration elements in the lists.
  - `tests/admin.test.ts`: Update mock files data to reflect duration parameters.

---

## Tasks

### Task 1: Update PayloadLogger and Controller Timing Metrics

**Files:**
- Modify: `src/services/payloadLogger.ts`
- Modify: `src/controllers/claudeController.ts`
- Test: `tests/payloadLogger.test.ts` (Assert duration field integration)

**Interfaces:**
- Consumes: Timer block intervals.
- Produces: 
  - `PayloadLogger.saveTransaction(..., duration?: number)`
  - Logs containing `(duration: Nms)` on console.

- [ ] **Step 1: Expand `saveTransaction` signature in `payloadLogger.ts`**

Edit `src/services/payloadLogger.ts` to append the optional duration parameter inside the payload structure:
```typescript
  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number // <-- ADD THIS
  ): Promise<void> {
    try {
      await this._ensureDirectory();

      const payload = {
        duration: duration || null, // <-- ADD THIS Upfront
        client_req: clientReq || null,
        gem_req: gemReq || null,
        gem_res: gemRes || null,
        claude_res: claudeRes || null
      };

      const filePath = path.join(this.debugDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: transaction_${transactionId}.json`);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
```

- [ ] **Step 2: Add timers inside `claudeController.ts` exits**

Edit `src/controllers/claudeController.ts`. Store starting point and record values across stream/non-stream blocks:
```typescript
    const startTime = Date.now(); // <-- Capture at entry inside handleMessages
```

For **Streaming Exits**:
```typescript
        response.body!.on('end', () => {
          const duration = Date.now() - startTime; // <-- CALCULATE THIS
          logger.info(`[Response] [Transaction: ${transactionId}] Stream generated content finished successfully (duration: ${duration}ms)`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks, duration); // <-- PASS DURATION
          res.end();
        });

        response.body!.on('error', (err: any) => {
          const duration = Date.now() - startTime; // <-- CALCULATE THIS
          logger.error(`[Error] [Transaction: ${transactionId}] Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(
            transactionId,
            clientReq,
            gemReq,
            { error: err.message, partial_chunks: gemResChunks },
            { error: err.message, partial_chunks: claudeResChunks },
            duration // <-- PASS DURATION
          );
          res.end();
        });
```

For **Non-Streaming Exits**:
```typescript
      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      const duration = Date.now() - startTime; // <-- CALCULATE THIS
      logger.info(`[Response] [Transaction: ${transactionId}] Non-stream content successfully returned with 200 OK (duration: ${duration}ms)`);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse, duration); // <-- PASS DURATION
      return res.status(200).json(translatedResponse);
```

For **Blocked/Error Exits**:
```typescript
      if (!apiKey) {
        const errPayload = {
          type: 'error',
          ...
        };
        const duration = Date.now() - startTime; // <-- CALCULATE THIS
        logger.warn(`[Authentication Error] [Transaction: ${transactionId}] Request rejected: API Key is missing or invalid. (duration: ${duration}ms)`);
        payloadLogger.saveTransaction(transactionId, clientReq, null, null, errPayload, duration); // <-- PASS DURATION
        return res.status(401).json(errPayload);
      }
```

```typescript
    } catch (err: any) {
      const duration = Date.now() - startTime; // <-- CALCULATE THIS
      logger.error(`[Error] [Transaction: ${transactionId}] Unhandled error: ${err.message}`);
      const normalized = claudeTranslator.normalizeError(err);
      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message }, normalized.payload, duration); // <-- PASS DURATION
      return res.status(normalized.status).json(normalized.payload);
    }
```

- [ ] **Step 3: Run the test suite and verify build compiles cleanly**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/services/payloadLogger.ts src/controllers/claudeController.ts
git commit -m "feat: implement high-precision timing logic inside payload logger and controllers" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Update Admin Log indexing and Log Viewer UI Representation

**Files:**
- Modify: `src/controllers/adminController.ts`
- Modify: `src/public/index.html`
- Modify: `tests/admin.test.ts` (Assert duration list processing)

**Interfaces:**
- Consumes: `"duration": N` stored inside logged JSON.
- Produces:
  - listLogs API returning optional `duration: number` properties.
  - Sidebar rows displaying formatted `log.duration` tags.

- [ ] **Step 1: Update listLogs parser regex inside `adminController.ts`**

Edit `src/controllers/adminController.ts` to parse duration parameter upfront:
```typescript
          let duration = null;
          let model = 'unknown';
          try {
            // Read first 2KB of file to extract requested model and duration quickly
            const filePath = path.join(logsDir, filename);
            const handle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(2048);
            await handle.read(buffer, 0, 2048, 0);
            await handle.close();

            const partialText = buffer.toString('utf8');
            const match = partialText.match(/"model"\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
              model = match[1];
            }

            const durationMatch = partialText.match(/"duration"\s*:\s*(\d+|null)/);
            if (durationMatch && durationMatch[1] && durationMatch[1] !== 'null') {
              duration = parseInt(durationMatch[1], 10);
            }
          } catch (err) {
            logger.error(`[AdminController] Error reading model from ${filename}: ${err}`);
          }

          return {
            id: filename.replace('transaction_', '').replace('.json', ''),
            filename,
            timestamp,
            time: new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19),
            model,
            duration // <-- ADD THIS
          };
```

- [ ] **Step 2: Update mock assertions inside `tests/admin.test.ts`**

Edit `tests/admin.test.ts` to align mocked fs implementations:
```typescript
    mockOpen.mockResolvedValue({
      read: jest.fn().mockImplementation((buf: Buffer) => {
        buf.write('{"duration": 450, "client_req": {"model": "gemini-flash-latest"}}');
        return Promise.resolve({ bytesRead: 100 });
      }),
      close: jest.fn().mockResolvedValue(undefined)
    });
```

- [ ] **Step 3: Implement `formatDuration` and append labels inside `index.html`**

Edit `src/public/index.html` to introduce the duration rendering utilities:
In JavaScript script tag area, define the duration formatter:
```javascript
    function formatDuration(ms) {
      if (ms === null || ms === undefined) return '';
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    }
```

Now update `renderLogsList()` template schema to prepend duration labels right before the model chip:
```javascript
      container.innerHTML = logsList.map(log => {
        // Extract HH:MM:SS
        const timeParts = log.time.split(' ');
        const displayTime = timeParts[1] || log.time;

        // Short ID (extract segment after underscore)
        const displayId = log.id.includes('_') ? '_' + log.id.split('_')[1] : log.id.slice(-8);

        // Short model identifier (strip redundant gemini- or gemini-3.1- prefixes)
        const displayModel = log.model.replace('gemini-3.1-', '').replace('gemini-', '');

        return `
          <div onclick="selectLog('${log.id}')" 
               id="log-item-${log.id}" 
               title="Time: ${log.time}\nFull ID: ${log.id}\nModel: ${log.model}"
               class="px-3 py-1.5 hover:bg-gray-800/40 cursor-pointer border-l-2 border-transparent transition flex items-center justify-between text-xs font-mono">
            <div class="flex items-center gap-2 truncate">
              <span class="text-gray-500 text-[11px]">${displayTime}</span>
              <span class="text-gray-300 font-semibold select-all">${displayId}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span class="text-gray-500 text-[10px] font-normal mr-1">${formatDuration(log.duration)}</span>
              <span class="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1 py-0.2 rounded uppercase font-bold shrink-0">
                ${displayModel}
              </span>
            </div>
          </div>
        `;
      }).join('');
```

- [ ] **Step 4: Execute all tests and compile**

Run: `npm test && npm run build`
Expected: PASS and SUCCESS with zero type check or bundle errors.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/adminController.ts src/public/index.html tests/admin.test.ts
git commit -m "feat: display formatted log durations dynamically inside Log Viewer high-density lists" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Execution Choice Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-duration-and-logging-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
