import request from 'supertest';
import express from 'express';
import http from 'http';
import adminRoutes from '../src/admin/routes/adminRoutes';
import { config } from '../config/default';

describe('Mihomo Reverse Proxy Endpoints', () => {
  let app: express.Application;
  let mockMihomoServer: http.Server;
  const mockPort = 19090;

  beforeAll((done) => {
    // Spin up mock Mihomo HTTP server
    const mockApp = express();
    mockApp.use(express.json());

    mockApp.get('/version', (req, res) => {
      const auth = req.headers.authorization;
      if (auth !== 'Bearer test-secret') {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      res.json({ version: 'Mihomo Meta v1.19.0' });
    });

    mockApp.get('/traffic', (req, res) => {
      res.json({ up: 1024, down: 4096 });
    });

    mockApp.get('/configs', (req, res) => {
      res.json({ mode: 'rule', 'port': 7890 });
    });

    mockApp.patch('/configs', (req, res) => {
      res.json({ success: true, mode: req.body.mode });
    });

    mockApp.get('/proxies', (req, res) => {
      res.json({
        proxies: {
          GLOBAL: { name: 'GLOBAL', type: 'Selector', now: 'DIRECT', all: ['DIRECT', 'PROXY_1'] },
          DIRECT: { name: 'DIRECT', type: 'Direct' },
          PROXY_1: { name: 'PROXY_1', type: 'Shadowsocks' }
        }
      });
    });

    mockApp.put('/proxies/:group', (req, res) => {
      res.status(204).end();
    });

    mockApp.get('/proxies/:name/delay', (req, res) => {
      res.json({ delay: 88 });
    });

    mockApp.get('/connections', (req, res) => {
      res.json({ downloadTotal: 10000, uploadTotal: 5000, connections: [] });
    });

    mockApp.delete('/connections', (req, res) => {
      res.status(204).end();
    });

    mockMihomoServer = mockApp.listen(mockPort, () => {
      config.mihomoApiUrl = `http://127.0.0.1:${mockPort}`;
      config.mihomoSecret = 'test-secret';
      config.adminSecretKey = 'test-admin-key';

      app = express();
      app.use(express.json());
      app.use('/api/admin', adminRoutes);
      done();
    });
  });

  afterAll((done) => {
    mockMihomoServer.close(done);
  });

  it('rejects unauthorized requests without x-admin-key', async () => {
    const res = await request(app).get('/api/admin/mihomo/status');
    expect(res.status).toBe(401);
  });

  it('proxies /status with valid secret', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/status')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.version).toContain('Mihomo Meta');
  });

  it('proxies /traffic successfully', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/traffic')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.up).toBe(1024);
    expect(res.body.down).toBe(4096);
  });

  it('proxies /proxies and node selection', async () => {
    const listRes = await request(app)
      .get('/api/admin/mihomo/proxies')
      .set('x-admin-key', 'test-admin-key');
    expect(listRes.status).toBe(200);
    expect(listRes.body.proxies.GLOBAL).toBeDefined();

    const switchRes = await request(app)
      .put('/api/admin/mihomo/proxies/GLOBAL')
      .set('x-admin-key', 'test-admin-key')
      .send({ name: 'PROXY_1' });
    expect(switchRes.status).toBe(204);
  });

  it('proxies node delay check', async () => {
    const res = await request(app)
      .get('/api/admin/mihomo/proxies/PROXY_1/delay?timeout=3000')
      .set('x-admin-key', 'test-admin-key');
    expect(res.status).toBe(200);
    expect(res.body.delay).toBe(88);
  });

  it('proxies /configs mode update', async () => {
    const res = await request(app)
      .patch('/api/admin/mihomo/configs')
      .set('x-admin-key', 'test-admin-key')
      .send({ mode: 'global' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('global');
  });

  it('overrides target URL and secret when x-mihomo-url and x-mihomo-secret headers are provided', async () => {
    // Test with custom secret header
    const res = await request(app)
      .get('/api/admin/mihomo/status')
      .set('x-admin-key', 'test-admin-key')
      .set('x-mihomo-secret', 'test-secret');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Test failure with wrong custom secret header
    const failRes = await request(app)
      .get('/api/admin/mihomo/status')
      .set('x-admin-key', 'test-admin-key')
      .set('x-mihomo-secret', 'wrong-secret');
    expect(failRes.status).toBe(200);
    expect(failRes.body.ok).toBe(false);
    expect(failRes.body.statusCode).toBe(401);

    // Test failure with unreachable target URL
    const urlFailRes = await request(app)
      .get('/api/admin/mihomo/status')
      .set('x-admin-key', 'test-admin-key')
      .set('x-mihomo-url', 'http://127.0.0.1:19999');
    expect(urlFailRes.status).toBe(200);
    expect(urlFailRes.body.ok).toBe(false);
    expect(urlFailRes.body.statusCode).toBe(502);
  });
});
