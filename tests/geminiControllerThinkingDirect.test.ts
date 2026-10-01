import request from 'supertest';
import express from 'express';
import fetch from 'node-fetch';
import geminiController from '../src/proxy/controllers/geminiController';
import { upstreamManager } from '../src/utils/upstreamManager';

jest.mock('node-fetch');
jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('geminiController Direct Mode Thinking Suffix', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.all('*', (req, res) => geminiController.handleProxy(req, res));

    capturedUpstreamUrl = '';
    capturedBody = null;
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
          raw: () => ({ 'content-type': ['application/json'] })
        },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Native Gemini Hello' }], role: 'model' } }]
        }),
        text: async () => 'ok'
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips -high from path and injects thinkingLevel: HIGH in direct mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:generateContent')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          temperature: 0.7
        }
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig.temperature).toBe(0.7);
    expect(capturedBody.generationConfig.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig.thinkingConfig.includeThoughts).toBeUndefined();
  });

  it('strips includeThoughts when client sends it and preserves other thinkingConfig properties', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:generateContent')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          thinkingConfig: {
            includeThoughts: true,
            customField: 'preserved'
          }
        }
      });

    expect(res.status).toBe(200);
    expect(capturedBody.generationConfig.thinkingConfig).toEqual({
      customField: 'preserved',
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig.thinkingConfig.includeThoughts).toBeUndefined();
  });

  it('does NOT inject generationConfig in non-generate endpoints like :countTokens and strips -high from request body models', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:countTokens',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:countTokens')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Count this' }] }],
        model: 'models/gemini-2.5-flash-high',
        generateContentRequest: {
          model: 'models/gemini-2.5-flash-high'
        }
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens');
    expect(capturedBody.generationConfig).toBeUndefined();
    expect(capturedBody.model).toBe('models/gemini-2.5-flash');
    expect(capturedBody.generateContentRequest.model).toBe('models/gemini-2.5-flash');
  });

  it('preserves -high in proxy mode without injecting thinkingLevel', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash-high:generateContent')
      .set('x-goog-api-key', 'client-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent');
    expect(capturedBody?.generationConfig?.thinkingConfig).toBeUndefined();
  });
});
