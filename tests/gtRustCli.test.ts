import { execFile } from 'child_process';
import path from 'path';
import http from 'http';

const rustGtPath = path.resolve(__dirname, '../agent-rs/target/debug/gt');

function runRustGt(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(rustGtPath, args, {
      env: { ...process.env, ...env },
    }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString()
      });
    });
  });
}

describe('Rust gt Binary Integration', () => {
  let server: http.Server;
  let serverPort: number;

  beforeAll((done) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'GET' && url.pathname === '/api/terminal/hosts') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          hosts: [
            { id: 'node-rust', name: 'rust-srv', status: 'online', platform: 'linux', ip: '10.0.0.5', lastSeen: Date.now() }
          ]
        }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/terminal/exec/node-rust') {
        res.statusCode = 202;
        res.end(JSON.stringify({ success: true, taskId: 'task-rust-1' }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/terminal/exec/node-rust/task-rust-1') {
        res.statusCode = 200;
        res.end(JSON.stringify({
          success: true,
          status: 'completed',
          exitCode: 0,
          stdout: 'Rust Exec OK\n',
          stderr: '',
          outputOffset: 13,
        }));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
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
    server.close(done);
  });

  it('prints hosts from Rust binary', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'hosts']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('node-rust');
    expect(res.stdout).toContain('online');
  });

  it('streams exec output and exits with code 0 from Rust binary', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'exec', 'node-rust', 'echo 1']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Rust Exec OK\n');
    expect(res.stderr).toContain('>>> [node-rust] $ echo 1');
    expect(res.stderr).toContain('<<< [node-rust] Command completed with code 0');
  });

  it('suppresses banners with -q', async () => {
    const res = await runRustGt(['--server', `http://localhost:${serverPort}`, 'exec', '-q', 'node-rust', 'echo 1']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('Rust Exec OK\n');
    expect(res.stderr).toBe('');
  });
});
