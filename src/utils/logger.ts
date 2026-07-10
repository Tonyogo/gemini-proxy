import config from '../../config/default';

const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const log = (level: string, message: string) => {
  if (levels[level] <= currentLevel) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
  }
};

const logger = {
  error: (msg: string) => log('error', msg),
  warn: (msg: string) => log('warn', msg),
  info: (msg: string) => log('info', msg),
  debug: (msg: string) => log('debug', msg)
};

export default logger;
