const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class PayloadLogger {
  constructor() {
    this.debugDir = path.join(process.cwd(), 'data', 'debug');
    this.initialized = false;
  }

  async _ensureDirectory() {
    if (this.initialized) return;
    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      this.initialized = true;
    } catch (err) {
      logger.error(`[PayloadLogger] Failed to create debug directory: ${err.message}`);
    }
  }

  async saveTransaction(transactionId, clientReq, gemReq, gemRes) {
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
    } catch (err) {
      logger.error(`[PayloadLogger] Failed to write transaction file: ${err.message}`);
    }
  }
}

module.exports = new PayloadLogger();
