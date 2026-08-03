import metricsService from '../src/admin/services/metricsService';
import config from '../config/default';

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
    expect(stats.avgDurationMs).toBe(200);
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

  it('correctly aggregates metrics in separate hour buckets and returns them sorted', () => {
    const date10 = new Date('2026-08-03T10:15:00Z');
    const date14 = new Date('2026-08-03T14:30:00Z');
    const date08 = new Date('2026-08-03T08:05:00Z');

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
    expect(stats.timeSeries).toHaveLength(3);

    expect(stats.timeSeries[0]).toEqual({
      time: exp08,
      total: 1,
      success: 1,
      error: 0,
      avgDurationMs: 300
    });

    expect(stats.timeSeries[1]).toEqual({
      time: exp10,
      total: 2,
      success: 2,
      error: 0,
      avgDurationMs: 150
    });

    expect(stats.timeSeries[2]).toEqual({
      time: exp14,
      total: 1,
      success: 0,
      error: 1,
      avgDurationMs: 400
    });
  });
});
