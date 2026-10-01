import request from 'supertest';
import express from 'express';
import fetch from 'node-fetch';
import claudeController from '../src/proxy/controllers/claudeController';
import { upstreamManager } from '../src/utils/upstreamManager';

jest.mock('node-fetch');
jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('claudeController Direct Mode Thinking Suffix', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post('/v1/messages', (req, res) => claudeController.handleMessages(req, res));
    app.post('/v1/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));

    capturedUpstreamUrl = '';
    capturedBody = null;
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' } }],
          usageMetadata: { candidatesTokenCount: 5, promptTokenCount: 10 }
        }),
        text: async () => JSON.stringify({ totalTokens: 15 })
      };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips -high and injects thinkingLevel: HIGH in direct mode for non-stream /v1/messages', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    // Verified stripped URL
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    // Verified thinkingLevel injected
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    // Ensure includeThoughts is NOT injected
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('does NOT strip -high and does NOT inject thinkingLevel in proxy mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    // Preserves -high in proxy mode
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:generateContent');
    // No thinkingConfig injected
    expect(capturedBody.generationConfig?.thinkingConfig).toBeUndefined();
  });

  it('strips -high for /v1/messages/count_tokens in direct mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:countTokens',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct',
      selectedApiKey: 'test-direct-key'
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Count this' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens');
    expect(capturedBody.generateContentRequest?.model).toBe('models/gemini-2.5-flash');
  });
});
