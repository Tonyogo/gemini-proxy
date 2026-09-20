import { execFile } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import os from 'os';

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

describe('gt Rust Binary Config & Login Subsystem', () => {
  let server: http.Server;
  let serverPort: number;
  let tempHome: string;

  beforeAll((done) => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-test-home-'));

    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const key = req.headers['x-admin-key'];

      if (url.pathname === '/api/terminal/hosts') {
        if (key === 'valid-secret') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ hosts: [{ id: 'node-login', status: 'online' }] }));
          return;
        } else {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      res.statusCode = 404;
      res.end();
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
    server.close(() => {
      fs.rmSync(tempHome, { recursive: true, force: true });
      done();
    });
  });

  it('rejects login with 401 on invalid secret key and does not create config file', async () => {
    const res = await runRustGt(
      ['login', `http://localhost:${serverPort}`, 'wrong-secret'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Authentication failed');
    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(false);
  });

  it('successfully logs in and creates config file with valid credentials', async () => {
    const res = await runRustGt(
      ['login', `http://localhost:${serverPort}`, 'valid-secret'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully verified and logged in');

    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(true);
    const content = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(content.server).toBe(`http://localhost:${serverPort}`);
    expect(content.key).toBe('valid-secret');
  });

  it('runs gt hosts using persistent config without any flags', async () => {
    const res = await runRustGt(
      ['hosts'],
      { HOME: tempHome, TERMINAL_SERVER: '', ADMIN_SECRET_KEY: '' }
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('node-login');
    expect(res.stdout).toContain('online');
  });

  it('reads and updates config with gt config get / set / list', async () => {
    const listRes = await runRustGt(['config', 'list'], { HOME: tempHome });
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain(`server = "http://localhost:${serverPort}"`);

    const getRes = await runRustGt(['config', 'get', 'server'], { HOME: tempHome });
    expect(getRes.code).toBe(0);
    expect(getRes.stdout.trim()).toBe(`http://localhost:${serverPort}`);

    const setRes = await runRustGt(['config', 'set', 'server', 'http://127.0.0.1:9999'], { HOME: tempHome });
    expect(setRes.code).toBe(0);
    expect(setRes.stdout).toContain('Updated server = "http://127.0.0.1:9999"');
  });

  it('clears config on logout', async () => {
    const res = await runRustGt(['logout'], { HOME: tempHome });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Successfully logged out');
    const configFile = path.join(tempHome, '.gt', 'config.json');
    expect(fs.existsSync(configFile)).toBe(false);
  });
});
