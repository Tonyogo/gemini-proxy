const request = require('supertest');
const app = require('../src/app');
const config = require('../config/default');

// Mock node-fetch globally
jest.mock('node-fetch', () => {
  return jest.fn().mockImplementation(() => {
    return Promise.resolve({
      status: 200,
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: { parts: [{ text: 'Mock response from Gemini!' }] }
        }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10 }
      })
    });
  });
});

describe('POST /v1/messages (Authentication / Headers)', () => {
  beforeEach(() => {
    // Reset config options before each run
    config.allowedKeys = [];
    config.geminiApiKey = 'server-test-key';
  });

  it('authenticates successfully via standard Bearer Authorization', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer client-bearer-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('authenticates successfully via standard Anthropic x-api-key header', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'client-anthropic-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('authenticates successfully via x-goog-api-key header', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('x-goog-api-key', 'client-google-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });

  it('denies access if allowedKeys list is set and incoming key is missing or wrong', async () => {
    config.allowedKeys = ['key-alpha', 'key-beta'];

    const resFail = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'key-gamma')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(resFail.statusCode).toEqual(401);
    expect(resFail.body.error.type).toEqual('authentication_error');

    const resPass = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'key-alpha')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(resPass.statusCode).toEqual(200);
  });
});
