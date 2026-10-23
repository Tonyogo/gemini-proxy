import request from 'supertest';
import app from '../src/app';
import fetch from 'node-fetch';

jest.mock('../src/proxy/services/payloadLogger', () => ({
  saveTransaction: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('node-fetch');

describe('Upstream 524 Timeout Interception & Anthropic 529 Retry Response', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const cloudflare524Html = `<!DOCTYPE html>
<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->
<html>
<head>
<title>524: A timeout occurred</title>
</head>
<body>
<h1>Error 524</h1>
<p>The origin web server timed out responding to this request.</p>
</body>
</html>`;

  it('intercepts non-stream 524 HTML error and converts to Anthropic 529 overloaded_error with retry headers', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 524,
      ok: false,
      text: () => Promise.resolve(cloudflare524Html),
      headers: {
        get: (h: string) => null
      }
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'test message' }]
      });

    expect(res.statusCode).toBe(529);
    expect(res.headers['x-should-retry']).toBe('true');
    expect(res.headers['retry-after']).toBe('3');
    expect(res.body.type).toBe('error');
    expect(res.body.error.type).toBe('overloaded_error');
    expect(res.body.error.message).toBe('Upstream gateway timed out (524). Service is temporarily overloaded, please retry.');
  });

  it('intercepts stream 524 error after pre-fetch SSE initialization and streams error event', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 524,
      ok: false,
      text: () => Promise.resolve('A timeout occurred'),
      headers: {
        get: (h: string) => null
      }
    });

    const res = await request(app)
      .post('/v1/messages')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        stream: true,
        messages: [{ role: 'user', content: 'stream test' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain(': ping\n\n');
    expect(res.text).toContain('event: error\n');
    expect(res.text).toContain('overloaded_error');
    expect(res.text).toContain('Upstream gateway timed out (524). Service is temporarily overloaded, please retry.');
  });

  it('intercepts 524 during count_tokens and returns 529 with retry headers', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 524,
      ok: false,
      text: () => Promise.resolve(cloudflare524Html),
      headers: {
        get: (h: string) => null
      }
    });

    const res = await request(app)
      .post('/v1/messages/count_tokens')
      .set('x-api-key', 'dummy-key')
      .send({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'tokens count' }]
      });

    expect(res.statusCode).toBe(529);
    expect(res.headers['x-should-retry']).toBe('true');
    expect(res.headers['retry-after']).toBe('3');
    expect(res.body.error.type).toBe('overloaded_error');
  });

  it('intercepts 524 during list models and returns 529 with retry headers', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      status: 524,
      ok: false,
      text: () => Promise.resolve('524 origin timeout'),
      headers: {
        get: (h: string) => null
      }
    });

    const res = await request(app)
      .get('/v1/models')
      .set('x-api-key', 'dummy-key');

    expect(res.statusCode).toBe(529);
    expect(res.headers['x-should-retry']).toBe('true');
    expect(res.headers['retry-after']).toBe('3');
    expect(res.body.error.type).toBe('overloaded_error');
  });
});
