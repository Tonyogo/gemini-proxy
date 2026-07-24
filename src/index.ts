import app from './app';
import config from '../config/default';
import logger from './utils/logger';
import metricsService from './admin/services/metricsService';

metricsService.init().then(() => {
  app.listen(config.port, () => {
    logger.info(`Server is running on port ${config.port}`);
    logger.info(`Proxying upstream requests to Gemini: ${config.geminiBaseUrl}`);
  });
});
