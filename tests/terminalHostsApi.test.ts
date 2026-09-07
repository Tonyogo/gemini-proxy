import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

describe('Admin Terminal Hosts API', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  test('rejects GET /api/admin/terminal/hosts without valid admin key', async () => {
    const res = await request(app).get('/api/admin/terminal/hosts');
    expect(res.status).toBe(401);
  });

  test('returns hosts list including localhost with valid admin key', async () => {
    const key = config.adminSecretKey || 'test-key';
    const res = await request(app)
      .get('/api/admin/terminal/hosts')
      .set('x-admin-key', key);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hosts');
    expect(Array.isArray(res.body.hosts)).toBe(true);
    const local = res.body.hosts.find((h: any) => h.id === 'local');
    expect(local).toBeDefined();
    expect(local.status).toBe('online');
  });
});
