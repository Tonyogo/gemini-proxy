import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';
import { sanitizeData } from '../utils/requestHelper';

class PayloadLogger {
  private debugDir: string;

  constructor() {
    const logsDir = config.transactionLogsDir || 'logs';
    this.debugDir = path.isAbsolute(logsDir)
      ? logsDir
      : path.join(process.cwd(), logsDir);
  }

  /**
   * Computes the target partition subdirectory based on the current date and hour.
   */
  private _getTargetDir(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');

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
        duration: duration !== undefined ? duration : null,
        client_req: sanitizeData(clientReq) || null,
        gem_req: sanitizeData(gemReq) || null,
        gem_res: sanitizeData(gemRes) || null,
        claude_res: sanitizeData(claudeRes) || null
      };

      const filePath = path.join(targetDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: ${path.join(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`, String(new Date().getHours()).padStart(2, '0'), `transaction_${transactionId}.json`)}`);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

export default new PayloadLogger();
