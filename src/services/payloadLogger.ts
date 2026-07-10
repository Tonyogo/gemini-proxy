import { promises as fs } from 'fs';
import * as path from 'path';
import logger from '../utils/logger';

class PayloadLogger {
  private debugDir: string;
  private initialized: boolean;

  constructor() {
    this.debugDir = path.join(process.cwd(), 'data', 'debug');
    this.initialized = false;
  }

  private async _ensureDirectory(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      this.initialized = true;
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to create debug directory: ${err.message}`);
    }
  }

  public async saveTransaction(transactionId: string, clientReq: any, gemReq: any, gemRes: any): Promise<void> {
    try {
      await this._ensureDirectory();

      const payload = {
        client_req: clientReq || null,
        gem_req: gemReq || null,
        gem_res: gemRes || null
      };

      const filePath = path.join(this.debugDir, `transaction_${transactionId}.json`);
      await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.debug(`[PayloadLogger] Saved transaction log: transaction_${transactionId}.json`);
    } catch (err: any) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

export default new PayloadLogger();
