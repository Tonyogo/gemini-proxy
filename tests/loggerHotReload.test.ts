import logger from '../src/utils/logger';
import config, { updateConfig } from '../config/default';

describe('Logger Dynamic Hot-Reload', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Enable console spying by overriding NODE_ENV check
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    await updateConfig({ logLevel: 'info' });
  });

  test('logger responds dynamically when logLevel changes in memory', async () => {
    // 1. Set log level to 'error'
    await updateConfig({ logLevel: 'error' });

    // Debug log should be suppressed
    logger.debug('This is a debug message');
    expect(consoleSpy).not.toHaveBeenCalled();

    // 2. Change log level live to 'debug'
    await updateConfig({ logLevel: 'debug' });

    // Temporarily mock NODE_ENV away from 'test' for logger.ts isTestEnv check
    const originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    logger.debug('This debug message should appear now');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[DEBUG] This debug message should appear now'));

    process.env.NODE_ENV = originalEnv;
  });
});
