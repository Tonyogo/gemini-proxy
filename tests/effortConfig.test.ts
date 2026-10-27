import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';
import claudeTranslator from '../src/proxy/services/claudeTranslator';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Effort Level Model Mappings Configuration', () => {
  beforeEach(async () => {
    config.adminSecretKey = '';
    await updateConfig({}, { resetToEnv: true });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
  });

  test('initializes effortLevel to medium and populates low/medium/high in effortModelMappings', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body.config.effortLevel).toBe('medium');
    expect(res.body.config.effortModelMappings).toBeDefined();
    expect(res.body.config.effortModelMappings).toHaveProperty('low');
    expect(res.body.config.effortModelMappings).toHaveProperty('medium');
    expect(res.body.config.effortModelMappings).toHaveProperty('high');
  });

  test('switches effortLevel and syncs config.modelMappings and translator resolution', async () => {
    const effortMappings = {
      low: { 'claude-sonnet': 'gemini-2.5-flash' },
      medium: { 'claude-sonnet': 'gemini-2.5-pro' },
      high: { 'claude-sonnet': 'gemini-2.5-pro-high' }
    };

    const saveRes = await request(app)
      .post('/api/admin/config')
      .send({
        effortLevel: 'medium',
        effortModelMappings: effortMappings
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.config.effortLevel).toBe('medium');
    expect(saveRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-pro' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-pro');

    // Switch to high via effortLevel only
    const highRes = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'high' });

    expect(highRes.status).toBe(200);
    expect(highRes.body.config.effortLevel).toBe('high');
    expect(highRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-pro-high' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-pro-high');

    // Switch to low via effortLevel only
    const lowRes = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'low' });

    expect(lowRes.status).toBe(200);
    expect(lowRes.body.config.effortLevel).toBe('low');
    expect(lowRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-flash' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-flash');
  });

  test('ignores invalid effortLevel and preserves current valid level', async () => {
    await updateConfig({
      effortLevel: 'high',
      effortModelMappings: {
        low: { m: 'low-m' },
        medium: { m: 'med-m' },
        high: { m: 'high-m' }
      }
    });

    const res = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'invalid-level' });

    expect(res.status).toBe(200);
    expect(res.body.config.effortLevel).toBe('high');
    expect(res.body.config.modelMappings).toEqual({ m: 'high-m' });
  });

  test('legacy update with only modelMappings updates active effort level mapping and preserves others', async () => {
    await updateConfig({
      effortLevel: 'medium',
      effortModelMappings: {
        low: { m: 'low-m' },
        medium: { m: 'med-m' },
        high: { m: 'high-m' }
      }
    });

    const res = await request(app)
      .post('/api/admin/config')
      .send({ modelMappings: { m: 'med-updated' } });

    expect(res.status).toBe(200);
    expect(res.body.config.modelMappings).toEqual({ m: 'med-updated' });
    expect(res.body.config.effortModelMappings.medium).toEqual({ m: 'med-updated' });
    expect(res.body.config.effortModelMappings.low).toEqual({ m: 'low-m' });
    expect(res.body.config.effortModelMappings.high).toEqual({ m: 'high-m' });
  });

  test('partial effortModelMappings update preserves omitted levels', async () => {
    await updateConfig({
      effortLevel: 'low',
      effortModelMappings: {
        low: { m: 'low-1' },
        medium: { m: 'med-1' },
        high: { m: 'high-1' }
      }
    });

    await updateConfig({
      effortModelMappings: {
        high: { m: 'high-2' }
      } as any
    });

    expect(config.effortModelMappings.low).toEqual({ m: 'low-1' });
    expect(config.effortModelMappings.medium).toEqual({ m: 'med-1' });
    expect(config.effortModelMappings.high).toEqual({ m: 'high-2' });
    expect(config.modelMappings).toEqual({ m: 'low-1' });
  });
});
