import metricsService from '../src/admin/services/metricsService';
import config from '../config/default';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('MetricsService Unit Tests', () => {
  beforeEach(() => {
    metricsService.resetForTesting();
  });

  it('records successful and error transactions correctly in memory', () => {
    metricsService.record(false, 100);
    metricsService.record(false, 200);
    metricsService.record(true, 300);

    const stats = metricsService.getStats();
    expect(stats.totalLogs).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.errorCount).toBe(1);
    expect(stats.avgDurationMs).toBe(150); // (100 + 200) / 2
  });

  it('only records durations and model metrics for successful requests', () => {
    metricsService.record(false, 150, new Date(), 'gemini-3.5-pro'); // Success
    metricsService.record(true, 500, new Date(), 'gemini-3.5-pro');  // Error

    const stats = metricsService.getStats();
    const latest = stats.timeSeries[stats.timeSeries.length - 1];

    expect(stats.totalLogs).toBe(2);
    expect(stats.successCount).toBe(1);
    expect(stats.errorCount).toBe(1);
    expect(stats.sampleSize).toBe(1); // Only success duration counted
    expect(stats.avgDurationMs).toBe(150); // 150 / 1

    expect(latest.models['gemini-3.5-pro']).toBe(1); // Failed model not counted
  });

  it('calculates range-bound sum counts and correct average latency on getStats(range)', () => {
    const now = new Date();
    // Record successful transaction 10 hours ago with 100ms
    metricsService.record(false, 100, new Date(now.getTime() - 10 * 3600 * 1000), 'model-a');
    // Record successful transaction 2 hours ago with 200ms
    metricsService.record(false, 200, new Date(now.getTime() - 2 * 3600 * 1000), 'model-b');

    const stats6h = metricsService.getStats(6);
    expect(stats6h.timeSeries).toHaveLength(6);
    expect(stats6h.totalLogs).toBe(1); // Only transaction from 2h ago
    expect(stats6h.avgDurationMs).toBe(200);

    const stats12h = metricsService.getStats(12);
    expect(stats12h.timeSeries).toHaveLength(12);
    expect(stats12h.totalLogs).toBe(2); // Both transactions inside 12h
    expect(stats12h.avgDurationMs).toBe(150); // (100 + 200) / 2
  });
});

describe('MetricsService Time-Series Aggregations', () => {
  beforeEach(() => {
    metricsService.resetForTesting();
  });

  it('includes timeSeries array in getStats output', () => {
    metricsService.record(false, 150);
    metricsService.record(true, 300);

    const stats = metricsService.getStats();
    expect(stats).toHaveProperty('timeSeries');
    expect(Array.isArray(stats.timeSeries)).toBe(true);
    expect(stats.timeSeries.length).toBeGreaterThan(0);

    const latest = stats.timeSeries[stats.timeSeries.length - 1];
    expect(latest).toHaveProperty('time');
    expect(latest).toHaveProperty('total');
    expect(latest).toHaveProperty('success');
    expect(latest).toHaveProperty('error');
    expect(latest).toHaveProperty('avgDurationMs');
  });

  it('correctly aggregates metrics in separate hour buckets and returns trailing 24 hours', () => {
    const now = new Date();
    const date10 = new Date(now.getTime() - 2 * 3600 * 1000);
    const date14 = new Date(now.getTime() - 1 * 3600 * 1000);
    const date08 = new Date(now.getTime() - 3 * 3600 * 1000);

    const formatExpectedHour = (d: Date): string => {
      const timeZone = config.timeZone || 'Asia/Shanghai';
      const formatter = new Intl.DateTimeFormat('sv-SE', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23'
      });
      const parts = formatter.formatToParts(d);
      const year = parts.find(p => p.type === 'year')?.value || '2026';
      const month = parts.find(p => p.type === 'month')?.value || '08';
      const day = parts.find(p => p.type === 'day')?.value || '03';
      const hour = parts.find(p => p.type === 'hour')?.value || '00';
      return `${year}-${month}-${day} ${hour}:00`;
    };

    const exp08 = formatExpectedHour(date08);
    const exp10 = formatExpectedHour(date10);
    const exp14 = formatExpectedHour(date14);

    metricsService.record(false, 100, date10);
    metricsService.record(false, 200, date10); // same hour, total 2, success 2, avg 150
    metricsService.record(true, 400, date14);  // separate hour, total 1, error 1, avg 400
    metricsService.record(false, 300, date08); // separate hour, total 1, success 1, avg 300

    const stats = metricsService.getStats();
    expect(stats.timeSeries).toHaveLength(24);

    const p08 = stats.timeSeries.find(p => p.time === exp08);
    const p10 = stats.timeSeries.find(p => p.time === exp10);
    const p14 = stats.timeSeries.find(p => p.time === exp14);

    expect(p08).toEqual({
      time: exp08,
      total: 1,
      success: 1,
      error: 0,
      avgDurationMs: 300,
      models: {}
    });

    expect(p10).toEqual({
      time: exp10,
      total: 2,
      success: 2,
      error: 0,
      avgDurationMs: 150,
      models: {}
    });

    expect(p14).toEqual({
      time: exp14,
      total: 1,
      success: 0,
      error: 1,
      avgDurationMs: 0,
      models: {}
    });
  });

  it('tracks per-model counts inside timeSeries buckets', () => {
    metricsService.record(false, 100, new Date(), 'gemini-3.1-flash');
    metricsService.record(false, 200, new Date(), 'claude-3-5-sonnet');

    const stats = metricsService.getStats();
    const latest = stats.timeSeries[stats.timeSeries.length - 1];
    expect(latest).toHaveProperty('models');
    expect(latest.models['gemini-3.1-flash']).toBe(1);
    expect(latest.models['claude-3-5-sonnet']).toBe(1);
  });
});

describe('MetricsService Initialization via index.jsonl', () => {
  const testLogsDir = path.join(process.cwd(), 'logs_test_metrics');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const formatDate = (d: Date): string => {
    const timeZone = config.timeZone || 'Asia/Shanghai';
    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  };

  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);

  const todayDir = path.join(testLogsDir, todayStr);
  const yesterdayDir = path.join(testLogsDir, yesterdayStr);
  const farPastDir = path.join(testLogsDir, '2020-01-01');

  beforeEach(async () => {
    config.transactionLogsDir = testLogsDir;
    metricsService.resetForTesting();
    await fs.mkdir(todayDir, { recursive: true });
    await fs.mkdir(yesterdayDir, { recursive: true });
    await fs.mkdir(farPastDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testLogsDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    config.transactionLogsDir = 'logs';
  });

  it('hydrates stats cleanly from index.jsonl on init()', async () => {
    const todayRecord = {
      id: 'tx1',
      timestamp: today.toISOString(),
      date: todayStr,
      hour: '12',
      filename: 'transaction_tx1.json',
      path: `${todayStr}/12/transaction_tx1.json`,
      status: 200,
      duration: 150,
      reqPath: '/v1/messages',
      model: 'gemini-1.5-pro',
      isStream: false
    };

    const yesterdayRecord = {
      id: 'tx2',
      timestamp: yesterday.toISOString(),
      date: yesterdayStr,
      hour: '14',
      filename: 'transaction_tx2.json',
      path: `${yesterdayStr}/14/transaction_tx2.json`,
      status: 500,
      duration: 350,
      reqPath: '/v1/messages',
      model: 'gemini-1.5-flash',
      isStream: true
    };

    const farPastRecord = {
      id: 'tx3',
      timestamp: '2020-01-01T12:00:00Z',
      date: '2020-01-01',
      hour: '12',
      filename: 'transaction_tx3.json',
      path: '2020-01-01/12/transaction_tx3.json',
      status: 200,
      duration: 100,
      reqPath: '/v1/messages',
      model: 'gemini-1.5-pro',
      isStream: false
    };

    await fs.writeFile(path.join(todayDir, 'index.jsonl'), JSON.stringify(todayRecord) + '\n', 'utf8');
    await fs.writeFile(path.join(yesterdayDir, 'index.jsonl'), JSON.stringify(yesterdayRecord) + '\n', 'utf8');
    await fs.writeFile(path.join(farPastDir, 'index.jsonl'), JSON.stringify(farPastRecord) + '\n', 'utf8');

    await metricsService.init();

    const stats = metricsService.getStats();
    // 3 logs total across all days
    expect(stats.totalLogs).toBe(3);
    // Only today & yesterday hydrated for stats
    expect(stats.successCount).toBe(1); // today (200)
    expect(stats.errorCount).toBe(1);   // yesterday (500)
    expect(stats.sampleSize).toBe(1);   // only today (status 200) duration recorded
    expect(stats.avgDurationMs).toBe(150); // only today duration (150)
  });
});
