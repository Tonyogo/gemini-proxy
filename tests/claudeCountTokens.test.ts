import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

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
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);
  });
});
