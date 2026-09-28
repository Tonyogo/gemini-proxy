import http from 'http';
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Model Restriction End-to-End Dynamic Switching', () => {
  const originalServers = config.upstreamServers;
  const originalUrl = config.geminiBaseUrl;
  const adminSecret = 'test-admin-secret-e2e';

  let mockUpstream: http.Server;
  let upstreamPort: number;
  let upstreamCalls = 0;

  beforeAll((done) => {
    mockUpstream = http.createServer((req, res) => {
      upstreamCalls++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response from mock upstream' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
      }));
    });

    mockUpstream.listen(0, '127.0.0.1', () => {
      const addr = mockUpstream.address();
      upstreamPort = typeof addr === 'object' && addr ? addr.port : 19995;
      done();
    });
  });

  beforeEach(async () => {
    config.adminSecretKey = adminSecret;
    await updateConfig({
      geminiBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      allowedModels: []
    });
    upstreamManager.reset();
    upstreamCalls = 0;
  });

  afterAll(async () => {
    await updateConfig({
      upstreamServers: originalServers,
      geminiBaseUrl: originalUrl,
      allowedModels: []
    });
    upstreamManager.reset();

    await new Promise<void>((resolve) => {
      mockUpstream.close(() => resolve());
    });
  });

  it('allows all models in open mode (allowedModels = [])', async () => {
    const claudeRes = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(claudeRes.status).toBe(200);

    const geminiRes = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(geminiRes.status).toBe(200);
    expect(upstreamCalls).toBe(2);
  });

  it('dynamically restricts models via Admin API and unblocks on clearing whitelist', async () => {
    // 1. Update config via PUT /api/admin/config to restrict models
    const putRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', adminSecret)
      .send({
        allowedModels: ['gemini-2.5-flash', 'claude-3-7-sonnet']
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.config.allowedModels).toEqual(['gemini-2.5-flash', 'claude-3-7-sonnet']);

    const callCountBeforeBlocked = upstreamCalls;

    // 2. Unauthorized Claude request is blocked with 403 (upstream not invoked)
    const claudeBlocked = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(claudeBlocked.status).toBe(403);
    expect(claudeBlocked.body.type).toBe('error');
    expect(claudeBlocked.body.error.type).toBe('permission_error');
    expect(upstreamCalls).toBe(callCountBeforeBlocked); // Upstream was not called!

    // 3. Unauthorized Gemini request is blocked with 403 (upstream not invoked)
    const geminiBlocked = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(geminiBlocked.status).toBe(403);
    expect(geminiBlocked.body.error.code).toBe(403);
    expect(geminiBlocked.body.error.status).toBe('PERMISSION_DENIED');
    expect(upstreamCalls).toBe(callCountBeforeBlocked); // Upstream was not called!

    // 4. Authorized Claude request passes
    const claudeAllowed = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-7-sonnet',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(claudeAllowed.status).toBe(200);

    // 5. Authorized Gemini request passes (with case-insensitivity)
    const geminiAllowed = await request(app)
      .post('/v1beta/models/GEMINI-2.5-FLASH:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(geminiAllowed.status).toBe(200);

    // 6. Clear whitelist via Admin API (restore open mode)
    const clearRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', adminSecret)
      .send({
        allowedModels: []
      });

    expect(clearRes.status).toBe(200);
    expect(clearRes.body.config.allowedModels).toEqual([]);

    // 7. Previously blocked models can now pass again
    const claudeRestored = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(claudeRestored.status).toBe(200);

    const geminiRestored = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(geminiRestored.status).toBe(200);
  });
});
