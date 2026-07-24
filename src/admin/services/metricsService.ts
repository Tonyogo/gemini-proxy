import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';

class MetricsService {
  private totalLogs = 0;
  private successCount = 0;
  private errorCount = 0;
  private totalDurationMs = 0;
  private durationCount = 0;
  private isInitialized = false;

  private getDebugDir(): string {
    const logsDir = config.transactionLogsDir || 'logs';
    return path.isAbsolute(logsDir) ? logsDir : path.join(process.cwd(), logsDir);
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const debugDir = this.getDebugDir();
    try {
      const dates = await fs.readdir(debugDir);
      for (const date of dates) {
        const dateDir = path.join(debugDir, date);
        const dateStat = await fs.stat(dateDir).catch(() => null);
        if (!dateStat || !dateStat.isDirectory()) continue;

        const hours = await fs.readdir(dateDir);
        for (const hour of hours) {
          const hourDir = path.join(dateDir, hour);
          const hourStat = await fs.stat(hourDir).catch(() => null);
          if (!hourStat || !hourStat.isDirectory()) continue;

          const files = await fs.readdir(hourDir);
          for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
              const content = await fs.readFile(path.join(hourDir, file), 'utf8');
              const data = JSON.parse(content);
              const isError = Boolean(data.claude_res?.error);
              this.record(isError, data.duration);
            } catch {
              // Ignore single file parse errors during startup scan
            }
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  public record(isError: boolean, duration?: number | null): void {
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
  }

  public getStats() {
    return {
      totalLogs: this.totalLogs,
      sampleSize: this.totalLogs,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgDurationMs: this.durationCount > 0 ? Math.round(this.totalDurationMs / this.durationCount) : 0
    };
  }

  public resetForTesting(): void {
    this.totalLogs = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalDurationMs = 0;
    this.durationCount = 0;
    this.isInitialized = false;
  }
}

export default new MetricsService();
