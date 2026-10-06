import request from 'supertest';
import app from '../src/app';
import config from '../config/default';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('Terminal File Range Download Integration Tests', () => {
  const secretKey = config.adminSecretKey || 'test-admin-key';
  const testHostId = 'agent-range-test-node';
  const fullMockContent = '0123456789'.repeat(100); // 1000 bytes
  const totalFileSize = fullMockContent.length; // 1000

  let mockAgentWs: any;

  beforeAll(() => {
    config.adminSecretKey = secretKey;
    mockAgentWs = {
      readyState: 1,
      send: jest.fn((msg: string) => {
        if (msg.startsWith('JSON:')) {
          const parsed = JSON.parse(msg.slice(5));
          if (parsed.type === 'file_rpc') {
            const { reqId, action, path: targetPath, params } = parsed;

            if (action === 'stat') {
              if (targetPath.includes('notfound')) {
                terminalHostManager.handleAgentRpcResponse({
                  reqId,
                  success: false,
                  error: 'File not found',
                });
              } else {
                terminalHostManager.handleAgentRpcResponse({
                  reqId,
                  success: true,
                  data: {
                    size: totalFileSize,
                    mtime: Date.now(),
                    isDirectory: false,
                  },
                });
              }
            } else if (action === 'download_chunk') {
              if (targetPath.includes('notfound')) {
                terminalHostManager.handleAgentRpcResponse({
                  reqId,
                  success: false,
                  error: 'File not found',
                });
              } else if (params && (params.offset !== undefined || params.length !== undefined)) {
                const offset = Number(params.offset) || 0;
                const length = params.length !== undefined ? Number(params.length) : (totalFileSize - offset);
                const sliced = fullMockContent.slice(offset, offset + length);
                terminalHostManager.handleAgentRpcResponse({
                  reqId,
                  success: true,
                  data: {
                    data: Buffer.from(sliced).toString('base64'),
                    size: totalFileSize,
                    offset,
                    length: sliced.length,
                  },
                });
              } else {
                terminalHostManager.handleAgentRpcResponse({
                  reqId,
                  success: true,
                  data: Buffer.from(fullMockContent).toString('base64'),
                });
              }
            }
          }
        }
      }),
    };

    terminalHostManager.registerAgent({
      hostId: testHostId,
      name: 'Range-Test-Agent',
      agentWs: mockAgentWs,
    });
  });

  afterAll(() => {
    terminalHostManager.unregisterAgent(testHostId);
  });

  test('normal GET returns 200 OK with Accept-Ranges: bytes and full content', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/download')
      .set('x-admin-key', secretKey)
      .query({ hostId: testHostId, path: '/var/log/app.log' });

    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe(String(totalFileSize));
    expect(res.text).toBe(fullMockContent);
  });

  test('range GET bytes=0-99 returns 206 Partial Content with first 100 bytes', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/download')
      .set('x-admin-key', secretKey)
      .set('Range', 'bytes=0-99')
      .query({ hostId: testHostId, path: '/var/log/app.log' });

    expect(res.status).toBe(206);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBe(`bytes 0-99/${totalFileSize}`);
    expect(res.headers['content-length']).toBe('100');
    expect(res.text).toBe(fullMockContent.slice(0, 100));
  });

  test('open-ended range GET bytes=500- returns 206 with remaining 500 bytes', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/download')
      .set('x-admin-key', secretKey)
      .set('Range', 'bytes=500-')
      .query({ hostId: testHostId, path: '/var/log/app.log' });

    expect(res.status).toBe(206);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-range']).toBe(`bytes 500-999/${totalFileSize}`);
    expect(res.headers['content-length']).toBe('500');
    expect(res.text).toBe(fullMockContent.slice(500, 1000));
  });

  test('out-of-bound range GET returns 416 Range Not Satisfiable', async () => {
    const res = await request(app)
      .get('/api/admin/terminal/files/download')
      .set('x-admin-key', secretKey)
      .set('Range', 'bytes=2000-')
      .query({ hostId: testHostId, path: '/var/log/app.log' });

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${totalFileSize}`);
  });
});
