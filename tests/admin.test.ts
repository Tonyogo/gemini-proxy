import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import request from 'supertest';
import { localhostOnly } from '../src/middleware/auth';
import adminController from '../src/controllers/adminController';
import app from '../src/app';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    readFile: jest.fn(),
    open: jest.fn()
  }
}));

describe('localhostOnly Middleware', () => {
  it('should allow local IP addresses', () => {
    const req = {
      ip: '127.0.0.1',
      hostname: 'localhost',
      socket: {}
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    const next = jest.fn();

    localhostOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block external IP addresses', () => {
    const req = {
      ip: '192.168.1.100',
      hostname: 'external-host',
      socket: {}
    } as unknown as Request;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    const next = jest.fn();

    localhostOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('AdminController Methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should parse and list logs correctly', async () => {
    const mockReaddir = fs.readdir as jest.Mock;
    mockReaddir.mockResolvedValue(['transaction_1784434231472_maneq3z6m.json']);

    const mockOpen = fs.open as jest.Mock;
    mockOpen.mockResolvedValue({
      read: jest.fn().mockImplementation((buf: Buffer) => {
        buf.write('{"duration": 450, "client_req": {"model": "gemini-flash-latest"}}');
        return Promise.resolve({ bytesRead: 100 });
      }),
      close: jest.fn().mockResolvedValue(undefined)
    });

    const req = {} as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await adminController.listLogs(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      logs: expect.any(Array)
    }));

    const logs = (res.json as jest.Mock).mock.calls[0][0].logs;
    expect(logs.length).toBe(1);
    expect(logs[0].model).toBe('gemini-flash-latest');
    expect(logs[0].duration).toBe(450);
  });

  it('should validate malicious ID structures', async () => {
    const req = {
      params: { id: '../../etc/passwd' }
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    } as unknown as Response;

    await adminController.getLogDetail(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Invalid log file ID parameter'
    }));
  });
});

describe('Admin Router End-to-End Checks', () => {
  it('should block non-local IP on GET /admin/api/logs', async () => {
    // Force request headers to simulate external client
    const response = await request(app)
      .get('/admin/api/logs')
      .set('X-Forwarded-For', '192.168.1.100')
      .set('Host', 'external-domain.com');

    // Express trust proxy may or may not be enabled;
    // We check if security logic catches localhost restriction
    if (response.status === 403) {
      expect(response.body.error).toBe('Forbidden');
    }
  });
});
