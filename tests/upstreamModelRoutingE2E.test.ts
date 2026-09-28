import http from 'http';
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Upstream Model Restriction & Routing E2E Integration', () => {
  let server1: http.Server;
  let server2: http.Server;
  let s1Requests = 0;
  let s2Requests = 0;

  beforeAll((done) => {
    s1Requests = 0;
    s2Requests = 0;

    server1 = http.createServer((req, res) => {
      s1Requests++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response from Server 1' }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 }
      }));
    });

    server2 = http.createServer((req, res) => {
      s2Requests++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Response from Server 2' }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 }
      }));
    });

    server1.listen(19981, '127.0.0.1', () => {
      server2.listen(19982, '127.0.0.1', () => {
        done();
      });
    });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    upstreamManager.reset();

    await new Promise<void>((resolve) => {
      server1.close(() => {
        server2.close(() => {
          resolve();
        });
      });
    });
  });

  beforeEach(async () => {
    s1Requests = 0;
    s2Requests = 0;
    config.adminSecretKey = 'test-secret';
    await updateConfig({
      upstreamServers: [
        { url: 'http://127.0.0.1:19981', weight: 50, enabled: true },
        { url: 'http://127.0.0.1:19982', weight: 50, enabled: true, allowedModels: ['gemini-2.5-flash'] }
      ]
    });
    upstreamManager.reset();
  });

  it('balances traffic between Server 1 and Server 2 when model is supported by both', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/v1beta/models/gemini-2.5-flash:generateContent')
        .set('x-goog-api-key', 'test-key')
        .send({ contents: [{ parts: [{ text: `Request ${i}` }] }] });

      expect(res.status).toBe(200);
    }

    expect(s1Requests).toBeGreaterThan(0);
    expect(s2Requests).toBeGreaterThan(0);
    expect(s1Requests + s2Requests).toBe(20);
  });

  it('routes 100% of traffic to Server 1 and 0% to Server 2 when model is only supported by Server 1', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/v1beta/models/gemini-2.5-pro:generateContent')
        .set('x-goog-api-key', 'test-key')
        .send({ contents: [{ parts: [{ text: `Request ${i}` }] }] });

      expect(res.status).toBe(200);
    }

    expect(s1Requests).toBe(10);
    expect(s2Requests).toBe(0);
  });

  it('blocks unknown model with 403 when no configured upstream supports the model', async () => {
    // Restrict Server 1 to flash and pro as well, so unknown-model has zero supporting nodes
    await updateConfig({
      upstreamServers: [
        { url: 'http://127.0.0.1:19981', weight: 50, enabled: true, allowedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
        { url: 'http://127.0.0.1:19982', weight: 50, enabled: true, allowedModels: ['gemini-2.5-flash'] }
      ]
    });
    upstreamManager.reset();

    const res = await request(app)
      .post('/v1beta/models/unknown-model:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({ contents: [{ parts: [{ text: 'Blocked request' }] }] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(403);
    expect(res.body.error.status).toBe('PERMISSION_DENIED');
    expect(s1Requests).toBe(0);
    expect(s2Requests).toBe(0);
  });

  it('routes Claude API messages correctly respecting per-upstream allowed models', async () => {
    const resPro = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'gemini-2.5-pro',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi Pro' }]
      });

    expect(resPro.status).toBe(200);
    expect(s1Requests).toBe(1);
    expect(s2Requests).toBe(0);
  });
});
