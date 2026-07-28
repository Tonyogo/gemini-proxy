import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';
import { sanitizeData } from '../utils/requestHelper';
import metricsService from '../admin/services/metricsService';

class PayloadLogger {
  private getDebugDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir)
      ? logsDir
      : path.join(process.cwd(), logsDir);
  }

  /**
   * Computes the target partition subdirectory based on configured TIME_ZONE.
   */
  private _getTargetDir(): string {
    const timeZone = config.timeZone || 'Asia/Shanghai';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    });

    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    let hour = getPart('hour');
    if (hour === '24') hour = '00';

    return path.join(this.getDebugDir(), `${year}-${month}-${day}`, hour);
  }

  public async cleanupExpiredLogs(): Promise<void> {
    const retentionDays = config.logRetentionDays;
    if (!retentionDays || retentionDays <= 0) return;

    const debugDir = this.getDebugDir();
    try {
      const timeZone = config.timeZone || 'Asia/Shanghai';
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

      const parts = formatter.formatToParts(cutoffDate);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
      const cutoffStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

      const dates = await fs.readdir(debugDir);
      for (const dateFolder of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFolder)) continue;

        if (dateFolder < cutoffStr) {
          const fullPath = path.join(debugDir, dateFolder);
          await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
          logger.info(`[PayloadLogger] Pruned expired log directory: ${dateFolder} (older than ${retentionDays} days)`);
        }
      }
    } catch {
      // ignore
    }
  }

  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number,
    reqPath?: string
  ): Promise<void> {
    try {
      this.cleanupExpiredLogs().catch(() => {});

      const targetDir = this._getTargetDir();
      await fs.mkdir(targetDir, { recursive: true });

      const payload = {
        timestamp: new Date().toISOString(),
        duration: duration !== undefined ? duration : null,
        path: reqPath || null,
        client_req: sanitizeData(clientReq) || null,
        gem_req: sanitizeData(gemReq) || null,
        gem_res: sanitizeData(gemRes) || null,
        claude_res: sanitizeData(claudeRes) || null
      };

      const filePath = path.join(targetDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: ${filePath}`);

      const isError = Boolean(claudeRes && claudeRes.error);
      metricsService.record(isError, duration);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

export default new PayloadLogger();
