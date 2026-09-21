import accountUsageService from '../src/admin/services/accountUsageService';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('AccountUsageService', () => {
  const currentFilePath = path.join(process.cwd(), 'data', 'account-usage.json');

  beforeEach(async () => {
    accountUsageService.resetForTest();
    await fs.rm(path.join(process.cwd(), 'data', 'account-usage'), { recursive: true, force: true }).catch(() => {});
  });

  afterAll(async () => {
    accountUsageService.resetForTest();
    await fs.unlink(currentFilePath).catch(() => {});
    await fs.rm(path.join(process.cwd(), 'data', 'account-usage'), { recursive: true, force: true }).catch(() => {});
  });

  describe('Period calculation (15:00 to next day 15:00 Asia/Shanghai)', () => {
    it('should compute correct periodKey before 15:00', () => {
      // 2026-09-21 14:59:59 (UTC: 2026-09-21 06:59:59Z)
      const date = new Date('2026-09-21T06:59:59.000Z');
      const key = accountUsageService.getPeriodKey(date);
      expect(key).toBe('2026-09-20_15');
    });

    it('should compute correct periodKey at and after 15:00', () => {
      // 2026-09-21 15:00:00 (UTC: 2026-09-21 07:00:00Z)
      const date = new Date('2026-09-21T07:00:00.000Z');
      const key = accountUsageService.getPeriodKey(date);
      expect(key).toBe('2026-09-21_15');
    });
  });

  describe('Record and aggregation', () => {
    it('should aggregate success and error requests per account and model', () => {
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', true);
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', true);
      accountUsageService.record('user-a@example.com', 'claude-3-5-sonnet', false);
      accountUsageService.record('user-a@example.com', 'gemini-1.5-pro', true);

      const usage = accountUsageService.getUsageForAccount('user-a@example.com');
      expect(usage).not.toBeNull();
      expect(usage!.totalSuccess).toBe(3);
      expect(usage!.totalError).toBe(1);
      expect(usage!.totalRequests).toBe(4);

      expect(usage!.byModel['claude-3-5-sonnet']).toEqual({
        success: 2,
        error: 1,
        total: 3
      });
      expect(usage!.byModel['gemini-1.5-pro']).toEqual({
        success: 1,
        error: 0,
        total: 1
      });
    });

    it('should normalize model name by removing models/ prefix and merge counts', () => {
      accountUsageService.record('user-norm@example.com', 'models/gemini-2.0-flash', true);
      accountUsageService.record('user-norm@example.com', 'gemini-2.0-flash', true);

      const usage = accountUsageService.getUsageForAccount('user-norm@example.com');
      expect(usage).not.toBeNull();
      expect(usage!.totalSuccess).toBe(2);
      expect(usage!.byModel['gemini-2.0-flash']).toEqual({
        success: 2,
        error: 0,
        total: 2
      });
      expect(usage!.byModel['models/gemini-2.0-flash']).toBeUndefined();
    });

    it('should reset usage on period change without creating history archives', async () => {
      accountUsageService.record('user-old@example.com', 'gemini-1.5-pro', true);
      expect(accountUsageService.getUsageForAccount('user-old@example.com')?.totalSuccess).toBe(1);

      // 模拟周期发生变化
      const pastStore = accountUsageService.getAllUsage();
      (pastStore as any).periodKey = '2026-09-20_15';

      // 触发新的记录，应当自动进入新周期并重置
      accountUsageService.record('user-new@example.com', 'gemini-1.5-pro', true);
      expect(accountUsageService.getUsageForAccount('user-old@example.com')).toBeNull();
      expect(accountUsageService.getUsageForAccount('user-new@example.com')?.totalSuccess).toBe(1);

      // 检查 data/account-usage/history 目录不应存在
      const historyExists = await fs.access(path.join(process.cwd(), 'data', 'account-usage', 'history'))
        .then(() => true)
        .catch(() => false);
      expect(historyExists).toBe(false);
    });

    it('should ignore record calls when accountName is empty or null', () => {
      accountUsageService.record('', 'gemini-1.5-pro', true);
      accountUsageService.record(null as any, 'gemini-1.5-pro', true);
      const all = accountUsageService.getAllUsage();
      expect(Object.keys(all.accounts).length).toBe(0);
    });
  });

  describe('Persistence and flush', () => {
    it('should persist current period to disk and recover after init', async () => {
      accountUsageService.record('persist-user@example.com', 'gemini-1.5-flash', true);
      await accountUsageService.flush();

      // Reset in memory without deleting disk
      const currentUsage = accountUsageService.getUsageForAccount('persist-user@example.com');
      expect(currentUsage?.totalSuccess).toBe(1);

      // Re-initialize
      await accountUsageService.init();
      const restoredUsage = accountUsageService.getUsageForAccount('persist-user@example.com');
      expect(restoredUsage?.totalSuccess).toBe(1);
    });
  });
});
