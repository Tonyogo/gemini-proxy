import http from 'http';
import app from './app';
import config from '../config/default';
import logger from './utils/logger';
import metricsService from './admin/services/metricsService';
import accountUsageService from './admin/services/accountUsageService';
import { setupTerminalWebSocket } from './terminal/routes/terminalWs';

const server = http.createServer(app);
setupTerminalWebSocket(server);

Promise.all([
  metricsService.init(),
  accountUsageService.init()
]).then(() => {
  server.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
    logger.info(`Proxying upstream requests to Gemini: ${config.geminiBaseUrl}`);
  });
});
