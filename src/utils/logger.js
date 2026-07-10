const config = require('../../config/default');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[config.logLevel] !== undefined ? levels[config.logLevel] : 2;

const log = (level, message) => {
  if (levels[level] <= currentLevel) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
  }
};

module.exports = {
  error: (msg) => log('error', msg),
  warn: (msg) => log('warn', msg),
  info: (msg) => log('info', msg),
  debug: (msg) => log('debug', msg)
};
