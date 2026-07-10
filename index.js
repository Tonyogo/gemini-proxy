const app = require('./src/app');
const config = require('./config/default');
const logger = require('./src/utils/logger');

app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
});
