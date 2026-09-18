import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';
import { terminalHostManager } from '../src/admin/services/terminalHostManager';

describe('Admin Terminal Hosts API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  const originalKey = config.adminSecretKey;
  const key = config.adminSecretKey || 'test-key';

  beforeAll(() => {
    config.adminSecretKey = key;
  });

  afterAll(() => {
    config.adminSecretKey = originalKey;
  });

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

  test('DELETE /api/admin/terminal/hosts/offline rejects requests without admin key', async () => {
    const res = await request(app).delete('/api/admin/terminal/hosts/offline');
    expect(res.status).toBe(401);
  });

  test('DELETE /api/admin/terminal/hosts/offline prunes all offline hosts and returns prunedIds', async () => {
    const key = config.adminSecretKey || 'test-key';
    const mockWs = { readyState: 1, send: jest.fn() };

    terminalHostManager.registerAgent({
      hostId: 'node-to-delete-1',
      name: 'Delete Node 1',
      ip: '10.0.0.91',
      platform: 'linux',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('node-to-delete-1');

    const res = await request(app)
      .delete('/api/admin/terminal/hosts/offline')
      .set('x-admin-key', key);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      prunedCount: expect.any(Number),
      prunedIds: expect.arrayContaining(['node-to-delete-1']),
    });
    expect(terminalHostManager.getHost('node-to-delete-1')).toBeNull();
  });

  test('returns hosts sorted with online hosts first and sorted by name A-Z', () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    // Clear and register out of order
    terminalHostManager.registerAgent({
      hostId: 'sort-offline-z',
      name: 'Zeta Node',
      ip: '10.0.0.10',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('sort-offline-z');

    terminalHostManager.registerAgent({
      hostId: 'sort-online-b',
      name: 'Beta Node',
      ip: '10.0.0.11',
      agentWs: mockWs,
    });

    terminalHostManager.registerAgent({
      hostId: 'sort-offline-a',
      name: 'Alpha Offline Node',
      ip: '10.0.0.12',
      agentWs: mockWs,
    });
    terminalHostManager.unregisterAgent('sort-offline-a');

    terminalHostManager.registerAgent({
      hostId: 'sort-online-a',
      name: 'Alpha Online Node',
      ip: '10.0.0.13',
      agentWs: mockWs,
    });

    const hosts = terminalHostManager.getHosts();
    const testHostIds = hosts
      .map(h => h.id)
      .filter(id => id.startsWith('sort-'));

    // Expected order: online hosts sorted (Alpha Online, Beta), then offline hosts sorted (Alpha Offline, Zeta)
    expect(testHostIds).toEqual([
      'sort-online-a',
      'sort-online-b',
      'sort-offline-a',
      'sort-offline-z',
    ]);
  });
});
