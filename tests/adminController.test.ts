import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';
import logService from '../src/admin/services/logService';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin API Endpoints', () => {
  beforeEach(() => {
    config.adminSecretKey = '';
  });

  afterAll(async () => {
    await updateConfig({
      runtimeContextTag: 'runtime-context',
      systemRoleToInstruction: false
    });
  });

  test('GET /api/admin/status returns server configuration and status', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('config');
    expect(res.body.config).toHaveProperty('systemRoleToInstruction');
    expect(res.body.config).toHaveProperty('customSystemInstruction');
    expect(res.body.config).toHaveProperty('modelMappings');
    expect(res.body.config).toHaveProperty('logRetentionDays');
  });

  test('GET /api/admin/models returns list of configured model mappings', async () => {
    const res = await request(app).get('/api/admin/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mappings');
  });

  test('GET /api/admin/logs returns paginated list', async () => {
    const res = await request(app).get('/api/admin/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(res.body).toHaveProperty('total');
  });

  test('GET /api/admin/logs respects page and limit query parameters and returns pagination metadata', async () => {
    const res = await request(app)
      .get('/api/admin/logs?page=2&limit=10')
      .set('x-admin-key', 'test-secret-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('page', 2);
    expect(res.body).toHaveProperty('limit', 10);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('hourCount');
  });

  test('GET /api/admin/logs filters by date and hour query parameters', async () => {
    const res = await request(app).get('/api/admin/logs?date=2026-07-22&hour=15');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    if (res.body.logs.length > 0) {
      expect(res.body.logs[0].date).toBe('2026-07-22');
      expect(res.body.logs[0].hour).toBe('15');
    }
  });

  test('GET /api/admin/logs returns tree hierarchy metadata', async () => {
    const res = await request(app).get('/api/admin/logs');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tree');
    expect(typeof res.body.tree).toBe('object');
  });

  it('GET /api/admin/logs returns hourCount field for selected hour slice', async () => {
    const res = await request(app)
      .get('/api/admin/logs?limit=10')
      .set('x-admin-key', 'test-secret-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hourCount');
    expect(typeof res.body.hourCount).toBe('number');
  });

  test('POST /api/admin/config updates configuration', async () => {
    const res = await request(app)
      .post('/api/admin/config')
      .send({
        runtimeContextTag: 'admin-test-tag',
        systemRoleToInstruction: true
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.config.runtimeContextTag).toBe('admin-test-tag');
    expect(res.body.config.systemRoleToInstruction).toBe(true);
  });

  test('POST /api/admin/config with resetToEnv resets configuration to .env defaults', async () => {
    const res = await request(app)
      .post('/api/admin/config')
      .send({
        resetToEnv: true
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.config.runtimeContextTag).toBe('runtime-context');
  });

  it('GET /api/admin/logs/:date/:hour/:filename sets 1-hour immutable Cache-Control header', async () => {
    const spy = jest.spyOn(logService, 'getLogDetail').mockResolvedValue({ dummy: 'log data' });

    const res = await request(app).get('/api/admin/logs/2026-08-03/10/test-log.json');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600, immutable');
    expect(res.body).toEqual({ dummy: 'log data' });

    spy.mockRestore();
  });

  it('should list logs with early limit scanning and date/hour filtering', async () => {
    const result = await logService.listLogs(1, 10);
    expect(result).toHaveProperty('tree');
    expect(result).toHaveProperty('logs');
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBeLessThanOrEqual(10);
  });

  it('GET /api/admin/terminal-logs returns history log entries', async () => {
    const res = await request(app)
      .get('/api/admin/terminal-logs')
      .set('x-admin-key', 'test-secret-key');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('logs');
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});
