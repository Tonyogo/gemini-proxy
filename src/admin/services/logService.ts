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
  ): Promise<{ tree: LogTreeStructure; hourCount: number; total: number; logs: LogItem[] }> {
    const debugDir = this.getDebugDir();
    const items: LogItem[] = [];
    const tree: LogTreeStructure = {};

    let hourCount = 0;

    try {
      const dates = await fs.readdir(debugDir);
      const sortedDates = dates.sort().reverse();

      // Lightweight tree overview: list date and hour directories without deep file counting
      for (const date of sortedDates) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        tree[date] = tree[date] || {};
        const hours = await fs.readdir(dateDir).catch(() => []);
        for (const hour of hours) {
          tree[date][hour] = 0; // Default placeholder, no deep file readdir
        }
      }

      // Determine active date and hour
      let targetDate = filterDate;
      let targetHour = filterHour;

      if (!targetDate || !targetHour || targetHour === 'all') {
        if (sortedDates.length > 0) {
          targetDate = targetDate || sortedDates[0];
          const availableHours = Object.keys(tree[targetDate] || {}).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
          if (availableHours.length > 0) {
            targetHour = (targetHour && targetHour !== 'all') ? targetHour : availableHours[0];
          }
        }
      }

      // Perform targeted file scan for active date/hour ONLY
      if (targetDate && targetHour && targetHour !== 'all') {
        const hourDir = path.join(debugDir, targetDate, targetHour);
        const files = await fs.readdir(hourDir).catch(() => []);
        const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

        hourCount = jsonFiles.length;
        if (tree[targetDate] && tree[targetDate][targetHour] !== undefined) {
          tree[targetDate][targetHour] = hourCount;
        }

        for (const file of jsonFiles) {
          items.push({
            date: targetDate,
            hour: targetHour,
            filename: file,
            path: path.join(targetDate, targetHour, file)
          });
        }
      }
    } catch {
      // Directory may not exist yet
    }

    const start = (page - 1) * limit;
    const slicedItems = items.slice(start, start + limit);

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
          try {
            const fullPath = path.join(debugDir, item.date, item.hour, item.filename);
            const stats = await fs.stat(fullPath);
            return {
              ...item,
              timestamp: stats.mtime.toISOString(),
              reqPath: null,
              status: null,
              isStream: false,
              duration: null
            };
          } catch {
            return {
              ...item,
              timestamp: null,
              reqPath: null,
              status: null,
              isStream: false,
              duration: null
            };
          }
        }
      })
    );

    return {
      tree,
      hourCount,
      total: hourCount,
      logs: enrichedLogs
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
