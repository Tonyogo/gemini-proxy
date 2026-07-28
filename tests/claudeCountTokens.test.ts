import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch');

describe('POST /v1/messages/count_tokens', () => {
  it('correctly translates request and wraps payload in generateContentRequest for Gemini countTokens API', async () => {
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
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'What is the answer to the ultimate question?' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.input_tokens).toEqual(42);

    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (fetch as unknown as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(fetchCall[1].body);

    // Verify generateContentRequest wrapping
    expect(sentBody).toHaveProperty('generateContentRequest');
    expect(sentBody.generateContentRequest).toHaveProperty('contents');
    // Verify generationConfig maxOutputTokens was cleaned
    if (sentBody.generateContentRequest.generationConfig) {
      expect(sentBody.generateContentRequest.generationConfig).not.toHaveProperty('maxOutputTokens');
    }
  });
});
