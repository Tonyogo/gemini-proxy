import request from 'supertest';
import app from '../src/app';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation((url: string) => {
    const afterModels = url.split('/models')[1] || '';
    if (url.includes('/models') && !afterModels.includes(':')) {
      return Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ models: [{ name: 'models/gemini-2.0-flash' }] }),
        text: () => Promise.resolve(JSON.stringify({ models: [{ name: 'models/gemini-2.0-flash' }] }))
      });
    }
    return Promise.resolve({
      status: 200,
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Native Response' }] } }] }),
      text: () => Promise.resolve(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Native Response' }] } }] }))
    });
  });
});

describe('Native Gemini Routes Integration', () => {
  it('handles GET /v1beta/models', async () => {
    const res = await request(app)
      .get('/v1beta/models')
      .set('x-goog-api-key', 'valid-key');

    expect(res.status).toBe(200);
    expect(res.body.models[0].name).toBe('models/gemini-2.0-flash');
  });

  it('handles POST /v1beta/models/gemini-2.0-flash:generateContent', async () => {
    const res = await request(app)
      .post('/v1beta/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'valid-key')
      .send({ contents: [{ parts: [{ text: 'Hello' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Response');
  });

  it('handles POST /v1/models/gemini-2.0-flash:generateContent', async () => {
    const res = await request(app)
      .post('/v1/models/gemini-2.0-flash:generateContent')
      .set('x-goog-api-key', 'valid-key')
      .send({ contents: [{ parts: [{ text: 'Hello via v1' }] }] });

    expect(res.status).toBe(200);
    expect(res.body.candidates[0].content.parts[0].text).toBe('Native Response');
  });

  it('preserves existing Claude endpoint POST /v1/messages', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'valid-key')
      .send({
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hi Claude' }]
      });

    expect(res.status).toBe(200);
    expect(res.body.content[0].text).toBe('Native Response');
  });
});
