import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import metricsService from './metricsService';
import { LogIndexRecord } from '../../services/payloadLogger';
import claudeTranslator from '../../services/claudeTranslator';

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
  model?: string | null;
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
  ): Promise<{ tree: LogTreeStructure; hourCount: number; total: number; page: number; limit: number; logs: LogItem[] }> {
    const debugDir = this.getDebugDir();
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
          if (/^\d{2}$/.test(hour)) {
            tree[date][hour] = 0; // Default placeholder, no deep file readdir
          }
        }
      }

      // Determine active date and hour
      let targetDate = filterDate;
      let targetHour = filterHour;

      if (!targetDate || !targetHour || targetHour === 'all') {
        if (sortedDates.length > 0) {
          targetDate = targetDate || sortedDates[0];
          const availableHours = Object.keys(tree[targetDate] || {})
            .filter(h => /^\d{2}$/.test(h))
            .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
          if (availableHours.length > 0) {
            targetHour = (targetHour && targetHour !== 'all') ? targetHour : availableHours[0];
          }
        }
      }

      if (targetDate) {
        let targetRecords: LogIndexRecord[] = [];
        const indexPath = path.join(debugDir, targetDate, 'index.jsonl');
        const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);

        if (indexExists) {
          try {
            const content = await fs.readFile(indexPath, 'utf8');
            const lines = content.trim().split('\n');
            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                targetRecords.push(JSON.parse(line));
              } catch {
                // Ignore single corrupt line
              }
            }
          } catch {
            // Fallback if read fails
          }
        }

        if (targetRecords.length === 0) {
          // Execute self-healing fallback
          const dateDir = path.join(debugDir, targetDate);
          const hours = await fs.readdir(dateDir).catch(() => []);
          const sortedHours = hours.filter(h => /^\d{2}$/.test(h)).sort();

          for (const hour of sortedHours) {
            const hourDir = path.join(dateDir, hour);
            const files = await fs.readdir(hourDir).catch(() => []);
            const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

            for (const file of jsonFiles) {
              try {
                const fullPath = path.join(hourDir, file);
                const content = await fs.readFile(fullPath, 'utf8');
                const parsed = JSON.parse(content);

                let fallbackStatus = 200;
                if (parsed.status !== undefined && parsed.status !== null) {
                  fallbackStatus = parsed.status;
                } else if (parsed.claude_res?.error) {
                  fallbackStatus = 500;
                }

                let fallbackIsStream = false;
                if (parsed.is_stream !== undefined && parsed.is_stream !== null) {
                  fallbackIsStream = Boolean(parsed.is_stream);
                } else if (parsed.client_req?.stream === true) {
                  fallbackIsStream = true;
                } else if (Array.isArray(parsed.claude_res) && parsed.claude_res.length > 0 && parsed.claude_res[0]?.type) {
                  fallbackIsStream = true;
                }

                const rawModel = parsed.claude_res?.model || parsed.client_req?.model || null;
                const modelName = rawModel ? claudeTranslator.getCleanModelName(rawModel) : null;
                const transactionId = file.replace(/^transaction_/, '').replace(/\.json$/, '');

                targetRecords.push({
                  id: transactionId,
                  timestamp: parsed.timestamp || new Date().toISOString(),
                  date: targetDate,
                  hour,
                  filename: file,
                  path: path.join(targetDate, hour, file),
                  status: fallbackStatus,
                  duration: parsed.duration !== undefined ? parsed.duration : null,
                  reqPath: parsed.path || null,
                  model: modelName,
                  isStream: fallbackIsStream
                });
              } catch {
                // Ignore single file error
              }
            }
          }

          // Write targetRecords to index.jsonl if not empty
          if (targetRecords.length > 0) {
            const indexPath = path.join(dateDir, 'index.jsonl');
            const fileContent = targetRecords.map(rec => JSON.stringify(rec)).join('\n') + '\n';
            await fs.mkdir(dateDir, { recursive: true }).catch(() => {});
            await fs.writeFile(indexPath, fileContent, 'utf8').catch(() => {});
          }
        }

        // Synchronize actual counts into tree[targetDate]
        if (tree[targetDate]) {
          for (const hr of Object.keys(tree[targetDate])) {
            tree[targetDate][hr] = 0;
          }
          for (const rec of targetRecords) {
            if (tree[targetDate][rec.hour] !== undefined) {
              tree[targetDate][rec.hour]++;
            }
          }
        }

        // Filter and reverse for response (newest first)
        let filteredRecords = targetRecords;
        if (targetHour && targetHour !== 'all') {
          filteredRecords = targetRecords.filter(rec => rec.hour === targetHour);
        }
        filteredRecords = [...filteredRecords].reverse();

        hourCount = filteredRecords.length;

        const start = (page - 1) * limit;
        const slicedRecords = filteredRecords.slice(start, start + limit);

        const enrichedLogs = slicedRecords.map(rec => ({
          date: rec.date,
          hour: rec.hour,
          filename: rec.filename,
          path: rec.path,
          reqPath: rec.reqPath,
          timestamp: rec.timestamp,
          status: rec.status,
          isStream: rec.isStream,
          duration: rec.duration,
          model: rec.model
        }));

        return {
          tree,
          hourCount,
          total: hourCount,
          page,
          limit,
          logs: enrichedLogs
        };
      }
    } catch {
      // Directory may not exist yet
    }

    return {
      tree,
      hourCount: 0,
      total: 0,
      page,
      limit,
      logs: []
    };
  }

  public async getLogDetail(date: string, hour: string, filename: string): Promise<any> {
    const targetPath = path.join(this.getDebugDir(), date, hour, filename);
    const data = await fs.readFile(targetPath, 'utf8');
    return JSON.parse(data);
  }

  public async getStats(rangeHours?: number | 'today'): Promise<any> {
    return metricsService.getStats(rangeHours);
  }
}

export default new LogService();
