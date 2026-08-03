import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import metricsService from './metricsService';

export interface LogItem {
  date: string;
  hour: string;
  filename: string;
  path: string;
  reqPath?: string | null;
  timestamp?: string | null;
  status?: number | null;
  isStream?: boolean;
  duration?: number | null;
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
      const sortedDates = dates.sort().reverse();

      // Populate tree high-level overview
      for (const date of sortedDates) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        tree[date] = tree[date] || {};
        const hours = await fs.readdir(dateDir);
        for (const hour of hours) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;

          // Estimate/read files count for tree
          const files = await fs.readdir(hourDir);
          tree[date][hour] = files.filter(f => f.endsWith('.json')).length;
        }
      }

      // Fast-path: Specific date & hour filtering
      if (filterDate && filterHour && filterHour !== 'all') {
        const hourDir = path.join(debugDir, filterDate, filterHour);
        const files = await fs.readdir(hourDir).catch(() => []);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
        for (const file of jsonFiles) {
          items.push({
            date: filterDate,
            hour: filterHour,
            filename: file,
            path: path.join(filterDate, filterHour, file)
          });
        }
      } else {
        // Collect items until target count reached
        const targetCount = page * limit;
        for (const date of sortedDates) {
          if (filterDate && date !== filterDate) continue;

          const dateDir = path.join(debugDir, date);
          const hours = (await fs.readdir(dateDir).catch(() => [])).sort().reverse();

          for (const hour of hours) {
            if (filterHour && filterHour !== 'all' && hour !== filterHour) continue;

            const hourDir = path.join(dateDir, hour);
            const files = await fs.readdir(hourDir).catch(() => []);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

            for (const file of jsonFiles) {
              items.push({
                date,
                hour,
                filename: file,
                path: path.join(date, hour, file)
              });
            }

            if (items.length >= targetCount) break;
          }
          if (items.length >= targetCount) break;
        }
      }
    } catch {
      // Directory may not exist yet
    }

    // Calculate total matching logs using the tree counts
    let total = 0;
    for (const d of Object.keys(tree)) {
      if (filterDate && d !== filterDate) continue;
      for (const h of Object.keys(tree[d])) {
        if (filterHour && filterHour !== 'all' && h !== filterHour) continue;
        total += tree[d][h];
      }
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
          let fallbackStatus: number | null = null;
          if (parsed.status !== undefined && parsed.status !== null) {
            fallbackStatus = parsed.status;
          } else if (parsed.claude_res?.error) {
            fallbackStatus = 500;
          } else if (parsed.claude_res) {
            fallbackStatus = 200;
          }

          let fallbackIsStream = false;
          if (parsed.is_stream !== undefined && parsed.is_stream !== null) {
            fallbackIsStream = Boolean(parsed.is_stream);
          } else if (parsed.client_req?.stream === true) {
            fallbackIsStream = true;
          } else if (Array.isArray(parsed.claude_res) && parsed.claude_res.length > 0 && parsed.claude_res[0]?.type) {
            fallbackIsStream = true;
          }

          return {
            ...item,
            reqPath: parsed.path || null,
            timestamp: parsed.timestamp || null,
            status: fallbackStatus,
            isStream: fallbackIsStream,
            duration: parsed.duration !== undefined ? parsed.duration : null
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
              timestamp: null,
              reqPath: null,
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
      total
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
