# High-Fidelity Transaction Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modify `PayloadLogger` and `ClaudeController` to deep-clone incoming requests and log outbound Claude responses (`claude_res`) alongside Gemini payloads.

**Architecture:** Modifies `saveTransaction` signature to receive and log `claudeRes`. Deep-clones `req.body` inside `ClaudeController` to prevent mutable reference changes. Buffers and outputs Claude response payloads (`translatedResponse` or accumulated SSE arrays) during standard and streaming execution.

**Tech Stack:** Node.js, TypeScript, Jest, Supertest.

## Global Constraints
- **Platform:** Node.js (v18+)
- **Dependency Limits:** Native standard packages only (jest)
- **Framework:** Express.js
- **Statelessness:** Logs are stored asynchronously as individual JSON files under `data/debug/`.

---

### Task 1: Update PayloadLogger Service and unit tests for 4-Key support

Add the `claude_res` key and support to `PayloadLogger.saveTransaction`, and update unit tests to verify full 4-key JSON schemas.

**Files:**
- Modify: `tests/payloadLogger.test.ts`
- Modify: `src/services/payloadLogger.ts`

**Interfaces:**
- Consumes: Typings from `src/types/index.ts`.
- Produces: `payloadLogger` module with expanded `saveTransaction` signature:
  `saveTransaction(transactionId: string, clientReq: any, gemReq: any, gemRes: any, claudeRes: any)`

- [ ] **Step 1: Read the existing `tests/payloadLogger.test.ts`**
Verify file content.

- [ ] **Step 2: Update `tests/payloadLogger.test.ts`**
Modify the unit test to verify that the generated payload includes `claude_res`:
```typescript
  it('correctly creates the directory and writes pretty-printed json payload with 4 keys', async () => {
    const clientReq = { messages: [{ role: 'user', content: 'Hi' }] };
    const gemReq = { contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] };
    const gemRes = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
    const claudeRes = { content: [{ type: 'text', text: 'Hello' }] };

    await payloadLogger.saveTransaction(testId, clientReq, gemReq, gemRes, claudeRes);

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const dataText = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(dataText);

    expect(data.client_req).toEqual(clientReq);
    expect(data.gem_req).toEqual(gemReq);
    expect(data.gem_res).toEqual(gemRes);
    expect(data.claude_res).toEqual(claudeRes);
  });
```

- [ ] **Step 3: Run the test to make sure it fails**
Run: `npm test tests/payloadLogger.test.ts`
Expected: FAIL due to schema property assertions mismatch.

- [ ] **Step 4: Update `src/services/payloadLogger.ts`**
Modify `saveTransaction` signature to receive `claudeRes` and append it to the file payload:
```typescript
  public async saveTransaction(
    transactionId: string, 
    clientReq: any, 
    gemReq: any, 
    gemRes: any,
    claudeRes: any
  ): Promise<void> {
    try {
      await this._ensureDirectory();

      const payload = {
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

- [ ] **Step 5: Run tests to verify they pass**
Run: `npm test tests/payloadLogger.test.ts`
Expected: PASS

- [ ] **Step 6: Commit changes**
```bash
git add tests/payloadLogger.test.ts src/services/payloadLogger.ts
git commit -m "feat: upgrade PayloadLogger service to support high-fidelity 4-key schema tracking"
```

---

### Task 2: Integrate High-Fidelity Logging in Route Controller and update integration tests

Implement deep-cloning of `clientReq`, accumulate Claude-formatted responses (`claudeRes`) in both streaming and non-streaming endpoints, and update logging integration test assertions.

**Files:**
- Modify: `tests/claudeLogging.test.ts`
- Modify: `src/controllers/claudeController.ts`

**Interfaces:**
- Consumes: The upgraded `payloadLogger.saveTransaction` interface.

- [ ] **Step 1: Read the existing `tests/claudeLogging.test.ts`**
Verify spy calls and asserts.

- [ ] **Step 2: Update `tests/claudeLogging.test.ts`**
Modify integration test spy validations to assert that `claudeRes` is passed and matches client results:
```typescript
  it('correctly logs non-streaming requests and responses', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Non-streaming response' }] } }]
      })
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'What is 1+1?' }]
      });

    expect(res.statusCode).toEqual(200);

    expect(logSpy).toHaveBeenCalled();
    const [transactionId, clientReq, gemReq, gemRes, claudeRes] = logSpy.mock.calls[0];

    expect(transactionId).toBeDefined();
    expect(clientReq.model).toEqual('claude-sonnet-4.6');
    expect(gemReq.contents[0].parts[0].text).toEqual('What is 1+1?');
    expect(gemRes.candidates[0].content.parts[0].text).toEqual('Non-streaming response');
    
    // Assert: Check that raw, un-mutated Claude response is written
    expect(claudeRes.content[1].text).toEqual('Non-streaming response');
  });

  it('correctly aggregates and logs streaming chunks', async () => {
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      body: mockStream
    });

    const promise = request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key-abc')
      .send({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'Tell a story' }],
        stream: true
      });

    const chunk1 = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content 1' }] } }]
    };
    const chunk2 = {
      candidates: [{ content: { parts: [{ text: 'Streaming chunk content 2' }] } }]
    };

    mockStream.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    mockStream.push(`data: ${JSON.stringify(chunk2)}\n\n`);
    mockStream.push(null); // end

    await promise;

    expect(logSpy).toHaveBeenCalled();
    const [transactionId, clientReq, gemReq, gemRes, claudeRes] = logSpy.mock.calls[0];

    expect(transactionId).toBeDefined();
    expect(clientReq.model).toEqual('claude-sonnet-4.6');
    expect(gemReq.contents[0].parts[0].text).toEqual('Tell a story');

    expect(gemRes).toBeInstanceOf(Array);
    expect(gemRes.length).toEqual(2);

    // Assert: Verify mapped Claude SSE stream chunks array is fully logged
    expect(claudeRes).toBeInstanceOf(Array);
    expect(claudeRes.length).toBeGreaterThan(0);
    expect(claudeRes[0]).toContain('message_start');
  });
```

- [ ] **Step 3: Run the integration test suite to verify failure**
Run: `npm test tests/claudeLogging.test.ts`
Expected: FAIL due to missing parameter length or undefined asserts.

- [ ] **Step 4: Update `src/controllers/claudeController.ts`**
Deep clone incoming `req.body` and capture Claude responses (`translatedResponse` or `claudeResChunks` arrays) inside `handleMessages` and `handleCountTokens`.

In `handleMessages` (Streaming):
```typescript
        const streamState = {};
        const gemResChunks: any[] = [];
        const claudeResChunks: string[] = [];

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
              claudeResChunks.push(translated);
              res.write(translated);
            }
          }
        });

        response.body!.on('end', () => {
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, gemResChunks, claudeResChunks);
          res.end();
        });

        response.body!.on('error', (err: any) => {
          logger.error(`Stream reading error: ${err.message}`);
          const errPayload = {
            type: 'error',
            error: { type: 'api_error', message: 'Downstream connection lost' }
          };
          res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
          payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: err.message, partial_chunks: gemResChunks }, { error: err.message, partial_chunks: claudeResChunks });
          res.end();
        });
```

In `handleMessages` (Non-Streaming):
```typescript
      // Deep clone request body immediately upon entry of handleMessages
      const clientReq = JSON.parse(JSON.stringify(req.body));
      let gemReq: any = null;
      // ...
      
      const geminiData = await response.json();
      const translatedResponse = claudeTranslator.convertGoogleToClaudeNonStream(geminiData, cleanModelName);

      payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, translatedResponse);
      return res.status(200).json(translatedResponse);
```

In `handleCountTokens`:
```typescript
  public async handleCountTokens(req: Request, res: Response): Promise<any> {
    const transactionId = this._generateTransactionId();
    // Deep clone immediately
    const clientReq = JSON.parse(JSON.stringify(req.body));
    let gemReq: any = null;
    // ...
    
    if (!response.ok) {
        // ...
        payloadLogger.saveTransaction(transactionId, clientReq, gemReq, { error: errMessage }, normalized.payload);
        return res.status(normalized.status).json(normalized.payload);
    }
    
    const geminiData: any = await response.json();
    const tokenResponse = {
      input_tokens: geminiData.totalTokens || 0
    };

    payloadLogger.saveTransaction(transactionId, clientReq, gemReq, geminiData, tokenResponse);
    return res.status(200).json(tokenResponse);
```

- [ ] **Step 5: Run all test suites recursively to confirm 100% success**
Run: `npm test`
Expected: ALL PASS.

- [ ] **Step 6: Run build verification**
Run: `npm run build`
Expected: SUCCESS.

- [ ] **Step 7: Commit changes**
```bash
git add src/controllers/claudeController.ts tests/claudeLogging.test.ts
git commit -m "feat: deep-clone client requests and record high-fidelity claude responses in transaction files"
```
