import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Backend Custom Web Apps Cloud Config', () => {
  const adminKey = config.adminSecretKey || 'test-admin-key';

  beforeAll(() => {
    config.adminSecretKey = adminKey;
  });

  it('should expose customWebApps in GET /api/admin/status', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(Array.isArray(res.body.config.customWebApps)).toBe(true);
    expect(res.body.config.customWebApps.length).toBeGreaterThan(0);
    expect(res.body.config.customWebApps[0].name).toBe('Ubuntu Web UI');
  });

  it('should persist updated customWebApps via POST /api/admin/config', async () => {
    const newApps = [
      {
        id: 'app_test_1',
        name: 'Test Cloud App',
        url: 'https://test.example.com',
        color: 'from-blue-500 to-cyan-600',
        createdAt: 1726045000000,
      },
    ];

    const res = await request(app)
      .post('/api/admin/config')
      .set('x-admin-key', adminKey)
      .send({ customWebApps: newApps });

    expect(res.status).toBe(200);
    expect(res.body.config.customWebApps).toEqual(newApps);
    expect(config.customWebApps).toEqual(newApps);
  });
});
