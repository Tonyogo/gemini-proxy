import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Upstream Management', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  it('GET /api/admin/status returns structured upstreamServers and upstreamStatus', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toHaveProperty('upstreamServers');
    expect(Array.isArray(res.body.config.upstreamServers)).toBe(true);
    expect(res.body).toHaveProperty('upstreamStatus');
    expect(Array.isArray(res.body.upstreamStatus)).toBe(true);
  });

  it('PUT /api/admin/config updates upstreamServers and recomputes effectivePercent', async () => {
    const newServers = [
      { url: 'https://hk.example.com', weight: 70, enabled: true, name: 'HK Gateway' },
      { url: 'https://us.example.com', weight: 30, enabled: true, name: 'US Gateway' }
    ];

    const putRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', secretKey)
      .send({ upstreamServers: newServers });

    expect(putRes.status).toBe(200);
    expect(putRes.body.config.upstreamServers).toEqual(newServers);
    expect(putRes.body.config.geminiBaseUrl).toBe('https://hk.example.com,https://us.example.com');

    // Verify GET /status reflects the new distribution
    const statusRes = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    const statuses = statusRes.body.upstreamStatus;
    expect(statuses[0].effectivePercent).toBe(70);
    expect(statuses[1].effectivePercent).toBe(30);
  });
});
