import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/proxy/services/payloadLogger', () => ({
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

  it('correctly handles split/fragmented SSE chunks via buffering', async () => {
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
        messages: [{ role: 'user', content: 'Test fragmented stream' }],
        stream: true
      });

    // Write a JSON payload split right in the middle across two pushes
    const part1 = 'data: {"candidates": [{"content": {"parts": [{"text": "Hello ';
    const part2 = 'World!"}]}}], "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 2}}\n\n';

    mockStream.push(part1);
    await new Promise(resolve => process.nextTick(resolve));
    mockStream.push(part2);
    mockStream.push(null);

    const res = await promise;
    expect(res.statusCode).toEqual(200);
    expect(res.text).toContain('Hello World!'); // Verify it correctly parsed and joined the content
  });

  it('immediately flushes SSE headers with initial : ping before upstream fetch resolves and sends X-Accel-Buffering: no', async () => {
    const { Readable } = require('stream');
    const mockStream = new Readable({ read() {} });

    (fetch as unknown as jest.Mock).mockImplementationOnce(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            status: 200,
            ok: true,
            body: mockStream
          });
          setTimeout(() => {
            mockStream.push('data: {"candidates":[{"content":{"parts":[{"text":"Done thinking"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n');
            mockStream.push(null);
          }, 10);
        }, 20);
      });
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Long thinking request' }],
        stream: true
      });

    expect(res.statusCode).toEqual(200);
    expect(res.headers['x-accel-buffering']).toEqual('no');
    expect(res.text).toMatch(/^: ping\n\n/);
    expect(res.text).toContain('Done thinking');
  });

  it('emits SSE error event when upstream fails with non-200 because SSE headers were already flushed before fetch', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 500,
      ok: false,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Upstream internal failure' } })),
      headers: { get: () => null }
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer dummy-key')
      .send({
        model: 'gemini-3.5-flash',
        messages: [{ role: 'user', content: 'Slow failing upstream' }],
        stream: true
      });

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain(': ping\n\n');
    expect(res.text).toContain('event: error\n');
    expect(res.text).toContain('Upstream internal failure');
  });
});
