// tests/claudeRoutes.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { claudeRoutes } from '../src/proxy/routes/claudeRoutes';
import { WorkerEnv } from '../src/env';

describe('claudeRoutes', () => {
  it('should return Claude error format when request body is invalid or missing model', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/v1', claudeRoutes);

    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }, {} as WorkerEnv);

    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.type).toBe('error');
    expect(data.error.type).toBe('invalid_request_error');
  });

  it('should handle /v1/models successfully', async () => {
    const app = new Hono<{ Bindings: WorkerEnv }>();
    app.route('/v1', claudeRoutes);

    const res = await app.request('/v1/models', { method: 'GET' }, {} as WorkerEnv);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
  });
});
