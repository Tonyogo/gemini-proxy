import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';
import { DiscoverAppItem } from '../src/types';
import { promises as fs } from 'fs';
import * as path from 'path';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Backend DiscoverApps Cloud Config', () => {
  const adminKey = config.adminSecretKey || 'test-admin-key';
  const runtimeJsonPath = path.join(process.cwd(), 'config', 'runtime.test.json');

  beforeAll(() => {
    config.adminSecretKey = adminKey;
  });

  beforeEach(async () => {
    await updateConfig({}, { resetToEnv: true });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    try {
      await fs.unlink(runtimeJsonPath);
    } catch {
      // ignore
    }
  });

  it('should expose default discoverApps in GET /api/admin/status', async () => {
    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.config).toBeDefined();
    expect(Array.isArray(res.body.config.discoverApps)).toBe(true);
    expect(res.body.config.discoverApps.length).toBeGreaterThanOrEqual(3);
    expect(res.body.config.discoverApps[0].id).toBe('systemLogs');
    expect(res.body.config.discoverApps[0].order).toBe(0);
  });

  it('should persist reordered discoverApps and update customWebApps via POST /api/admin/config', async () => {
    const reordered: DiscoverAppItem[] = [
      {
        id: 'app_my_top_app',
        type: 'custom',
        name: 'My Top Custom App',
        icon: 'Globe',
        color: 'from-orange-500 to-amber-600',
        enabled: true,
        order: 0,
        url: 'https://top.example.com',
        createdAt: 1000,
      },
      {
        id: 'systemLogs',
        type: 'builtin',
        name: '系统日志',
        icon: 'FileText',
        color: 'from-blue-500 to-cyan-600',
        enabled: true,
        order: 1,
      },
      {
        id: 'playground',
        type: 'builtin',
        name: '接口演练',
        icon: 'Play',
        color: 'from-orange-500 to-amber-600',
        enabled: true,
        order: 2,
      },
      {
        id: 'translate',
        type: 'builtin',
        name: '双语对照',
        icon: 'Languages',
        color: 'from-indigo-500 to-purple-600',
        enabled: false,
        order: 3,
      },
    ];

    const res = await request(app)
      .post('/api/admin/config')
      .set('x-admin-key', adminKey)
      .send({ discoverApps: reordered });

    expect(res.status).toBe(200);
    expect(res.body.config.discoverApps).toBeDefined();
    expect(res.body.config.discoverApps[0].id).toBe('app_my_top_app');
    expect(res.body.config.discoverApps[0].order).toBe(0);

    // Verify config getter reflects updated order
    expect(config.discoverApps[0].id).toBe('app_my_top_app');

    // Verify customWebApps is synchronized
    expect(config.customWebApps.some(a => a.id === 'app_my_top_app')).toBe(true);
  });

  it('should automatically synthesize discoverApps when only customWebApps is configured (legacy)', async () => {
    // Reset and simulate a legacy runtime.test.json that only has customWebApps
    await updateConfig({}, { resetToEnv: true });
    await fs.writeFile(
      runtimeJsonPath,
      JSON.stringify({
        customWebApps: [
          {
            id: 'legacy_app',
            name: 'Legacy Custom App',
            url: 'https://legacy.example.com',
            createdAt: 1000,
          },
        ],
      }),
      'utf8'
    );
    // Reload runtimeOverrides by calling updateConfig with empty partial
    await updateConfig({ customWebApps: [{ id: 'legacy_app', name: 'Legacy Custom App', url: 'https://legacy.example.com', createdAt: 1000 }] });

    const res = await request(app)
      .get('/api/admin/status')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    const apps = res.body.config.discoverApps;
    expect(apps).toBeDefined();
    // Builtin apps come first (0, 1, 2, 3)
    expect(apps[0].id).toBe('systemLogs');
    expect(apps[0].order).toBe(0);
    expect(apps[1].id).toBe('playground');
    expect(apps[1].order).toBe(1);
    expect(apps[2].id).toBe('translate');
    expect(apps[2].order).toBe(2);
    expect(apps[3].id).toBe('tasks');
    expect(apps[3].order).toBe(3);
    // Legacy custom app comes after (4)
    expect(apps[4].id).toBe('legacy_app');
    expect(apps[4].order).toBe(4);
  });
});
