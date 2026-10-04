// tests/adminRoutes.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { adminRoutes } from '../src/admin/routes/adminRoutes';
import { WorkerEnv } from '../src/env';

describe('adminRoutes', () => {
  const env: WorkerEnv = {
    ADMIN_SECRET_KEY: 'test-admin-secret',
  };

  it('should reject unauthorized requests to /api/admin/status with 401', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/status', {}, env);
    expect(res.status).toBe(401);
  });

  it('should accept authorized requests with x-admin-key header', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/status', {
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe('ok');
    expect(data.runtime).toBe('cloudflare-worker');
  });

  it('should get and update config via /api/admin/config', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const getRes = await app.request('/api/admin/config', {
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(getRes.status).toBe(200);
    const configData: any = await getRes.json();
    expect(configData.GEMINI_BASE_URL).toBeDefined();

    const postRes = await app.request('/api/admin/config', {
      method: 'POST',
      headers: {
        'x-admin-key': 'test-admin-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ LOG_LEVEL: 'debug' }),
    }, env);
    expect(postRes.status).toBe(200);
    const updated: any = await postRes.json();
    expect(updated.LOG_LEVEL).toBe('debug');
  });
});
