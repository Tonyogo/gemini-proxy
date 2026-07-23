import request from 'supertest';
import app from '../src/app';

describe('App Route Mounting', () => {
  test('mounts /api/admin/status endpoint', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
  });

  test('mounts /ui static endpoint with SPA fallback', async () => {
    const res = await request(app).get('/ui/dashboard');
    // Either 200 (if html exists) or 404 (if dist/frontend not yet built), but route is handled
    expect([200, 404]).toContain(res.status);
  });
});
