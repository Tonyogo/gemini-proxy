import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';

export interface TimeSeriesPoint {
  time: string;
  total: number;
  success: number;
  error: number;
  avgDurationMs: number;
}

class MetricsService {
  private totalLogs = 0;
  private successCount = 0;
  private errorCount = 0;
  private totalDurationMs = 0;
  private durationCount = 0;
  private isInitialized = false;

  private timeSeriesMap: Map<string, { total: number; success: number; error: number; totalDuration: number; durationCount: number }> = new Map();

  private getDebugDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  private getHourKey(dateObj: Date = new Date()): string {
    const hours = String(dateObj.getHours()).padStart(2, '0');
    return `${hours}:00`;
  }

  private updateBucket(hourKey: string, isError: boolean, duration?: number | null): void {
    let bucket = this.timeSeriesMap.get(hourKey);
    if (!bucket) {
      bucket = { total: 0, success: 0, error: 0, totalDuration: 0, durationCount: 0 };
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
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const debugDir = this.getDebugDir();
    const candidatePaths: string[] = [];

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

          // 1. Fast metadata count (O(1) filesystem metadata lookup)
          this.totalLogs += jsonFiles.length;

          // 2. Collect candidate files until limit of 1000
          for (const file of jsonFiles) {
            if (candidatePaths.length < 1000) {
              candidatePaths.push(path.join(hourDir, file));
            }
          }
        }
      }

      // 3. Concurrently read and parse bounded candidate files
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
            this.updateBucket(hourKey, isError, data.duration);
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

  public record(isError: boolean, duration?: number | null, timestamp?: Date): void {
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
    this.updateBucket(hourKey, isError, duration);
  }

  public getStats() {
    const timeSeries: TimeSeriesPoint[] = Array.from(this.timeSeriesMap.entries())
      .map(([time, bucket]) => ({
        time,
        total: bucket.total,
        success: bucket.success,
        error: bucket.error,
        avgDurationMs: bucket.durationCount > 0 ? Math.round(bucket.totalDuration / bucket.durationCount) : 0
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

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
