import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';
import { sanitizeData } from '../utils/requestHelper';
import metricsService from '../admin/services/metricsService';

class PayloadLogger {
  private debugDir: string;

  constructor() {
    const logsDir = config.transactionLogsDir || 'logs';
    this.debugDir = path.isAbsolute(logsDir)
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

    return path.join(this.debugDir, `${year}-${month}-${day}`, hour);
  }

  public async saveTransaction(
    transactionId: string,
    clientReq: any,
    gemReq: any,
    gemRes: any,
    claudeRes: any,
    duration?: number
  ): Promise<void> {
    try {
      const targetDir = this._getTargetDir();
      await fs.mkdir(targetDir, { recursive: true });

      const payload = {
        timestamp: new Date().toISOString(),
        duration: duration !== undefined ? duration : null,
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
