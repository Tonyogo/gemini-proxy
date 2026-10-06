import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-ignore
import { downloadRemoteFile } from '../scripts/gt.js';

describe('gt cp CLI Resumable Range Download Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  let port: number;

  const testData = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'; // 62 bytes
  let requestedRanges: (string | undefined)[] = [];

  const tempDir = path.join(os.tmpdir(), `gt-cp-test-${Date.now()}`);

  beforeAll((done) => {
    fs.mkdirSync(tempDir, { recursive: true });

    server = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${port}`);
      if (url.pathname === '/api/terminal/files/download') {
        const range = req.headers['range'];
        requestedRanges.push(range);

        if (!range) {
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': testData.length,
            'Accept-Ranges': 'bytes',
          });
          res.end(testData);
          return;
        }

        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (match) {
          const start = parseInt(match[1], 10);
          if (start >= testData.length) {
            res.writeHead(416, {
              'Content-Range': `bytes */${testData.length}`,
              'Accept-Ranges': 'bytes',
            });
            res.end();
            return;
          }

          const end = match[2] ? parseInt(match[2], 10) : testData.length - 1;
          const chunk = testData.slice(start, end + 1);
          res.writeHead(206, {
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${start}-${end}/${testData.length}`,
            'Content-Length': chunk.length,
            'Accept-Ranges': 'bytes',
          });
          res.end(chunk);
          return;
        }

        res.writeHead(400);
        res.end('Bad Range');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      port = addr.port;
      serverUrl = `http://127.0.0.1:${port}`;
      done();
    });
  });

  afterAll((done) => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    server.close(done);
  });

  beforeEach(() => {
    requestedRanges = [];
  });

  test('downloads whole file cleanly when no partial file exists', async () => {
    const destFile = path.join(tempDir, 'file1.txt');
    await downloadRemoteFile({
      serverUrl,
      apiKey: 'test-key',
      hostId: 'test-node',
      remotePath: '/remote/file1.txt',
      localPath: destFile,
    });

    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, 'utf-8')).toBe(testData);
    expect(fs.existsSync(`${destFile}.part`)).toBe(false);
  });

  test('resumes download when a .part file already exists with partial content', async () => {
    const destFile = path.join(tempDir, 'file2.txt');
    const partFile = `${destFile}.part`;

    // Simulate an interrupted download with first 20 bytes
    fs.writeFileSync(partFile, testData.slice(0, 20), 'utf-8');

    await downloadRemoteFile({
      serverUrl,
      apiKey: 'test-key',
      hostId: 'test-node',
      remotePath: '/remote/file2.txt',
      localPath: destFile,
    });

    expect(requestedRanges).toContain('bytes=20-');
    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, 'utf-8')).toBe(testData);
    expect(fs.existsSync(partFile)).toBe(false);
  });

  test('handles 416 by resetting and redownloading whole file', async () => {
    const destFile = path.join(tempDir, 'file3.txt');
    const partFile = `${destFile}.part`;

    // Simulate a corrupted .part file with size >= remote size
    fs.writeFileSync(partFile, 'x'.repeat(100), 'utf-8');

    await downloadRemoteFile({
      serverUrl,
      apiKey: 'test-key',
      hostId: 'test-node',
      remotePath: '/remote/file3.txt',
      localPath: destFile,
    });

    expect(fs.existsSync(destFile)).toBe(true);
    expect(fs.readFileSync(destFile, 'utf-8')).toBe(testData);
    expect(fs.existsSync(partFile)).toBe(false);
  });
});
