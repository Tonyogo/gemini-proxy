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

        // Directly read index.jsonl for this date
        const indexPath = path.join(dateDir, 'index.jsonl');
        const indexExists = await fs.access(indexPath).then(() => true).catch(() => false);
        if (!indexExists) continue;

        try {
          const content = await fs.readFile(indexPath, 'utf8');
          const lines = content.trim().split('\n');
          const records: any[] = [];
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              records.push(JSON.parse(line));
            } catch {
              // Ignore corrupt line
            }
          }

          // Accumulate totalLogs from index record count
          this.totalLogs += records.length;

          // Hydrate stats for Today and Yesterday
          if (date === todayStr || date === yesterdayStr) {
            for (const record of records) {
              const isError = record.status >= 400;
              if (isError) {
                this.errorCount++;
              } else {
                this.successCount++;
              }
              if (record.duration !== undefined && record.duration !== null && typeof record.duration === 'number') {
                this.totalDurationMs += record.duration;
                this.durationCount++;
              }

              const dateObj = record.timestamp ? new Date(record.timestamp) : undefined;
              const hourKey = this.getHourKey(dateObj);
              this.updateBucket(hourKey, isError, record.duration, record.model);
            }
          }
        } catch {
          // Ignore read error for corrupt index.jsonl file
        }
      }
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
