import http from 'http';
import { URL } from 'url';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import config from '../../../config/default';
import logger from '../../utils/logger';
import { spawnTerminalSession } from '../services/terminalService';

export function setupTerminalWebSocket(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const reqUrl = req.url || '';
    if (!reqUrl.startsWith('/api/admin/terminal/ws')) {
      return;
    }

    // Validate Admin Key
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
    logger.info(`[TerminalWS] New interactive terminal client connected`);

    let ptySession: any = null;

    try {
      ptySession = spawnTerminalSession({ cols: 80, rows: 24 });
    } catch (err: any) {
      logger.error(`[TerminalWS] Failed to spawn PTY: ${err.message}`);
      ws.send(JSON.stringify({ type: 'status', event: 'error', message: err.message }));
      ws.close(1011, 'PTY Spawn Failed');
      return;
    }

    // Pipe PTY output to WebSocket client
    const ptyDataListener = ptySession.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ptySession.onExit((exitCode: { exitCode: number; signal?: number }) => {
      logger.info(`[TerminalWS] PTY process exited with code ${exitCode.exitCode}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'status', event: 'exit', code: exitCode.exitCode }));
        ws.close(1000, 'Process Exited');
      }
    });

    // Handle incoming client messages (input, resize, ping)
    ws.on('message', (message: RawData) => {
      try {
        const msgStr = message.toString();
        // Check if message is JSON control frame
        if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
          const control = JSON.parse(msgStr);
          if (control.type === 'resize' && typeof control.cols === 'number' && typeof control.rows === 'number') {
            const cols = Math.max(10, Math.min(500, control.cols));
            const rows = Math.max(5, Math.min(200, control.rows));
            ptySession.resize(cols, rows);
            return;
          }
          if (control.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
        }

        // Otherwise treat as standard terminal input
        ptySession.write(msgStr);
      } catch {
        // Raw input write
        ptySession.write(message.toString());
      }
    });

    // Clean up PTY on WebSocket disconnect
    ws.on('close', () => {
      logger.info(`[TerminalWS] Client disconnected. Disposing PTY process...`);
      try {
        if (ptyDataListener && typeof ptyDataListener.dispose === 'function') {
          ptyDataListener.dispose();
        }
        if (ptySession) {
          ptySession.kill();
        }
      } catch (err: any) {
        logger.warn(`[TerminalWS] Error disposing PTY: ${err.message}`);
      }
    });

    ws.on('error', (err) => {
      logger.error(`[TerminalWS] WebSocket error: ${err.message}`);
    });
  });

  return wss;
}
