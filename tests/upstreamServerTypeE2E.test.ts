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

describe('Upstream Server Types and Direct Mode E2E Integration', () => {
  const originalServers = config.upstreamServers;
  const originalAdminKey = config.adminSecretKey;
  const adminSecret = 'test-e2e-admin-secret';

  beforeEach(() => {
    config.adminSecretKey = adminSecret;
    accountUsageService.resetForTest();
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    config.adminSecretKey = originalAdminKey;
    accountUsageService.resetForTest();
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  it('runs end-to-end mixed cluster routing, direct forwarding, and admin status aggregation', async () => {
    // 1. Configure mixed cluster: Server 0 = Proxy (flash), Server 1 = Direct (claude-sonnet-4-5)
    config.upstreamServers = [
      {
        url: 'https://proxy-upstream.example.com',
        weight: 1,
        enabled: true,
        type: 'proxy',
        name: 'Proxy Node',
        allowedModels: ['gemini-2.5-flash']
      },
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Node',
        allowedModels: ['claude-sonnet-4-5']
      }
    ];

    const mockGeminiResponse = (text: string) => ({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
      },
      text: () =>
        Promise.resolve(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: 'model',
                  parts: [{ text }]
                },
                finishReason: 'STOP'
              }
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
          })
        ),
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text }]
              },
              finishReason: 'STOP'
            }
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
        })
    });

    const mockClaudeDirectResponse = (text: string) => ({
      status: 200,
      ok: true,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
      },
      json: () =>
        Promise.resolve({
          id: 'msg_direct_e2e',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 15, output_tokens: 25 }
        }),
      text: () =>
        Promise.resolve(
          JSON.stringify({
            id: 'msg_direct_e2e',
            type: 'message',
            role: 'assistant',
            model: 'claude-sonnet-4-5',
            content: [{ type: 'text', text }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 15, output_tokens: 25 }
          })
        )
    });

    const recordedCalls: Array<{ url: string; headers: any }> = [];
    mockedFetch.mockImplementation((url: string, opts: any) => {
      recordedCalls.push({ url, headers: opts?.headers || {} });
      if (url.includes('/v1/messages')) {
        return Promise.resolve(mockClaudeDirectResponse('Direct Claude Response'));
      }
      return Promise.resolve(mockGeminiResponse('Proxy Gemini Response'));
    });

    // 2. Request 1: Route to proxy node with gemini-2.5-flash via Claude Messages
    const resFlash = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-custom-key')
      .send({
        model: 'gemini-2.5-flash',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Ping Flash' }]
      });

    expect(resFlash.status).toBe(200);
    expect(recordedCalls.length).toBe(1);
    expect(recordedCalls[0].url).toContain('https://proxy-upstream.example.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(recordedCalls[0].headers['x-goog-api-key']).toBe('client-custom-key');

    // 3. Request 2: Route to direct node with claude-sonnet-4-5 via Claude Messages (native forward)
    const resDirect = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-direct-key')
      .send({
        model: 'claude-sonnet-4-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Ping Direct' }]
      });

    expect(resDirect.status).toBe(200);
    expect(recordedCalls.length).toBe(2);
    expect(recordedCalls[1].url).toBe('https://direct-claude.example.com/v1/messages');
    expect(recordedCalls[1].headers['x-api-key']).toBe('client-direct-key');
    expect(resDirect.body.content[0].text).toBe('Direct Claude Response');

    // 4. Verify local account usage service recorded direct node usage under __direct_node_1__
    const usageDirect = accountUsageService.getUsageForAccount('__direct_node_1__');
    expect(usageDirect).toBeDefined();
    expect(usageDirect?.totalRequests).toBe(1);
    expect(usageDirect?.totalSuccess).toBe(1);
    expect(usageDirect?.byModel['claude-sonnet-4-5']?.total).toBe(1);

    // 5. Admin API: /api/admin/accounts/servers metadata
    const serversRes = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', adminSecret);

    expect(serversRes.status).toBe(200);
    expect(serversRes.body.serversMeta[0].type).toBe('proxy');
    expect(serversRes.body.serversMeta[1].type).toBe('direct');

    // 6. Admin API: /api/admin/accounts/status?serverId=1 for direct node
    const statusRes = await request(app)
      .get('/api/admin/accounts/status?serverId=1')
      .set('x-admin-key', adminSecret);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.isDirectMode).toBe(true);
    expect(statusRes.body.status.streamingMode).toBe('DIRECT');
    expect(statusRes.body.status.usageCount).toBe(1);
    expect(statusRes.body.status.accountDetails).toHaveLength(1);

    const details = statusRes.body.status.accountDetails[0];
    expect(details.name).toBe('Direct Node');
    expect(details.status).toBe('ACTIVE');
    expect(details.usage.totalRequests).toBe(1);
    expect(details.usage.byModel['claude-sonnet-4-5'].requests).toBe(1);

    // 7. Admin API: Operation protection on direct node
    const uploadRes = await request(app)
      .post('/api/admin/accounts/upload?serverId=1')
      .set('x-admin-key', adminSecret)
      .send({ content: '{}' });

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toContain('代理模式');

    const switchRes = await request(app)
      .put('/api/admin/accounts/current?serverId=1')
      .set('x-admin-key', adminSecret)
      .send({ index: 1 });

    expect(switchRes.status).toBe(400);
    expect(switchRes.body.error).toContain('代理模式');
  });
});
