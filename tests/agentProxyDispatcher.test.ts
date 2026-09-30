import http from 'http';
const { AgentProxyDispatcher } = require('../scripts/gt.js');

describe('AgentProxyDispatcher in gt.js', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      if (req.url === '/echo') {
        res.setHeader('content-type', 'text/plain');
        res.setHeader('x-custom-res', 'test-val');
        res.writeHead(200);
        res.write('Hello ');
        setTimeout(() => {
          res.end('World!');
        }, 10);
        return;
      }
      if (req.url === '/error') {
        res.destroy();
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });
    server.listen(0, '127.0.0.1', () => {
      serverPort = (server.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('dispatches request and emits http_res_start, chunk, end frames', (done) => {
    const sentFrames: any[] = [];
    const dispatcher = new AgentProxyDispatcher((msg: any) => {
      sentFrames.push(msg);
      if (msg.type === 'http_res_end') {
        expect(sentFrames.find(f => f.type === 'http_res_start')).toBeDefined();
        const startFrame = sentFrames.find(f => f.type === 'http_res_start');
        expect(startFrame.status).toBe(200);
        expect(startFrame.headers['x-custom-res']).toBe('test-val');

        const chunks = sentFrames.filter(f => f.type === 'http_res_chunk');
        const text = chunks.map(c => Buffer.from(c.chunk, 'base64').toString('utf-8')).join('');
        expect(text).toBe('Hello World!');
        dispatcher.cleanup();
        done();
      }
    });

    dispatcher.handleRequest({
      requestId: 'test_req_1',
      method: 'GET',
      url: `http://127.0.0.1:${serverPort}/echo`,
      headers: { 'Accept': 'text/plain' },
      timeoutMs: 5000
    });
  });

  it('handles remote network error and emits http_res_error', (done) => {
    const dispatcher = new AgentProxyDispatcher((msg: any) => {
      if (msg.type === 'http_res_error') {
        expect(msg.requestId).toBe('test_err_req');
        expect(msg.error).toBeDefined();
        dispatcher.cleanup();
        done();
      }
    });

    dispatcher.handleRequest({
      requestId: 'test_err_req',
      method: 'GET',
      url: `http://127.0.0.1:1/unreachable`, // Port 1 is closed
      headers: {},
      timeoutMs: 2000
    });
  });
});
