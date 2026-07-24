import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import metricsService from './metricsService';

export interface LogItem {
  date: string;
  hour: string;
  filename: string;
  path: string;
}

export interface LogTreeStructure {
  [date: string]: {
    [hour: string]: number;
  };
}

class LogService {
  private getDebugDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  public async listLogs(page = 1, limit = 50): Promise<{ tree: LogTreeStructure; logs: LogItem[]; total: number }> {
    const debugDir = this.getDebugDir();
    const items: LogItem[] = [];
    const tree: LogTreeStructure = {};

    try {
      const dates = await fs.readdir(debugDir);
      for (const date of dates.sort().reverse()) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        tree[date] = tree[date] || {};
        const hours = await fs.readdir(dateDir);
        for (const hour of hours.sort().reverse()) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;

          const files = await fs.readdir(hourDir);
          const jsonFiles = files.filter(f => f.endsWith('.json'));
          tree[date][hour] = jsonFiles.length;

          for (const file of jsonFiles.sort().reverse()) {
            items.push({
              date,
              hour,
              filename: file,
              path: path.join(date, hour, file)
            });
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }

    const start = (page - 1) * limit;
    return {
      tree,
      logs: items.slice(start, start + limit),
      total: items.length
    };
  }

  public async getLogDetail(date: string, hour: string, filename: string): Promise<any> {
    const targetPath = path.join(this.getDebugDir(), date, hour, filename);
    const data = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(data);
  }

  public async getStats(): Promise<any> {
    return metricsService.getStats();
  }
}

export default new LogService();
