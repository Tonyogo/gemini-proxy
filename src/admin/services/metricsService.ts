import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';

export interface TimeSeriesPoint {
  time: string;
  total: number;
  success: number;
  error: number;
  avgDurationMs: number;
  models: Record<string, number>;
}

class MetricsService {
  private totalLogs = 0;
  private successCount = 0;
  private errorCount = 0;
  private totalDurationMs = 0;
  private durationCount = 0;
  private isInitialized = false;

  private timeSeriesMap: Map<string, { total: number; success: number; error: number; totalDuration: number; durationCount: number; models: Record<string, number> }> = new Map();

  private getDebugDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  private getHourKey(dateObj: Date = new Date()): string {
    try {
      const timeZone = config.timeZone || 'Asia/Shanghai';
      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(dateObj);
      const year = parts.find(p => p.type === 'year')?.value || String(dateObj.getFullYear());
      const month = parts.find(p => p.type === 'month')?.value || String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = parts.find(p => p.type === 'day')?.value || String(dateObj.getDate()).padStart(2, '0');
      const hour = parts.find(p => p.type === 'hour')?.value || String(dateObj.getHours()).padStart(2, '0');
      return `${year}-${month}-${day} ${hour}:00`;
    } catch {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const date = String(dateObj.getDate()).padStart(2, '0');
      const hours = String(dateObj.getHours()).padStart(2, '0');
      return `${year}-${month}-${date} ${hours}:00`;
    }
  }

  private updateBucket(hourKey: string, isError: boolean, duration?: number | null, modelName?: string | null): void {
    let bucket = this.timeSeriesMap.get(hourKey);
    if (!bucket) {
      bucket = { total: 0, success: 0, error: 0, totalDuration: 0, durationCount: 0, models: {} };
      this.timeSeriesMap.set(hourKey, bucket);
    }

    bucket.total++;
    if (isError) {
      bucket.error++;
    } else {
      bucket.success++;
    }

    if (duration !== undefined && duration !== null && typeof duration === 'number') {
      bucket.totalDuration += duration;
      bucket.durationCount++;
    }

    if (modelName) {
      bucket.models[modelName] = (bucket.models[modelName] || 0) + 1;
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const debugDir = this.getDebugDir();
    const candidatePaths: string[] = [];

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const formatDate = (d: Date): string => {
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${dt}`;
    };

    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(yesterday);

    try {
      const dates = await fs.readdir(debugDir);
      for (const date of dates.sort().reverse()) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        const hours = await fs.readdir(dateDir);
        for (const hour of hours.sort().reverse()) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;

          const files = await fs.readdir(hourDir);
          const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();

          // 1. Fast metadata count (O(1) filesystem metadata lookup) - ALWAYS count ALL files
          this.totalLogs += jsonFiles.length;

          // 2. Only collect candidate paths for detail reading if date is Today or Yesterday
          if (date === todayStr || date === yesterdayStr) {
            for (const file of jsonFiles) {
              candidatePaths.push(path.join(hourDir, file));
            }
          }
        }
      }

      // 3. Concurrently read and parse bounded 24h candidate files
      const filePromises = candidatePaths.map(filePath =>
        fs.readFile(filePath, 'utf8')
          .then(content => {
            const data = JSON.parse(content);
            const isError = Boolean(data.claude_res?.error);
            if (isError) {
              this.errorCount++;
            } else {
              this.successCount++;
            }
            if (data.duration !== undefined && data.duration !== null && typeof data.duration === 'number') {
              this.totalDurationMs += data.duration;
              this.durationCount++;
            }

            // Hydrate hourly metrics trend
            let dateObj: Date | undefined;
            if (data.timestamp) {
              dateObj = new Date(data.timestamp);
            } else {
              const parts = filePath.split(path.sep);
              if (parts.length >= 2) {
                const hourStr = parts[parts.length - 2];
                if (/^\d{2}$/.test(hourStr)) {
                  dateObj = new Date();
                  dateObj.setHours(parseInt(hourStr, 10));
                }
              }
            }
            const hourKey = this.getHourKey(dateObj);
            const modelName = data.client_req?.model || data.claude_res?.model || null;
            this.updateBucket(hourKey, isError, data.duration, modelName);
          })
          .catch(() => {
            // Ignore single file parse errors
          })
      );

      await Promise.all(filePromises);
    } catch {
      // Directory may not exist yet
    }
  }

  public record(isError: boolean, duration?: number | null, timestamp?: Date, modelName?: string | null): void {
    this.totalLogs++;
    if (isError) {
      this.errorCount++;
    } else {
      this.successCount++;
    }

    if (duration !== undefined && duration !== null && typeof duration === 'number') {
      this.totalDurationMs += duration;
      this.durationCount++;
    }

    const hourKey = this.getHourKey(timestamp || new Date());
    this.updateBucket(hourKey, isError, duration, modelName);
  }

  public getStats() {
    // Generate chronological timeSeries list sorted by date-hour
    const sortedPoints = Array.from(this.timeSeriesMap.entries())
      .map(([time, bucket]) => ({
        time,
        total: bucket.total,
        success: bucket.success,
        error: bucket.error,
        avgDurationMs: bucket.durationCount > 0 ? Math.round(bucket.totalDuration / bucket.durationCount) : 0,
        models: bucket.models
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    // Keep only the most recent 24 hourly buckets to act as a rolling 24h window
    const timeSeries = sortedPoints.slice(-24);

    return {
      totalLogs: this.totalLogs,
      sampleSize: this.durationCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgDurationMs: this.durationCount > 0 ? Math.round(this.totalDurationMs / this.durationCount) : 0,
      timeSeries
    };
  }

  public resetForTesting(): void {
    this.totalLogs = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalDurationMs = 0;
    this.durationCount = 0;
    this.timeSeriesMap.clear();
    this.isInitialized = false;
  }
}

export default new MetricsService();
