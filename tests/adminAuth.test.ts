import { Request, Response, NextFunction } from 'express';
import adminAuthMiddleware from '../src/admin/middlewares/adminAuth';
import config from '../config/default';

describe('adminAuthMiddleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  test('passes next() when ADMIN_SECRET_KEY is empty or not set', () => {
    config.adminSecretKey = '';
    adminAuthMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 when x-admin-key header is missing or incorrect', () => {
    config.adminSecretKey = 'secret123';
    req.headers = { 'x-admin-key': 'wrong' };
    adminAuthMiddleware(req as Request, res as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Invalid x-admin-key' });
    expect(next).not.toHaveBeenCalled();
  });

  test('passes next() when x-admin-key header matches ADMIN_SECRET_KEY', () => {
    config.adminSecretKey = 'secret123';
    req.headers = { 'x-admin-key': 'secret123' };
    adminAuthMiddleware(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });
});
