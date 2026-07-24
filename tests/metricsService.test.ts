import metricsService from '../src/admin/services/metricsService';

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
