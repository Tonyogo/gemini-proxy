import request from 'supertest';
import express from 'express';
import geminiController from '../src/controllers/geminiController';
import config from '../config/default';

jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url, opts) => {
    return Promise.resolve({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null,
        raw: () => ({ 'content-type': ['application/json'] }),
      },
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Native Gemini Output' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 }
      }),
      text: () => Promise.resolve(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Native Gemini Output' }] } }]
      }))
    });
  });
});

describe('GeminiController - Native Gemini API Proxy', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.all('/v1beta/*', (req, res) => geminiController.handleProxy(req, res));
    app.all('/v1/models/:modelWithAction', (req, res) => geminiController.handleProxy(req, res));
  });

  it('rejects 401 when API key is missing', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .send({ contents: [{ parts: [{ text: 'Hello' }] }] });

    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain('API key');
  });

  it('proxies non-streaming generateContent request successfully', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Gemini' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Gemini Output');
  });

  it('applies model mapping when target model is configured in MODEL_MAPPINGS', async () => {
    config.modelMappings = {
      'gemini-pro-mapped': { target: 'gemini-3.7-flash', strategy: 'least-used' }
    } as any;

    const res = await request(app)
      .post('/v1beta/models/gemini-pro-mapped:generateContent')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Mapped' }] }] });

    expect(res.status).toBe(200);
  });

  it('proxies streaming streamGenerateContent request successfully', async () => {
    const fetchMock = require('node-fetch');
    const { Readable } = require('stream');
    const stream = new Readable({
      read() {
        this.push('data: {"candidates":[{"content":{"parts":[{"text":"Stream chunk"}]}}]}\n\n');
        this.push(null);
      }
    });

    fetchMock.mockImplementationOnce(() => Promise.resolve({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => h.toLowerCase() === 'content-type' ? 'text/event-stream' : null,
        raw: () => ({ 'content-type': ['text/event-stream'] })
      },
      body: stream
    }));

    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse')
      .set('x-goog-api-key', 'test-gemini-key')
      .send({ contents: [{ parts: [{ text: 'Hello Stream' }] }] });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Stream chunk');
  });
});
