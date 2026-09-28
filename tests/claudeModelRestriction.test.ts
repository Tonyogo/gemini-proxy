import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';

describe('Claude API Model Restriction', () => {
  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      allowedModels: ['claude-3-5-sonnet', 'gemini-2.5-flash']
    });
  });

  afterAll(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('rejects /v1/messages with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: "Model 'claude-3-opus' is not permitted by proxy policy."
      }
    });
  });

  it('rejects /v1/messages/count_tokens with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-opus',
        messages: [{ role: 'user', content: 'Count tokens' }]
      });

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('error');
    expect(res.body.error.type).toBe('permission_error');
    expect(res.body.error.message).toContain('claude-3-opus');
  });

  it('rejects /v1/models/:model_id with 403 when model is not permitted', async () => {
    const res = await request(app)
      .get('/v1/models/claude-3-opus')
      .set('x-api-key', 'test-api-key');

    expect(res.status).toBe(403);
    expect(res.body.type).toBe('error');
    expect(res.body.error.type).toBe('permission_error');
  });

  it('permits requests when model matches allowed whitelist', async () => {
    // If allowed model, it passes restriction check (and proceeds to upstream fetch / mock)
    // We verify it does not return 403 permission_error
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-api-key')
      .send({
        model: 'claude-3-5-sonnet',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hello' }]
      });

    expect(res.status).not.toBe(403);
  });
});
