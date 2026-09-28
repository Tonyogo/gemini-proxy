import request from 'supertest';
import app from '../src/app';
import config, { updateConfig } from '../config/default';

describe('Gemini Native API Model Restriction', () => {
  beforeEach(async () => {
    config.adminSecretKey = 'test-key';
    await updateConfig({
      allowedModels: ['gemini-2.5-flash']
    });
  });

  afterAll(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('rejects /v1beta/models/{model}:generateContent with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-1.5-pro:generateContent')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: {
        code: 403,
        message: "Model 'gemini-1.5-pro' is not permitted by proxy policy.",
        status: 'PERMISSION_DENIED'
      }
    });
  });

  it('rejects /v1/models/{model}:streamGenerateContent with 403 when model is not permitted', async () => {
    const res = await request(app)
      .post('/v1/models/gemini-2.5-pro:streamGenerateContent?alt=sse')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Stream' }] }]
      });

    expect(res.status).toBe(403);
    expect(res.body.error.status).toBe('PERMISSION_DENIED');
  });

  it('permits requests when model is in allowedModels whitelist', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.5-flash:generateContent')
      .set('x-goog-api-key', 'test-api-key')
      .send({
        contents: [{ parts: [{ text: 'Hello' }] }]
      });

    expect(res.status).not.toBe(403);
  });
});
