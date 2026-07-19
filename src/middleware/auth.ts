import { Request, Response, NextFunction } from 'express';

export function localhostOnly(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || '';
  const isLocal =
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    req.hostname === 'localhost' ||
    req.hostname === '127.0.0.1';

  if (!isLocal) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Access is restricted to localhost / 127.0.0.1 for security reasons.'
    });
    return;
  }
  next();
}
