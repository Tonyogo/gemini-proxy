import http from 'http';
import WebSocket from 'ws';
import express from 'express';
import { setupTerminalWebSocket } from '../src/admin/routes/terminalWs';
import config from '../config/default';

describe('Terminal WebSocket Gateway', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = express();
    server = http.createServer(app);
    setupTerminalWebSocket(server);
    server.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should reject connection when admin secret key is set but invalid', (done) => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'test-secret-key-123';

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/admin/terminal/ws?x-admin-key=wrong-key`);

    let errorReceived = false;
    ws.on('error', (err) => {
      errorReceived = true;
      expect(err.message).toContain('401');
    });

    ws.on('close', (code) => {
      expect([1006, 1008]).toContain(code);
      config.adminSecretKey = originalKey;
      done();
    });
  });

  it('should connect and echo terminal output when admin key is valid', (done) => {
    const originalKey = config.adminSecretKey;
    config.adminSecretKey = 'valid-key';

    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/admin/terminal/ws?x-admin-key=valid-key`);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
      ws.send('echo "WS_TEST_OK"\r');
    });

    ws.on('message', (msg) => {
      const text = msg.toString();
      if (text.includes('WS_TEST_OK')) {
        ws.close();
        config.adminSecretKey = originalKey;
        done();
      }
    });
  }, 10000);
});
