const request = require('supertest');
const app = require('../src/app');

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

describe('POST /v1/messages (Non-Streaming)', () => {
  it('successfully translates and proxies request to Gemini API', async () => {
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the capital of France?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.model).toEqual('gemini-2.5-pro');
    expect(res.body.content[0].text).toEqual('Mock response from Gemini!');
  });
});
