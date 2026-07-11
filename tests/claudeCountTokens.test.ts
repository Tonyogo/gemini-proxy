import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

jest.mock('node-fetch');

describe('POST /v1/messages/count_tokens', () => {
  it('correctly translates request and counts tokens via Gemini API', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: () => Promise.resolve({ totalTokens: 42 })
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);
  });
});
