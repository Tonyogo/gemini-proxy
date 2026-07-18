import config from '../../config/default';

const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const isTestEnv = process.env.NODE_ENV === 'test';
const enableLogsInTest = process.env.ENABLE_LOGS === 'true';

const log = (level: string, message: string, ...meta: any[]) => {
  // Suppress all console logs during testing unless explicitly enabled
  if (isTestEnv && !enableLogsInTest) {
    return;
  }

  if (levels[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    const formattedMeta = meta.length
      ? ' ' + meta.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ')
      : '';
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${formattedMeta}`);
  }
};

const logger = {
  error: (msg: string, ...meta: any[]) => log('error', msg, ...meta),
  warn: (msg: string, ...meta: any[]) => log('warn', msg, ...meta),
  info: (msg: string, ...meta: any[]) => log('info', msg, ...meta),
  debug: (msg: string, ...meta: any[]) => log('debug', msg, ...meta)
};

export default logger;
