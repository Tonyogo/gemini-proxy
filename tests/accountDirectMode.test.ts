import request from 'supertest';
import express from 'express';
import config from '../config/default';
import adminRoutes from '../src/admin/routes/adminRoutes';
import accountUsageService from '../src/admin/services/accountUsageService';
import upstreamManager from '../src/utils/upstreamManager';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Account Controller in Direct Mode', () => {
  const originalServers = config.upstreamServers;
  const originalKey = config.adminSecretKey;

  beforeEach(() => {
    config.adminSecretKey = 'test-admin-key';
    accountUsageService.resetForTest();
    upstreamManager.reset();
  });

  afterEach(() => {
    config.upstreamServers = originalServers;
    config.adminSecretKey = originalKey;
    accountUsageService.resetForTest();
    upstreamManager.reset();
  });

  it('returns server metadata with type and keyCount in /api/admin/accounts/servers', async () => {
    config.upstreamServers = [
      { url: 'https://proxy.example.com', weight: 1, enabled: true, type: 'proxy' },
      { url: 'https://generativelanguage.googleapis.com', weight: 2, enabled: true, type: 'direct', apiKeys: ['key1', 'key2'] }
    ];

    const res = await request(app)
      .get('/api/admin/accounts/servers')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.serversMeta).toBeDefined();
    expect(res.body.serversMeta[0].type).toBe('proxy');
    expect(res.body.serversMeta[1].type).toBe('direct');
    expect(res.body.serversMeta[1].keyCount).toBe(2);
  });

  it('returns local virtual account status without network request in /api/admin/accounts/status for direct mode', async () => {
    const rawKey = 'AIzaSyDirectModeTesting12345';
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server',
        apiKeys: [rawKey]
      }
    ];

    // Seed usage
    const masked = 'AIzaSy***2345';
    accountUsageService.record(masked, 'gemini-2.5-pro', true);

    const res = await request(app)
      .get('/api/admin/accounts/status?serverIndex=0')
      .set('x-admin-key', 'test-admin-key');

    expect(res.status).toBe(200);
    expect(res.body.isDirectMode).toBe(true);
    expect(res.body.status?.accountDetails).toHaveLength(1);
    expect(res.body.status.accountDetails[0].name).toBe(masked);
    expect(res.body.status.accountDetails[0].usage.totalRequests).toBeGreaterThanOrEqual(1);
  });

  it('rejects proxy-only operations with 400 for direct mode servers', async () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        apiKeys: ['key1']
      }
    ];

    const res = await request(app)
      .post('/api/admin/accounts/upload?serverIndex=0')
      .set('x-admin-key', 'test-admin-key')
      .send({ content: 'credentials' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('代理模式');
  });
});
