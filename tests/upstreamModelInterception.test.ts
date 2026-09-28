import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';
import { upstreamManager } from '../src/utils/upstreamManager';

describe('Per-Upstream Model Restriction Controller Interception', () => {
  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    upstreamManager.reset();
  });

  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 1, enabled: true, allowedModels: ['gemini-2.5-flash', 'claude-3-5-sonnet'] }
      ]
    });
  });

  it('rejects /v1/messages with 403 when no upstream supports the model', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: "Model 'claude-3-opus' is not supported by any configured upstream server."
      }
    });
  });

  it('rejects /v1/messages/count_tokens with 403 when no upstream supports the model', async () => {
    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'test-key')
      .send({
        model: 'claude-3-opus',
        messages: [{ role: 'user', content: 'Hi' }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: "Model 'claude-3-opus' is not supported by any configured upstream server."
      }
    });
  });

  it('rejects /v1beta/models/{model}:generateContent with 403 when no upstream supports the model', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 403,
        message: "Model 'gemini-1.5-pro' is not supported by any configured upstream server.",
        status: 'PERMISSION_DENIED'
      }
    });
  });
});
