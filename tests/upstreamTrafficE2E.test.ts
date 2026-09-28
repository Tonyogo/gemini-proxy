import http from 'http';
import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Upstream Traffic Weight & Disable E2E Integration', () => {
  const originalServers = config.upstreamServers;
  const originalUrl = config.geminiBaseUrl;

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

    server1.listen(19991, '127.0.0.1', () => {
      server2.listen(19992, '127.0.0.1', () => {
        done();
      });
    });
  });

  afterAll(async () => {
    await updateConfig({
      upstreamServers: originalServers,
      geminiBaseUrl: originalUrl
    });
    upstreamManager.reset();

    await new Promise<void>((resolve) => {
      server1.close(() => {
        server2.close(() => {
          resolve();
        });
      });
    });
  });

  it('accurately distributes 75% vs 25% traffic and shifts 100% when node disabled', async () => {
    upstreamManager.reset();

    // Configure 75% vs 25%
    await updateConfig({
      upstreamServers: [
        { url: 'http://127.0.0.1:19991', weight: 75, enabled: true, name: 'Server 1' },
        { url: 'http://127.0.0.1:19992', weight: 25, enabled: true, name: 'Server 2' }
      ]
    });

    s1Requests = 0;
    s2Requests = 0;

    // Send 40 requests
    for (let i = 0; i < 40; i++) {
      const res = await request(app)
        .post('/v1beta/models/gemini-2.5-flash:generateContent')
        .set('x-goog-api-key', 'test-api-key')
        .send({ contents: [{ parts: [{ text: `Request ${i}` }] }] });

      expect(res.status).toBe(200);
    }

    // 75% of 40 = 30; 25% of 40 = 10
    expect(s1Requests).toBe(30);
    expect(s2Requests).toBe(10);

    // Now dynamically disable Server 2
    await updateConfig({
      upstreamServers: [
        { url: 'http://127.0.0.1:19991', weight: 75, enabled: true, name: 'Server 1' },
        { url: 'http://127.0.0.1:19992', weight: 25, enabled: false, name: 'Server 2' }
      ]
    });

    const initialS1 = s1Requests;
    const initialS2 = s2Requests;

    // Send 10 more requests
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/v1beta/models/gemini-2.5-flash:generateContent')
        .set('x-goog-api-key', 'test-api-key')
        .send({ contents: [{ parts: [{ text: `Post-disable Request ${i}` }] }] });

      expect(res.status).toBe(200);
    }

    // All 10 requests must go to Server 1
    expect(s1Requests - initialS1).toBe(10);
    expect(s2Requests - initialS2).toBe(0);
  });
});
