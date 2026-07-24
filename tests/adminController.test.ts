import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Endpoints', () => {
  beforeEach(() => {
    config.adminSecretKey = '';
  });

  test('GET /api/admin/status returns server configuration and status', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('config');
    expect(res.body.config).toHaveProperty('systemRoleToInstruction');
  });

  test('GET /api/admin/models returns list of configured models', async () => {
    const res = await request(app).get('/api/admin/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('models');
  });

  test('GET /api/admin/logs returns paginated list', async () => {
    const res = await request(app).get('/api/admin/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(res.body).toHaveProperty('total');
  });

  test('GET /api/admin/logs returns tree hierarchy metadata', async () => {
    const res = await request(app).get('/api/admin/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tree');
    expect(typeof res.body.tree).toBe('object');
  });
});
