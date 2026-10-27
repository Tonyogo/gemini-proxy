import request from 'supertest';
import express from 'express';
import fetch from 'node-fetch';
import claudeController from '../src/proxy/controllers/claudeController';
import { upstreamManager } from '../src/utils/upstreamManager';
import { updateConfig } from '../config/default';

jest.mock('node-fetch');
jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('claudeController Universal Thinking Suffix (-high)', () => {
  let app: express.Express;
  let capturedUpstreamUrl = '';
  let capturedBody: any = null;

  beforeEach(async () => {
    await updateConfig({ countTokensModel: '' });
    app = express();
    app.use(express.json());
    app.post('/v1/messages', (req, res) => claudeController.handleMessages(req, res));
    app.post('/v1/messages/count_tokens', (req, res) => claudeController.handleCountTokens(req, res));
    app.get('/v1/models/:model_id', (req, res) => claudeController.handleRetrieveModel(req, res));

    capturedUpstreamUrl = '';
    capturedBody = null;
    (fetch as unknown as jest.Mock).mockImplementation(async (url: string, options: any) => {
      capturedUpstreamUrl = url;
      capturedBody = options?.body ? JSON.parse(options.body) : null;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
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

  it('strips -high to baseModel and injects output_config.effort = high in direct mode for non-stream /v1/messages', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://direct-claude.example.com/v1/messages',
      serverUrl: 'https://direct-claude.example.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct'
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
    expect(capturedUpstreamUrl).toBe('https://direct-claude.example.com/v1/messages');
    expect(capturedBody.model).toBe('gemini-2.5-flash');
    expect(capturedBody.output_config).toEqual({ effort: 'high' });
    expect(capturedBody.generationConfig).toBeUndefined();
    expect(capturedBody.thinking).toBeUndefined();
  });

  it('strips -high and injects thinkingLevel: HIGH in proxy mode for /v1/messages', async () => {
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
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH'
    });
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('strips -high for /v1/messages/count_tokens in both direct and proxy modes', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high:countTokens',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash-high',
        messages: [{ role: 'user', content: 'Count this' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash:countTokens');
    expect(capturedBody.generateContentRequest?.model).toBe('models/gemini-2.5-flash');
  });

  it('strips -high when retrieving model metadata via GET /v1/models/:model_id in proxy mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash-high',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .get('/v1/models/gemini-2.5-flash-high')
      .set('x-api-key', 'client-key');

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://custom-proxy.com/v1beta/models/gemini-2.5-flash');
  });

  it('strips -high when retrieving model metadata via GET /v1/models/:model_id in direct mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://direct-claude.example.com/v1/models/claude-3-7-sonnet-high',
      serverUrl: 'https://direct-claude.example.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct'
    });

    const res = await request(app)
      .get('/v1/models/claude-3-7-sonnet-high')
      .set('x-api-key', 'client-key');

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://direct-claude.example.com/v1/models/claude-3-7-sonnet');
  });

  it('strips includeThoughts and injects thinkingLevel: HIGH when thinking is enabled in proxy mode', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-high:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
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
        messages: [{ role: 'user', content: 'Hi' }],
        thinking: { type: 'enabled', budget_tokens: 1024 }
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'HIGH',
      thinkingBudget: 1024
    });
    expect(capturedBody.generationConfig?.thinkingConfig?.includeThoughts).toBeUndefined();
  });

  it('injects output_config.effort = medium in direct mode when model does not have -high and no client thinking is provided', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://direct-claude.example.com/v1/messages',
      serverUrl: 'https://direct-claude.example.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUpstreamUrl).toBe('https://direct-claude.example.com/v1/messages');
    expect(capturedBody.model).toBe('gemini-2.5-flash');
    expect(capturedBody.output_config).toEqual({ effort: 'medium' });
  });

  it('preserves client output_config.effort in direct mode without overriding to medium', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://direct-claude.example.com/v1/messages',
      serverUrl: 'https://direct-claude.example.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }],
        output_config: { effort: 'low' }
      });

    expect(res.status).toBe(200);
    expect(capturedBody.output_config).toEqual({ effort: 'low' });
  });

  it('preserves client thinking: disabled in direct mode without injecting output_config.effort', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://direct-claude.example.com/v1/messages',
      serverUrl: 'https://direct-claude.example.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'direct'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }],
        thinking: { type: 'disabled' }
      });

    expect(res.status).toBe(200);
    expect(capturedBody.output_config).toBeUndefined();
    expect(capturedBody.thinking).toEqual({ type: 'disabled' });
  });

  it('injects thinkingLevel: MEDIUM in proxy mode when model does not have -high and no client thinking is provided', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingLevel: 'MEDIUM'
    });
  });

  it('preserves client thinking: disabled in proxy mode without injecting thinkingLevel: MEDIUM', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      serverUrl: 'https://generativelanguage.googleapis.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }],
        thinking: { type: 'disabled' }
      });

    expect(res.status).toBe(200);
    expect(capturedBody.generationConfig?.thinkingConfig).toEqual({
      thinkingBudget: 0
    });
  });

  it('does NOT inject thinkingConfig in count_tokens for models without -high', async () => {
    jest.spyOn(upstreamManager, 'getUpstreamUrl').mockReturnValue({
      targetUrl: 'https://custom-proxy.com/v1beta/models/gemini-2.5-flash:countTokens',
      serverUrl: 'https://custom-proxy.com',
      serverIndex: 0,
      weight: 1,
      serverType: 'proxy'
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'client-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Count this' }]
      });

    expect(res.status).toBe(200);
    expect(capturedBody.generationConfig).toBeUndefined();
    expect(capturedBody.generateContentRequest?.generationConfig).toBeUndefined();
  });
});
