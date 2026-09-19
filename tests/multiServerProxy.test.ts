import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import fetch from 'node-fetch';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch', () => {
  return jest.fn();
});

const mockFetch = fetch as unknown as jest.Mock;

describe('Multi-Server Proxy Round-Robin Integration Tests', () => {
  const originalUrl = config.geminiBaseUrl;
  let fetchCalls: Array<{ url: string; options: any }> = [];

  beforeEach(async () => {
    fetchCalls = [];
    upstreamManager.reset();
    mockFetch.mockReset();
    mockFetch.mockImplementation(((url: string, options: any) => {
      fetchCalls.push({ url, options });
      return Promise.resolve({
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: 'Mock multi-server response' }] }
          }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
        })),
        json: () => Promise.resolve({
          candidates: [{
            content: { parts: [{ text: 'Mock multi-server response' }] }
          }],
          models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
        })
      } as any);
    }) as any);
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  describe('Claude Controller (/v1/messages)', () => {
    it('alternates servers per model evenly in round-robin fashion', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://upstream-1.com,https://upstream-2.com'
      });

      // Request 1: model gemini-2.5-pro -> upstream-1
      const res1 = await request(app)
        .post('/v1/messages')
        .set('x-api-key', 'test-key')
        .send({
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'hello 1' }]
        });
      expect(res1.statusCode).toBe(200);
      expect(fetchCalls[0].url).toContain('https://upstream-1.com/v1beta/models/gemini-2.5-pro:generateContent');

      // Request 2: model gemini-2.5-pro -> upstream-2
      const res2 = await request(app)
        .post('/v1/messages')
        .set('x-api-key', 'test-key')
        .send({
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'hello 2' }]
        });
      expect(res2.statusCode).toBe(200);
      expect(fetchCalls[1].url).toContain('https://upstream-2.com/v1beta/models/gemini-2.5-pro:generateContent');

      // Request 3: model gemini-1.5-flash (new model, starts at upstream-1)
      const res3 = await request(app)
        .post('/v1/messages')
        .set('x-api-key', 'test-key')
        .send({
          model: 'gemini-1.5-flash',
          messages: [{ role: 'user', content: 'hello flash' }]
        });
      expect(res3.statusCode).toBe(200);
      expect(fetchCalls[2].url).toContain('https://upstream-1.com/v1beta/models/gemini-1.5-flash:generateContent');

      // Request 4: model gemini-2.5-pro -> wraps around to upstream-1
      const res4 = await request(app)
        .post('/v1/messages')
        .set('x-api-key', 'test-key')
        .send({
          model: 'gemini-2.5-pro',
          messages: [{ role: 'user', content: 'hello 3' }]
        });
      expect(res4.statusCode).toBe(200);
      expect(fetchCalls[3].url).toContain('https://upstream-1.com/v1beta/models/gemini-2.5-pro:generateContent');
    });

    it('uses global round-robin for /v1/models query', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://upstream-1.com,https://upstream-2.com'
      });

      const res1 = await request(app)
        .get('/v1/models')
        .set('x-api-key', 'test-key');
      expect(res1.statusCode).toBe(200);
      expect(fetchCalls[0].url).toBe('https://upstream-1.com/v1beta/models');

      const res2 = await request(app)
        .get('/v1/models')
        .set('x-api-key', 'test-key');
      expect(res2.statusCode).toBe(200);
      expect(fetchCalls[1].url).toBe('https://upstream-2.com/v1beta/models');
    });
  });

  describe('Native Gemini Controller (/v1beta/models/...)', () => {
    it('dispatches native Gemini requests evenly across servers', async () => {
      await updateConfig({
        geminiBaseUrl: 'https://gw-a.io,https://gw-b.io'
      });

      const res1 = await request(app)
        .post('/v1beta/models/gemini-1.5-pro:generateContent')
        .set('x-goog-api-key', 'test-key')
        .send({ contents: [{ parts: [{ text: 'Native call 1' }] }] });
      expect(res1.statusCode).toBe(200);
      expect(fetchCalls[0].url).toContain('https://gw-a.io/v1beta/models/gemini-1.5-pro:generateContent');

      const res2 = await request(app)
        .post('/v1beta/models/gemini-1.5-pro:generateContent')
        .set('x-goog-api-key', 'test-key')
        .send({ contents: [{ parts: [{ text: 'Native call 2' }] }] });
      expect(res2.statusCode).toBe(200);
      expect(fetchCalls[1].url).toContain('https://gw-b.io/v1beta/models/gemini-1.5-pro:generateContent');
    });
  });
});
