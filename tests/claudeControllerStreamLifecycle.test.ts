import supertest from 'supertest';
import app from '../src/app';
import http from 'http';
import fetch from 'node-fetch';

jest.mock('node-fetch');

// Mock payloadLogger to prevent background async logs and disk I/O side effects during tests
jest.mock('../src/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

describe('ClaudeController Stream Lifecycle', () => {
  let server: http.Server;

  beforeAll((done) => {
    server = app.listen(0, () => done());
  });

  afterAll((done) => {
    server.close(done);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should reject unauthorized request without api key gracefully', async () => {
    const res = await supertest(server)
      .post('/v1/messages')
      .send({
        model: 'gemini-1.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 10,
        stream: true
      });

    expect(res.status).toBe(401);
  });

  it('should abort upstream fetch when client disconnects during stream', (done) => {
    const { Readable } = require('stream');
    const mockStream = new Readable();
    mockStream._read = () => {};

    const abortSpy = jest.fn();

    (fetch as unknown as jest.Mock).mockImplementation((url, options) => {
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          abortSpy();
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        body: mockStream
      });
    });

    const addr = server.address() as any;
    const port = addr.port;

    const clientReq = http.request({
      port,
      method: 'POST',
      path: '/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'dummy-key'
      }
    }, (res) => {
      // Once we start receiving data, abort the client request/socket
      res.on('data', () => {
        clientReq.destroy();
      });
    });

    clientReq.on('error', (err) => {
      // Ignore socket destroyed errors
    });

    clientReq.write(JSON.stringify({
      model: 'gemini-1.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true
    }));
    clientReq.end();

    // Check if upstream fetch's AbortSignal is aborted
    const checkInterval = setInterval(() => {
      if (abortSpy.mock.calls.length > 0) {
        clearInterval(checkInterval);
        expect(abortSpy).toHaveBeenCalled();
        done();
      }
    }, 10);

    // Push first chunk to trigger response 'data' event on client
    setTimeout(() => {
      mockStream.push('data: {"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}\n\n');
    }, 20);
  });
});
