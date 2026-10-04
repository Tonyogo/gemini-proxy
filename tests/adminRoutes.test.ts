// tests/adminRoutes.test.ts
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { adminRoutes } from '../src/admin/routes/adminRoutes';
import { WorkerEnv } from '../src/env';

describe('adminRoutes', () => {
  const env: WorkerEnv = {
    ADMIN_SECRET_KEY: 'test-admin-secret',
    GEMINI_API_KEYS: 'AIzaSy12345678901234567890,AIzaSy09876543210987654321',
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
    expect(data.uptime).toBe(0);
    expect(data.config).toBeDefined();
    expect(data.config.upstreamTimeoutMs).toBe(180000);
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

  it('should return server metadata via /api/admin/accounts/servers', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/accounts/servers', {
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(Array.isArray(data.servers)).toBe(true);
    expect(data.servers.length).toBeGreaterThan(0);
    expect(Array.isArray(data.serversMeta)).toBe(true);
    expect(data.serversMeta[0].type).toBe('direct');
    expect(data.serversMeta[0].keyCount).toBe(2);
  });

  it('should return account status list via /api/admin/accounts/status', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/accounts/status', {
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.isDirectMode).toBe(true);
    expect(data.status).toBeDefined();
    expect(data.status.accountDetails).toHaveLength(2);
    expect(data.status.accountDetails[0].name).toMatch(/^AIzaSy\*\*\*/);
    expect(data.status.accountDetails[0].status).toBe('ACTIVE');
  });

  it('should return error for unsupported write operations in direct mode', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/api/admin', adminRoutes);

    const res = await app.request('/api/admin/accounts/upload', {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(res.status).toBe(400);

    const toggleRes = await app.request('/api/admin/accounts/toggle-disabled', {
      method: 'POST',
      headers: { 'x-admin-key': 'test-admin-secret' },
    }, env);
    expect(toggleRes.status).toBe(400);
  });
});
