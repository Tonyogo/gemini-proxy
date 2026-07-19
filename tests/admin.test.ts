import { Request, Response } from 'express';
import { localhostOnly } from '../src/middleware/auth';

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
