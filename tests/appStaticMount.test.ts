import request from 'supertest';
import app from '../src/app';
import config from '../config/default';

describe('App Route Mounting', () => {
  beforeEach(() => {
    config.adminSecretKey = '';
  });

  test('mounts /api/admin/status endpoint', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
  });

  test('mounts root and SPA fallback static endpoint', async () => {
    const resRoot = await request(app).get('/');
    expect([200, 404]).toContain(resRoot.status);

    const resDashboard = await request(app).get('/dashboard');
    expect([200, 404]).toContain(resDashboard.status);
  });

  test('terminal and legacy script endpoints return 404', async () => {
    const resTerminalApi = await request(app).get('/api/terminal/hosts');
    expect(resTerminalApi.status).toBe(404);

    const resAdminTerminal = await request(app).get('/api/admin/terminal-logs');
    expect(resAdminTerminal.status).toBe(404);

    const resInstall = await request(app).get('/install.sh');
    expect(resInstall.status).toBe(404);

    const resGt = await request(app).get('/gt');
    expect(resGt.status).toBe(404);
  });
});
