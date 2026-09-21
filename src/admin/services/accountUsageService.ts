import { promises as fs } from 'fs';
import * as path from 'path';
import config from '../../../config/default';
import logger from '../../utils/logger';
import { AccountUsageStats, ModelUsageStats, PeriodUsageStore } from '../../types';

class AccountUsageService {
  private currentStore: PeriodUsageStore | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private dataDir = path.join(process.cwd(), 'data', 'account-usage');
  private historyDir = path.join(process.cwd(), 'data', 'account-usage', 'history');
  private currentFilePath = path.join(process.cwd(), 'data', 'account-usage', 'current-period.json');

  constructor() {
    this.registerExitHooks();
  }

  private registerExitHooks(): void {
    const handleExit = () => {
      this.flushSync();
    };
    process.once('beforeExit', handleExit);
    process.once('SIGINT', () => {
      handleExit();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      handleExit();
      process.exit(0);
    });
  }

  public getPeriodKey(dateObj: Date = new Date()): string {
    const timeZone = config.timeZone || 'Asia/Shanghai';
    let year: number;
    let month: number;
    let day: number;
    let hour: number;

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(dateObj);
      const getVal = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
      year = getVal('year');
      month = getVal('month');
      day = getVal('day');
      hour = getVal('hour');
    } catch {
      year = dateObj.getFullYear();
      month = dateObj.getMonth() + 1;
      day = dateObj.getDate();
      hour = dateObj.getHours();
    }

    // 15:00 cutoff logic
    const refDate = new Date(Date.UTC(year, month - 1, day));
    if (hour < 15) {
      refDate.setUTCDate(refDate.getUTCDate() - 1);
    }
    const yStr = refDate.getUTCFullYear();
    const mStr = String(refDate.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(refDate.getUTCDate()).padStart(2, '0');

    return `${yStr}-${mStr}-${dStr}_15`;
  }

  private calculatePeriodBoundaries(periodKey: string): { periodStart: string; periodEnd: string } {
    const [datePart] = periodKey.split('_');
    const [y, m, d] = datePart.split('-').map(v => parseInt(v, 10));
    const startDate = new Date(Date.UTC(y, m - 1, d, 7, 0, 0)); // 15:00 UTC+8 is 07:00 UTC
    const endDate = new Date(startDate.getTime() + 24 * 3600 * 1000);

    return {
      periodStart: `${datePart} 15:00:00 (UTC+8)`,
      periodEnd: `${endDate.toISOString().slice(0, 10)} 15:00:00 (UTC+8)`
    };
  }

  private ensureCurrentStore(): PeriodUsageStore {
    const activePeriodKey = this.getPeriodKey();
    if (!this.currentStore || this.currentStore.periodKey !== activePeriodKey) {
      if (this.currentStore && this.currentStore.periodKey !== activePeriodKey) {
        // Archive previous period
        this.archiveCurrentPeriod().catch(() => {});
      }
      const boundaries = this.calculatePeriodBoundaries(activePeriodKey);
      this.currentStore = {
        periodKey: activePeriodKey,
        periodStart: boundaries.periodStart,
        periodEnd: boundaries.periodEnd,
        updatedAt: new Date().toISOString(),
        accounts: {}
      };
    }
    return this.currentStore;
  }

  private async archiveCurrentPeriod(): Promise<void> {
    if (!this.currentStore) return;
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
      const archivePath = path.join(this.historyDir, `period-${this.currentStore.periodKey}.json`);
      await fs.writeFile(archivePath, JSON.stringify(this.currentStore, null, 2), 'utf8');
      logger.info(`[AccountUsage] Archived past period usage to ${archivePath}`);
    } catch (err: any) {
      logger.error(`[AccountUsage] Failed to archive period: ${err.message}`);
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.historyDir, { recursive: true });

      const fileExists = await fs.access(this.currentFilePath).then(() => true).catch(() => false);
      if (fileExists) {
        const raw = await fs.readFile(this.currentFilePath, 'utf8');
        const parsed: PeriodUsageStore = JSON.parse(raw);
        const activePeriodKey = this.getPeriodKey();

        if (parsed.periodKey === activePeriodKey) {
          this.currentStore = parsed;
          logger.info(`[AccountUsage] Restored current period usage: ${parsed.periodKey} (${Object.keys(parsed.accounts).length} accounts)`);
        } else {
          // It's from a past period -> archive it and start fresh
          await fs.mkdir(this.historyDir, { recursive: true });
          const archivePath = path.join(this.historyDir, `period-${parsed.periodKey}.json`);
          await fs.writeFile(archivePath, raw, 'utf8').catch(() => {});
          this.ensureCurrentStore();
          await this.flush();
        }
      } else {
        this.ensureCurrentStore();
      }
    } catch (err: any) {
      logger.warn(`[AccountUsage] Failed to init or restore account usage store: ${err.message}`);
      this.ensureCurrentStore();
    }
  }

  public record(accountName: string | null | undefined, model: string | null | undefined, isSuccess: boolean): void {
    if (!accountName || typeof accountName !== 'string' || !accountName.trim()) {
      return;
    }

    const normAccount = accountName.trim();
    const normModel = (model && model.trim()) ? model.trim() : 'unknown';

    const store = this.ensureCurrentStore();
    let accountStats = store.accounts[normAccount];
    if (!accountStats) {
      accountStats = {
        accountName: normAccount,
        totalSuccess: 0,
        totalError: 0,
        totalRequests: 0,
        byModel: {}
      };
      store.accounts[normAccount] = accountStats;
    }

    accountStats.totalRequests++;
    if (isSuccess) {
      accountStats.totalSuccess++;
    } else {
      accountStats.totalError++;
    }

    let modelStats = accountStats.byModel[normModel];
    if (!modelStats) {
      modelStats = { success: 0, error: 0, total: 0 };
      accountStats.byModel[normModel] = modelStats;
    }

    modelStats.total++;
    if (isSuccess) {
      modelStats.success++;
    } else {
      modelStats.error++;
    }

    store.updatedAt = new Date().toISOString();
    this.scheduleFlush();
  }

  public getUsageForAccount(accountName: string): AccountUsageStats | null {
    if (!accountName) return null;
    const store = this.ensureCurrentStore();
    return store.accounts[accountName.trim()] || null;
  }

  public getAllUsage(): PeriodUsageStore {
    return this.ensureCurrentStore();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush().catch(() => {});
    }, 1000);
    if (this.flushTimer && typeof this.flushTimer.unref === 'function') {
      this.flushTimer.unref();
    }
  }

  public async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.currentStore) return;

    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const tempPath = `${this.currentFilePath}.${Date.now()}.tmp`;
      const data = JSON.stringify(this.currentStore, null, 2);
      await fs.writeFile(tempPath, data, 'utf8');
      await fs.rename(tempPath, this.currentFilePath);
    } catch (err: any) {
      logger.error(`[AccountUsage] Failed to flush current usage to disk: ${err.message}`);
    }
  }

  private flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.currentStore) return;
    try {
      const fsSync = require('fs');
      if (!fsSync.existsSync(this.dataDir)) {
        fsSync.mkdirSync(this.dataDir, { recursive: true });
      }
      const data = JSON.stringify(this.currentStore, null, 2);
      fsSync.writeFileSync(this.currentFilePath, data, 'utf8');
    } catch {
      // ignore
    }
  }

  public resetForTest(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.currentStore = null;
    this.isInitialized = false;
  }
}

export default new AccountUsageService();
