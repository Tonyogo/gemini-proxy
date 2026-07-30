import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import metricsService from './metricsService';

export interface LogItem {
  date: string;
  hour: string;
  filename: string;
  path: string;
  reqPath?: string;
  timestamp?: string;
  status?: number | null;
  isStream?: boolean;
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

  public async listLogs(
    page = 1,
    limit = 50,
    filterDate?: string,
    filterHour?: string
  ): Promise<{ tree: LogTreeStructure; logs: LogItem[]; total: number }> {
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

          // Skip adding to items list if filterDate or filterHour don't match
          if (filterDate && date !== filterDate) continue;
          if (filterHour && filterHour !== 'all' && hour !== filterHour) continue;

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
    const slicedItems = items.slice(start, start + limit);

    // Dynamic extraction of metadata (timestamp, path, status, is_stream) from log JSON files for the current page slice
    const enrichedLogs = await Promise.all(
      slicedItems.map(async item => {
        try {
          const fullPath = path.join(debugDir, item.date, item.hour, item.filename);
          const content = await fs.readFile(fullPath, 'utf8');
          const parsed = JSON.parse(content);
          return {
            ...item,
            reqPath: parsed.path || null,
            timestamp: parsed.timestamp || null,
            status: parsed.status !== undefined ? parsed.status : null,
            isStream: parsed.is_stream !== undefined ? parsed.is_stream : false
          };
        } catch (e) {
          // If reading or parsing JSON fails, fall back to file stats
          try {
            const fullPath = path.join(debugDir, item.date, item.hour, item.filename);
            const stats = await fs.stat(fullPath);
            return {
              ...item,
              timestamp: stats.mtime.toISOString(),
              reqPath: null,
              status: null,
              isStream: false
            };
          } catch {
            return {
              ...item,
              status: null,
              isStream: false
            };
          }
        }
      })
    );

    return {
      tree,
      logs: enrichedLogs,
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
