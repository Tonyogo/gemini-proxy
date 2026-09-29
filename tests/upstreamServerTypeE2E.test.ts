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

  const directKeyA = 'AIzaSyKeyAAA1111111111111111';
  const directKeyB = 'AIzaSyKeyBBB2222222222222222';
  const maskedKeyA = 'AIzaSy***1111';
  const maskedKeyB = 'AIzaSy***2222';

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

  it('runs end-to-end mixed cluster routing, direct key round-robin, and admin status virtualization', async () => {
    // 1. Configure mixed cluster: Server 0 = Proxy (allowedModels: flash), Server 1 = Direct (allowedModels: pro)
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
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Node',
        allowedModels: ['gemini-2.5-pro'],
        apiKeys: [directKeyA, directKeyB]
      }
    ];

    // Helper mock Gemini response
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

    const recordedCalls: Array<{ url: string; headers: any }> = [];
    mockedFetch.mockImplementation((url: string, opts: any) => {
      recordedCalls.push({ url, headers: opts?.headers || {} });
      return Promise.resolve(mockGeminiResponse('OK response'));
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
    expect(recordedCalls[0].url).toContain('https://proxy-upstream.example.com');
    // On proxy server, direct keys are not injected
    expect(recordedCalls[0].headers['x-goog-api-key']).toBe('client-custom-key');

    // 3. Request 2: Route to direct node with gemini-2.5-pro via Claude Messages (Key A)
    const resPro1 = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-custom-key')
      .send({
        model: 'gemini-2.5-pro',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Ping Pro 1' }]
      });

    expect(resPro1.status).toBe(200);
    expect(recordedCalls.length).toBe(2);
    expect(recordedCalls[1].url).toContain('https://generativelanguage.googleapis.com');
    expect(recordedCalls[1].headers['x-goog-api-key']).toBe(directKeyA);

    // 4. Request 3: Route to direct node with gemini-2.5-pro via Gemini Native Route (Key B round-robin)
    const resPro2 = await request(app)
      .post('/v1beta/models/gemini-2.5-pro:generateContent')
      .set('x-goog-api-key', 'client-custom-key')
      .send({
        contents: [{ role: 'user', parts: [{ text: 'Ping Pro 2 Native' }] }]
      });

    expect(resPro2.status).toBe(200);
    expect(recordedCalls.length).toBe(3);
    expect(recordedCalls[2].url).toContain('https://generativelanguage.googleapis.com');
    expect(recordedCalls[2].headers['x-goog-api-key']).toBe(directKeyB);

    // 5. Verify local account usage service recorded masked keys
    const usageA = accountUsageService.getUsageForAccount(maskedKeyA);
    const usageB = accountUsageService.getUsageForAccount(maskedKeyB);
    expect(usageA).toBeDefined();
    expect(usageA?.totalRequests).toBe(1);
    expect(usageA?.totalSuccess).toBe(1);
    expect(usageA?.byModel['gemini-2.5-pro']?.total).toBe(1);

    expect(usageB).toBeDefined();
    expect(usageB?.totalRequests).toBe(1);
    expect(usageB?.totalSuccess).toBe(1);
    expect(usageB?.byModel['gemini-2.5-pro']?.total).toBe(1);

    // 6. Admin API: /api/admin/accounts/servers metadata
    const serversRes = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', adminSecret);

    expect(serversRes.status).toBe(200);
    expect(serversRes.body.serversMeta[0].type).toBe('proxy');
    expect(serversRes.body.serversMeta[0].keyCount).toBe(0);
    expect(serversRes.body.serversMeta[1].type).toBe('direct');
    expect(serversRes.body.serversMeta[1].keyCount).toBe(2);

    // 7. Admin API: /api/admin/accounts/status?serverId=1 for direct node
    const statusRes = await request(app)
      .get('/api/admin/accounts/status?serverId=1')
      .set('x-admin-key', adminSecret);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.isDirectMode).toBe(true);
    expect(statusRes.body.status.streamingMode).toBe('DIRECT');
    expect(statusRes.body.status.usageCount).toBe(2);
    expect(statusRes.body.status.accountDetails).toHaveLength(2);

    const detailsA = statusRes.body.status.accountDetails[0];
    const detailsB = statusRes.body.status.accountDetails[1];
    expect(detailsA.name).toBe(maskedKeyA);
    expect(detailsA.status).toBe('ACTIVE');
    expect(detailsA.usage.totalRequests).toBe(1);

    expect(detailsB.name).toBe(maskedKeyB);
    expect(detailsB.status).toBe('ACTIVE');
    expect(detailsB.usage.totalRequests).toBe(1);

    // 8. Admin API: Operation protection on direct node
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
