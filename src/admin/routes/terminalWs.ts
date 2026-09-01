import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import config from '../../../config/default';
import logger from '../../utils/logger';
import { getDefaultTerminalSession } from '../services/terminalService';

export function setupTerminalWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/admin/terminal/ws')) {
      return;
    }

    const secretKey = config.adminSecretKey;
    if (secretKey) {
      const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
      const providedKey =
        req.headers['x-admin-key'] ||
        parsedUrl.searchParams.get('x-admin-key') ||
        parsedUrl.searchParams.get('key');

      if (providedKey !== secretKey) {
        logger.warn(`[TerminalWS] Unauthorized WebSocket connection attempt rejected`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    logger.info(`[TerminalWS] Interactive terminal client attached to session`);
    const session = getDefaultTerminalSession();

    session.attach(ws);

    ws.on('message', (message: RawData) => {
      try {
        const msgStr = message.toString();
        if (msgStr.startsWith('JSON:')) {
          const control = JSON.parse(msgStr.slice(5));
          logger.info(`[TerminalWS] Control frame: ${JSON.stringify(control)}`);
          if (
            control.type === 'resize' &&
            typeof control.cols === 'number' &&
            !Number.isNaN(control.cols) &&
            typeof control.rows === 'number' &&
            !Number.isNaN(control.rows)
          ) {
            const cols = Math.max(10, Math.min(500, Math.floor(control.cols)));
            const rows = Math.max(5, Math.min(200, Math.floor(control.rows)));
            session.resize(cols, rows);
            return;
          }
          if (control.type === 'reset') {
            logger.info(`[TerminalWS] Reset session requested by client`);
            session.reset();
            return;
          }
          if (control.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
        }

        const hex = Buffer.from(msgStr).toString('hex');
        const preview = JSON.stringify(msgStr.length > 30 ? msgStr.slice(0, 30) + '...' : msgStr);
        logger.info(`[TerminalWS] Raw input frame (len=${msgStr.length}, hex=${hex}, preview=${preview})`);
        session.write(msgStr);
      } catch (err: any) {
        logger.warn(`[TerminalWS] Message parse exception: ${err.message}`);
        session.write(message.toString());
      }
    });

    ws.on('close', () => {
      logger.info(`[TerminalWS] Client detached. Session remains active in background.`);
      session.detach(ws);
    });

    ws.on('error', (err) => {
      logger.error(`[TerminalWS] WebSocket error: ${err.message}`);
      session.detach(ws);
    });
  });

  return wss;
}
