import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import accountUsageService from '../src/admin/services/accountUsageService';
import upstreamManager from '../src/utils/upstreamManager';
import payloadLogger from '../src/proxy/services/payloadLogger';
import fetch from 'node-fetch';
import { Readable } from 'stream';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('Direct Mode Proxy Forwarding & Account Usage', () => {
  const originalServers = config.upstreamServers;

  beforeEach(() => {
    accountUsageService.resetForTest();
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  it('forwards Claude Messages directly to upstream /v1/messages and records node usage without protocol translation', async () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Claude Node'
      }
    ];

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    mockedFetch.mockImplementation((url: string, opts: any) => {
      capturedUrl = url;
      capturedHeaders = opts?.headers || {};
      capturedBody = opts?.body ? JSON.parse(opts.body) : null;

      const payload = {
        id: 'msg_direct_123',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hello from native Claude direct mode!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 8 }
      };

      return Promise.resolve({
        status: 200,
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
        },
        json: () => Promise.resolve(payload),
        text: () => Promise.resolve(JSON.stringify(payload))
      });
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'sk-ant-client-key')
      .set('anthropic-version', '2023-06-01')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi direct' }]
      });

    expect(res.status).toBe(200);
    expect(capturedUrl).toBe('https://direct-claude.example.com/v1/messages');
    expect(capturedHeaders['x-api-key']).toBe('sk-ant-client-key');
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
    expect(capturedBody.model).toBe('claude-3-5-sonnet-20241022');
    expect(res.body.id).toBe('msg_direct_123');
    expect(res.body.content[0].text).toBe('Hello from native Claude direct mode!');

    // Verify usage recorded under __direct_node_0__
    const usage = accountUsageService.getUsageForAccount('__direct_node_0__');
    expect(usage).not.toBeNull();
    expect(usage?.totalSuccess).toBe(1);
    expect(usage?.byModel['claude-3-5-sonnet-20241022']?.success).toBe(1);

    // Verify payloadLogger.saveTransaction logged raw Claude clientReq and directReq
    expect(payloadLogger.saveTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' }),
      expect.objectContaining({ model: 'claude-3-5-sonnet-20241022' }),
      expect.objectContaining({ id: 'msg_direct_123' }),
      expect.objectContaining({ id: 'msg_direct_123' }),
      expect.any(Number),
      '/v1/messages',
      200,
      false,
      '__direct_node_0__',
      0
    );
  });

  it('streams raw Claude SSE events directly in direct mode and parses sseEvents for payload logging', async () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Claude Node'
      }
    ];

    const sseChunk1 = 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_s_1","type":"message","role":"assistant","content":[]}}\n\n';
    const sseChunk2 = ': ping\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Direct stream"}}\n\n';
    const sseChunk3 = 'event: message_stop\ndata: {"type":"message_stop"}\n\n';

    mockedFetch.mockImplementation(() => {
      const stream = new Readable({
        read() {
          this.push(sseChunk1);
          this.push(sseChunk2);
          this.push(sseChunk3);
          this.push(null);
        }
      });

      return Promise.resolve({
        status: 200,
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'text/event-stream' : null)
        },
        body: stream
      });
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'sk-ant-client-key')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        stream: true,
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi stream' }]
      });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: message_start');
    expect(res.text).toContain(': ping');
    expect(res.text).toContain('"text":"Direct stream"');

    const usage = accountUsageService.getUsageForAccount('__direct_node_0__');
    expect(usage?.totalSuccess).toBe(1);

    expect(payloadLogger.saveTransaction).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(Object),
      expect.arrayContaining([
        expect.objectContaining({ type: 'message_start' }),
        expect.objectContaining({ type: 'content_block_delta' }),
        expect.objectContaining({ type: 'message_stop' })
      ]),
      expect.arrayContaining([
        expect.objectContaining({ type: 'message_start' }),
        expect.objectContaining({ type: 'content_block_delta' }),
        expect.objectContaining({ type: 'message_stop' })
      ]),
      expect.any(Number),
      '/v1/messages',
      200,
      true,
      '__direct_node_0__',
      0
    );
  });

  it('forwards /v1/messages/count_tokens and /v1/models directly in direct mode', async () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Claude Node'
      }
    ];

    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/v1/messages/count_tokens')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null },
          json: () => Promise.resolve({ input_tokens: 42 }),
          text: () => Promise.resolve(JSON.stringify({ input_tokens: 42 }))
        });
      }
      if (url.endsWith('/v1/models')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null },
          json: () => Promise.resolve({
            data: [{ id: 'claude-3-5-sonnet-20241022', type: 'model', display_name: 'Claude 3.5 Sonnet' }]
          }),
          text: () => Promise.resolve(JSON.stringify({
            data: [{ id: 'claude-3-5-sonnet-20241022', type: 'model', display_name: 'Claude 3.5 Sonnet' }]
          }))
        });
      }
      return Promise.resolve({ status: 404, ok: false, text: () => 'Not found' });
    });

    const tokensRes = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'sk-ant-client')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Count tokens' }]
      });

    expect(tokensRes.status).toBe(200);
    expect(tokensRes.body).toEqual({ input_tokens: 42 });

    const modelsRes = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'sk-ant-client');

    expect(modelsRes.status).toBe(200);
    expect(modelsRes.body.data[0].id).toBe('claude-3-5-sonnet-20241022');
  });

  it('records failure in accountUsageService and upstream circuit breaker on direct upstream 5xx error', async () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Claude Node'
      }
    ];

    mockedFetch.mockImplementation(() => {
      return Promise.resolve({
        status: 502,
        ok: false,
        headers: { get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null },
        json: () => Promise.resolve({ error: { type: 'api_error', message: 'Bad Gateway upstream' } }),
        text: () => Promise.resolve(JSON.stringify({ error: { type: 'api_error', message: 'Bad Gateway upstream' } }))
      });
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'sk-ant-client')
      .send({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Fail' }]
      });

    expect(res.status).toBe(502);
    const usage = accountUsageService.getUsageForAccount('__direct_node_0__');
    expect(usage?.totalError).toBe(1);
  });

  it('passes through client auth in native Gemini proxy and records node usage', async () => {
    config.upstreamServers = [
      {
        url: 'https://direct-gemini.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Gemini'
      }
    ];

    let capturedHeaders: Record<string, string> = {};

    mockedFetch.mockImplementation((url: string, opts: any) => {
      capturedHeaders = opts?.headers || {};
      const payload = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Native Gemini direct response' }]
            },
            finishReason: 'STOP'
          }
        ]
      };
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
        },
        json: () => Promise.resolve(payload),
        text: () => Promise.resolve(JSON.stringify(payload))
      });
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .set('x-goog-api-key', 'client-goog-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
      });

    expect(res.status).toBe(200);
    expect(capturedHeaders['x-goog-api-key']).toBe('client-goog-key');

    const usage = accountUsageService.getUsageForAccount('__direct_node_0__');
    expect(usage).not.toBeNull();
    expect(usage?.totalSuccess).toBe(1);
  });
});
