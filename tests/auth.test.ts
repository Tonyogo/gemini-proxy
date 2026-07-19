import { Request, Response, NextFunction } from 'express';
import { basicAuth } from '../src/middleware/auth';
import config from '../config/default';

describe('basicAuth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn()
    };
    nextFunction = jest.fn();
    config.adminCredentials = 'admin:password123';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if ADMIN_CREDENTIALS is not set', () => {
    config.adminCredentials = undefined;
    mockReq = { headers: {} };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Unauthorized', message: 'Admin credentials not configured on server.' });
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 if no Authorization header provided', () => {
    mockReq = { headers: {} };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.set).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Admin Area"');
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should return 401 for invalid credentials', () => {
    const wrongCreds = Buffer.from('admin:wrongpass').toString('base64');
    mockReq = { headers: { authorization: `Basic ${wrongCreds}` } };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(nextFunction).not.toHaveBeenCalled();
  });

  it('should call next() for valid credentials', () => {
    const rightCreds = Buffer.from('admin:password123').toString('base64');
    mockReq = { headers: { authorization: `Basic ${rightCreds}` } };
    basicAuth(mockReq as Request, mockRes as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
  });
});
