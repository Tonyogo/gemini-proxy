// tests/integration.test.ts
import { describe, it, expect, vi } from 'vitest';
import workerApp from '../src/index';
import { WorkerEnv } from '../src/env';

describe('Worker Gateway Integration', () => {
  it('should serve API routes and fallback non-API routes to assets', async () => {
    const mockAssets = {
      fetch: vi.fn(async (req) => new Response('<html>SPA</html>', { status: 200 })),
    };
    const env: WorkerEnv = {
      ASSETS: mockAssets as any,
    };

    // API route 404 test
    const apiRes = await workerApp.request('/v1/unknown-endpoint', {}, env);
    expect(apiRes.status).toBe(404);
    const apiJson: any = await apiRes.json();
    expect(apiJson.type).toBe('error');

    // UI route fallback test
    const uiRes = await workerApp.request('/ui', {}, env);
    expect(mockAssets.fetch).toHaveBeenCalled();
    expect(uiRes.status).toBe(200);

    // Root Worker Admin Accounts Servers test
    const adminEnv: WorkerEnv = {
      ...env,
      ADMIN_SECRET_KEY: 'root-admin-secret',
    };
    const serversRes = await workerApp.request('/api/admin/accounts/servers', {
      headers: { 'x-admin-key': 'root-admin-secret' },
    }, adminEnv);
    expect(serversRes.status).toBe(200);
    const serversData: any = await serversRes.json();
    expect(serversData.servers).toBeDefined();
    expect(serversData.serversMeta[0].type).toBe('direct');
  });
});
