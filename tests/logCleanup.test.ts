import payloadLogger from '../src/services/payloadLogger';
import config from '../config/default';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('PayloadLogger Log Retention Cleanup', () => {
  const logsDir = path.join(process.cwd(), 'logs');
  const oldDateDir = path.join(logsDir, '2020-01-01');
  const oldHourDir = path.join(oldDateDir, '12');
  const oldFile = path.join(oldHourDir, 'transaction_old_test.json');

  beforeEach(async () => {
    await fs.mkdir(oldHourDir, { recursive: true });
    await fs.writeFile(oldFile, JSON.stringify({ old: true }), 'utf8');
  });

  afterEach(async () => {
    try {
      await fs.rm(oldDateDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('automatically deletes directories older than LOG_RETENTION_DAYS', async () => {
    config.logRetentionDays = 3;

    // Trigger cleanup
    await payloadLogger.cleanupExpiredLogs();

    const exists = await fs.access(oldDateDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });
});
