import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Allowed Models Management', () => {
  const secretKey = 'test-secret';
  beforeAll(() => {
    config.adminSecretKey = secretKey;
  });

  it('GET /api/admin/status returns allowedModels array in config', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toHaveProperty('allowedModels');
    expect(Array.isArray(res.body.config.allowedModels)).toBe(true);
  });

  it('PUT /api/admin/config updates allowedModels and persists into runtime config', async () => {
    const models = ['gemini-2.5-pro', 'claude-3-7-sonnet'];
    const putRes = await request(app)
      .put('/api/admin/config')
      .set('x-admin-key', secretKey)
      .send({ allowedModels: models });

    expect(putRes.status).toBe(200);
    expect(putRes.body.config.allowedModels).toEqual(models);

    const getRes = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', secretKey);

    expect(getRes.body.config.allowedModels).toEqual(models);
  });
});
