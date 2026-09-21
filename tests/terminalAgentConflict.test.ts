import { WebSocketServer } from 'ws';
import http from 'http';
import { execFile } from 'child_process';
import path from 'path';

const agentScript = path.resolve(__dirname, '../scripts/terminal-agent.js');

describe('Node.js Terminal Agent - 12-Hex ID, Auto-Naming and Conflict Rejection', () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let serverPort: number;
  let receivedQueryParams: Record<string, string> = {};

  beforeAll((done) => {
    server = http.createServer();
    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      url.searchParams.forEach((val, key) => {
        receivedQueryParams[key] = val;
      });

      wss.handleUpgrade(req, socket, head, (ws) => {
        if (url.searchParams.get('name') === 'conflict-name') {
          // Simulate rejection
          ws.send(JSON.stringify({ type: 'rejected', reason: 'Name already taken', code: 4009 }));
          ws.close(4009, 'Name already taken');
        } else {
          ws.send(JSON.stringify({ type: 'registered', hostId: url.searchParams.get('hostId'), status: 'online' }));
        }
      });
    });

    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    wss.close();
    server.close(done);
  });

  beforeEach(() => {
    receivedQueryParams = {};
  });

  it('generates 12-hex hostId and auto-derives name when not specified', (done) => {
    const child = execFile('node', [agentScript, `--server=http://localhost:${serverPort}`]);

    setTimeout(() => {
      expect(receivedQueryParams.hostId).toMatch(/^[0-9a-f]{12}$/);
      expect(receivedQueryParams.name).toMatch(/^[a-z0-9-_]+-[0-9a-f]{4}$/);
      child.kill('SIGTERM');
      done();
    }, 500);
  });

  it('exits with code 1 immediately without reconnect loops when rejected with 4009', (done) => {
    const child = execFile('node', [agentScript, `--server=http://localhost:${serverPort}`, '--name=conflict-name'], (error, stdout, stderr) => {
      expect(error?.code).toBe(1);
      expect(stderr).toContain('Registration rejected by server');
      done();
    });
  });
});
