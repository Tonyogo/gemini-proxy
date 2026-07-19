import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../config/default';
import logger from '../utils/logger';

class AdminController {
  private getLogsDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  public async listLogs(req: Request, res: Response): Promise<void> {
    try {
      const logsDir = this.getLogsDir();
      let files: string[] = [];
      try {
        files = await fs.readdir(logsDir);
      } catch (e) {
        // Logs directory might not exist yet if no requests made
        res.status(200).json({ success: true, logs: [] });
        return;
      }

      const logFiles = files.filter(f => f.startsWith('transaction_') && f.endsWith('.json'));
      const logsData = await Promise.all(
        logFiles.map(async (filename) => {
          const parts = filename.replace('transaction_', '').replace('.json', '').split('_');
          const timestampStr = parts[0];
          const timestamp = parseInt(timestampStr, 10);

          let model = 'unknown';
          try {
            // Read first 2KB of file to extract requested model quickly without memory overflow
            const filePath = path.join(logsDir, filename);
            const handle = await fs.open(filePath, 'r');
            const buffer = Buffer.alloc(2048);
            await handle.read(buffer, 0, 2048, 0);
            await handle.close();

            const partialText = buffer.toString('utf8');
            const match = partialText.match(/"model"\s*:\s*"([^"]+)"/);
            if (match && match[1]) {
              model = match[1];
            }
          } catch (err) {
            logger.error(`[AdminController] Error reading model from ${filename}: ${err}`);
          }

          return {
            id: filename.replace('transaction_', '').replace('.json', ''),
            filename,
            timestamp,
            time: new Date(timestamp).toISOString().replace('T', ' ').substring(0, 19),
            model
          };
        })
      );

      // Sort chronological descending
      logsData.sort((a, b) => b.timestamp - a.timestamp);

      // Cap at 50 logs
      res.status(200).json({ success: true, logs: logsData.slice(0, 50) });
    } catch (err: any) {
      logger.error(`[AdminController] listLogs failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async getLogDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_]+$/.test(id)) {
        res.status(400).json({ success: false, error: 'Invalid log file ID parameter' });
        return;
      }

      const logsDir = this.getLogsDir();
      const filePath = path.join(logsDir, `transaction_${id}.json`);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        res.status(200).json({ success: true, data });
      } catch (err) {
        res.status(404).json({ success: false, error: 'Log transaction file not found' });
      }
    } catch (err: any) {
      logger.error(`[AdminController] getLogDetail failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new AdminController();
