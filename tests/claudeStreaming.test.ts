import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch');

describe('POST /v1/messages (Streaming)', () => {
  it('correctly returns translated Server-Sent Events', async () => {
    // Mock SSE response stream
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    (fetch as unknown as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      body: mockStream
    });

    const promise = request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Tell me a story' }],
        stream: true
      });

    // Write mock SSE chunks to the stream
    const chunk1 = {
      candidates: [{
        content: { parts: [{ text: 'Once ' }] }
      }]
    };
    const chunk2 = {
      candidates: [{
        content: { parts: [{ text: 'upon a time' }] }
      }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
    };
    const chunk2Copy = JSON.parse(JSON.stringify(chunk2));
    chunk2Copy.candidates[0].finishReason = 'STOP';

    mockStream.push(`data: ${JSON.stringify(chunk1)}\n\n`);
    mockStream.push(`data: ${JSON.stringify(chunk2Copy)}\n\n`);
    mockStream.push(null); // End stream

    const res = await promise;
    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('message_start');
    expect(res.text).toContain('content_block_delta');
    expect(res.text).toContain('Once ');
    expect(res.text).toContain('upon a time');
    expect(res.text).toContain('message_stop');
  });
});
