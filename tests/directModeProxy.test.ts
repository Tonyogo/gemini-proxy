import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import accountUsageService from '../src/admin/services/accountUsageService';
import upstreamManager from '../src/utils/upstreamManager';
import fetch from 'node-fetch';

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

  it('injects selectedApiKey into x-goog-api-key and records masked key usage in Claude Messages proxy', async () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Gemini',
        apiKeys: ['AIzaSyDirectTestKey1234567890']
      }
    ];

    mockedFetch.mockImplementation((url: string, opts: any) => {
      const headers = opts?.headers || {};
      const googKey = headers['x-goog-api-key'];
      if (googKey === 'AIzaSyDirectTestKey1234567890') {
        const payload = {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello from direct mode!' }]
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 }
        };
        return Promise.resolve({
          status: 200,
          ok: true,
          headers: {
            get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null
          },
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(JSON.stringify(payload))
        });
      }
      return Promise.resolve({
        status: 401,
        ok: false,
        headers: {
          get: () => null
        },
        json: () => Promise.resolve({ error: 'Unauthorized or wrong key' }),
        text: () => Promise.resolve(JSON.stringify({ error: 'Unauthorized or wrong key' }))
      });
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalled();
    const lastCall = mockedFetch.mock.calls[0];
    expect(lastCall[1].headers['x-goog-api-key']).toBe('AIzaSyDirectTestKey1234567890');

    // Verify usage recorded under masked key name
    const maskedKey = 'AIzaSy***7890';
    const usage = accountUsageService.getUsageForAccount(maskedKey);
    expect(usage).not.toBeNull();
    expect(usage?.totalSuccess).toBeGreaterThanOrEqual(1);
  });

  it('injects selectedApiKey and records masked key usage in native Gemini proxy', async () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Gemini',
        apiKeys: ['AIzaSyDirectGeminiKey9876543210']
      }
    ];

    mockedFetch.mockImplementation((url: string, opts: any) => {
      const headers = opts?.headers || {};
      const googKey = headers['x-goog-api-key'];
      if (googKey === 'AIzaSyDirectGeminiKey9876543210') {
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
            get: (h: string) => h.toLowerCase() === 'content-type' ? 'application/json' : null
          },
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(JSON.stringify(payload))
        });
      }
      return Promise.resolve({
        status: 401,
        ok: false,
        headers: {
          get: () => null
        },
        json: () => Promise.resolve({ error: 'Wrong key' }),
        text: () => Promise.resolve(JSON.stringify({ error: 'Wrong key' }))
      });
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .set('x-goog-api-key', 'client-goog-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
      });

    expect(res.status).toBe(200);
    const maskedKey = 'AIzaSy***3210';
    const usage = accountUsageService.getUsageForAccount(maskedKey);
    expect(usage).not.toBeNull();
    expect(usage?.totalSuccess).toBeGreaterThanOrEqual(1);
  });
});
