import request from 'supertest';
import app from '../src/app';
import accountUsageService from '../src/admin/services/accountUsageService';
import config from '../config/default';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

describe('Proxy X-Account-Name Interception', () => {
  const originalMappings = config.modelMappings;

  beforeEach(() => {
    accountUsageService.resetForTest();
    jest.clearAllMocks();
    config.modelMappings = {
      'claude-3-5-sonnet': 'gemini-1.5-pro'
    };
  });

  afterAll(() => {
    config.modelMappings = originalMappings;
  });

  it('should extract X-Account-Name and record usage on non-stream Claude response', async () => {
    const headersMap = new Map<string, string>([
      ['x-account-name', 'tester-acc@google.com']
    ]);
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) || null
      },
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
      })
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      });

    expect(res.status).toBe(200);
    const usage = accountUsageService.getUsageForAccount('tester-acc@google.com');
    expect(usage).not.toBeNull();
    expect(usage!.totalSuccess).toBe(1);
    expect(usage!.totalError).toBe(0);
    expect(usage!.byModel['gemini-1.5-pro'].success).toBe(1);
  });

  it('should record error usage if upstream returns 500 with X-Account-Name', async () => {
    const headersMap = new Map<string, string>([
      ['x-account-name', 'tester-err@google.com']
    ]);
    const errObj = { error: { code: 500, message: 'Internal Server Error' } };
    mockedFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) || null
      },
      text: () => Promise.resolve(JSON.stringify(errObj)),
      json: () => Promise.resolve(errObj)
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }]
      });

    expect(res.status).toBe(500);
    const usage = accountUsageService.getUsageForAccount('tester-err@google.com');
    expect(usage).not.toBeNull();
    expect(usage!.totalSuccess).toBe(0);
    expect(usage!.totalError).toBe(1);
  });

  it('should extract X-Account-Name and record usage on Gemini proxy response', async () => {
    const headersMap = new Map<string, string>([
      ['x-account-name', 'gemini-acc@google.com']
    ]);
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => headersMap.get(h.toLowerCase()) || null
      },
      text: () => Promise.resolve(JSON.stringify({ candidates: [] })),
      json: () => Promise.resolve({ candidates: [] })
    });

    const res = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'dummy-key')
      .send({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] });

    expect(res.status).toBe(200);
    const usage = accountUsageService.getUsageForAccount('gemini-acc@google.com');
    expect(usage).not.toBeNull();
    expect(usage!.totalSuccess).toBe(1);
    expect(usage!.byModel['gemini-1.5-pro'].success).toBe(1);
  });
});
