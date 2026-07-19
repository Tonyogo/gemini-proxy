import { Request, Response, NextFunction } from 'express';
import config from '../../config/default';

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

export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminCredentials) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Admin credentials not configured on server.'
    });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }

  const b64auth = (authHeader.split(' ')[1] || '');
  const [user, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  const [expectedUser, expectedPassword] = config.adminCredentials.split(':');

  if (user === expectedUser && password === expectedPassword) {
    next();
  } else {
    res.set('WWW-Authenticate', 'Basic realm="Admin Area"');
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
  }
}
