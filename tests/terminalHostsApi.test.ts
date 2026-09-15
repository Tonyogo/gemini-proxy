import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';
import { terminalHostManager } from '../src/admin/services/terminalHostManager';

describe('Admin Terminal Hosts API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  test('rejects GET /api/admin/terminal/hosts without valid admin key', async () => {
    const res = await request(app).get('/api/admin/terminal/hosts');
    expect(res.status).toBe(401);
  });

  test('returns registered agent hosts list with valid admin key', async () => {
    const key = config.adminSecretKey || 'test-key';
    const mockWs = { readyState: 1, send: jest.fn() };

    terminalHostManager.registerAgent({
      hostId: 'api-test-node',
      name: 'API Test Node',
      hostname: 'api-node',
      ip: '10.0.0.1',
      platform: 'linux',
      agentWs: mockWs,
    });

    const res = await request(app)
      .get('/api/admin/terminal/hosts')
      .set('x-admin-key', key);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hosts');
    expect(Array.isArray(res.body.hosts)).toBe(true);

    const host = res.body.hosts.find((h: any) => h.id === 'api-test-node');
    expect(host).toBeDefined();
    expect(host.status).toBe('online');
    expect(host.type).toBe('agent');

    terminalHostManager.unregisterAgent('api-test-node');
    const res2 = await request(app)
      .get('/api/admin/terminal/hosts')
      .set('x-admin-key', key);
    const offlineHost = res2.body.hosts.find((h: any) => h.id === 'api-test-node');
    expect(offlineHost?.status).toBe('offline');
  });

  test('prunes offline hosts older than 24 hours automatically on getHosts()', async () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: 'expired-offline-node',
      name: 'Expired Node',
      ip: '10.0.0.99',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('expired-offline-node');
    const host = terminalHostManager.getHost('expired-offline-node');
    if (host) {
      // Backdate lastSeen to 25 hours ago
      host.lastSeen = Date.now() - (25 * 60 * 60 * 1000);
    }

    terminalHostManager.registerAgent({
      hostId: 'fresh-offline-node',
      name: 'Fresh Node',
      ip: '10.0.0.98',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('fresh-offline-node');

    const hosts = terminalHostManager.getHosts();
    expect(hosts.find(h => h.id === 'expired-offline-node')).toBeUndefined();
    expect(hosts.find(h => h.id === 'fresh-offline-node')).toBeDefined();
  });

  test('pruneOfflineHosts(0) manually removes all offline hosts while preserving online hosts', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerAgent({
      hostId: 'still-online-node',
      name: 'Online Node',
      ip: '10.0.0.97',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.registerAgent({
      hostId: 'manual-offline-node',
      name: 'Manual Offline Node',
      ip: '10.0.0.96',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('manual-offline-node');

    const pruned = terminalHostManager.pruneOfflineHosts(0);
    expect(pruned).toContain('manual-offline-node');
    expect(terminalHostManager.getHost('manual-offline-node')).toBeNull();
    expect(terminalHostManager.getHost('still-online-node')).not.toBeNull();
  });
});
