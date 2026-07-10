const request = require('supertest');
const app = require('../src/app');
const fetch = require('node-fetch');

jest.mock('node-fetch');

describe('POST /v1/messages/count_tokens', () => {
  it('correctly translates request and counts tokens via Gemini API', async () => {
    fetch.mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ totalTokens: 42 })
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-3-5-sonnet',
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);
  });
});
