const levels: Record<string, number> = { error: 0, warn: 1, info: 2, debug: 3 };

let currentLevel = 'info';
let currentTimeZone = 'Asia/Shanghai';

export const setLogLevel = (lvl: string) => {
  currentLevel = lvl;
};

export const setLogTimeZone = (tz: string) => {
  currentTimeZone = tz;
};

const getFormattedTimestamp = (): string => {
  try {
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: currentTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString();
  }
};

const log = (level: string, message: string, ...meta: any[]) => {
  const currentLevelNum = levels[currentLevel] ?? 2;
  if (levels[level] > currentLevelNum) {
    return;
  }

  // Suppress all console logs during testing unless explicitly enabled
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return;
  }

  const timestamp = getFormattedTimestamp();
  const formattedMeta = meta.length
    ? ' ' + meta.map(m => typeof m === 'object' ? JSON.stringify(m) : m).join(' ')
    : '';
  const fullMsg = `${message}${formattedMeta}`;

  console.log(`[${timestamp}] [${level.toUpperCase()}] ${fullMsg}`);
};

const logger = {
  error: (msg: string, ...meta: any[]) => log('error', msg, ...meta),
  warn: (msg: string, ...meta: any[]) => log('warn', msg, ...meta),
  info: (msg: string, ...meta: any[]) => log('info', msg, ...meta),
  debug: (msg: string, ...meta: any[]) => log('debug', msg, ...meta),
};

export default logger;
