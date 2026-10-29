import express from 'express';
import request from 'supertest';
import fetch from 'node-fetch';
import adminRoutes from '../src/admin/routes/adminRoutes';
import upstreamManager from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Upstream /health Probe & Admin Health API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.adminSecretKey = '';
  });

  afterAll(async () => {
    await updateConfig({ logLevel: 'info' });
  });

  it('probeNodeHealth marks healthy when upstream returns HTTP 200', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: () => 'application/json'
      }
    });

    const result = await upstreamManager.probeNodeHealth({
      url: 'https://upstream-1.test.com',
      weight: 1,
      enabled: true,
      type: 'proxy'
    });

    expect(result.healthStatus).toBe('healthy');
    expect(result.healthOk).toBe(true);
    expect(typeof result.healthLatency).toBe('number');
    expect(result.healthError).toBeUndefined();
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://upstream-1.test.com/health',
      expect.objectContaining({
        method: 'GET'
      })
    );
  });

  it('probeNodeHealth marks unhealthy when upstream returns HTTP 502', async () => {
    mockedFetch.mockResolvedValueOnce({
      status: 502,
      headers: {
        get: () => 'application/json'
      }
    });

    const result = await upstreamManager.probeNodeHealth({
      url: 'https://upstream-fail.test.com',
      weight: 1,
      enabled: true,
      type: 'proxy'
    });

    expect(result.healthStatus).toBe('unhealthy');
    expect(result.healthOk).toBe(false);
    expect(result.healthError).toBe('HTTP 502');
  });

  it('probeNodeHealth handles network timeouts or connection refused', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8002'));

    const result = await upstreamManager.probeNodeHealth({
      url: 'http://127.0.0.1:8002',
      weight: 1,
      enabled: true,
      type: 'proxy'
    });

    expect(result.healthStatus).toBe('unhealthy');
    expect(result.healthOk).toBe(false);
    expect(result.healthError).toContain('ECONNREFUSED');
  });

  it('getUpstreamServerStatusListWithHealth concurrently checks all nodes and skips disabled nodes', async () => {
    const originalServers = config.upstreamServers;
    try {
      config.upstreamServers = [
        { url: 'https://node-1.test.com', weight: 1, enabled: true, type: 'proxy' },
        { url: 'https://node-disabled.test.com', weight: 1, enabled: false, type: 'proxy' },
        { url: 'https://node-2.test.com', weight: 2, enabled: true, type: 'direct' },
      ];

      mockedFetch
        .mockResolvedValueOnce({ status: 200, headers: { get: () => 'application/json' } })
        .mockResolvedValueOnce({ status: 500, headers: { get: () => 'application/json' } });

      const statusList = await upstreamManager.getUpstreamServerStatusListWithHealth();
      expect(statusList).toHaveLength(3);

      // Node 1: enabled, 200 -> healthy
      expect(statusList[0].healthStatus).toBe('healthy');
      expect(statusList[0].healthOk).toBe(true);

      // Node 2: disabled -> skipped
      expect(statusList[1].enabled).toBe(false);
      expect(statusList[1].healthOk).toBe(false);
      expect(statusList[1].healthError).toBe('Node is disabled');

      // Node 3: enabled, 500 -> unhealthy
      expect(statusList[2].healthStatus).toBe('unhealthy');
      expect(statusList[2].healthOk).toBe(false);
      expect(statusList[2].healthError).toBe('HTTP 500');
    } finally {
      config.upstreamServers = originalServers;
    }
  });

  it('GET /api/admin/upstream/health returns upstreamServers with health status', async () => {
    mockedFetch.mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' }
    });

    const res = await request(app).get('/api/admin/upstream/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('upstreamServers');
    expect(Array.isArray(res.body.upstreamServers)).toBe(true);
    expect(res.body.upstreamServers[0]).toHaveProperty('healthOk');
  });

  it('GET /api/admin/status and /api/admin/stats include upstream health probe', async () => {
    mockedFetch.mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' }
    });

    const statusRes = await request(app).get('/api/admin/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toHaveProperty('upstreamStatus');
    expect(statusRes.body.upstreamStatus[0]).toHaveProperty('healthOk');

    const statsRes = await request(app).get('/api/admin/stats?range=today');
    expect(statsRes.status).toBe(200);
    expect(statsRes.body).toHaveProperty('upstreamServers');
    expect(statsRes.body.upstreamServers[0]).toHaveProperty('healthOk');
  });
});
