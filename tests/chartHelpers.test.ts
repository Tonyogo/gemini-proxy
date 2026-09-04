import {
  formatUptime,
  formatThroughput,
  getBezierSplinePath,
  getBezierAreaPath
} from '../frontend/src/utils/chartHelpers';

describe('Chart Helpers & APM Formatters', () => {
  test('formatUptime should format seconds into human-readable uptime', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m 5s');
    expect(formatUptime(3665)).toBe('1h 1m');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
  });

  test('formatThroughput should calculate requests per second correctly', () => {
    // 3600 requests over 1 hour (range 1) = 1.00 req/s
    expect(formatThroughput(3600, 1)).toBe('1.00 req/s');
    // 0 requests
    expect(formatThroughput(0, 6)).toBe('0.00 req/s');
  });

  test('getBezierSplinePath should generate smooth bezier SVG path', () => {
    const points = [
      { x: 50, y: 100 },
      { x: 100, y: 50 },
      { x: 150, y: 80 },
      { x: 200, y: 30 }
    ];
    const path = getBezierSplinePath(points);
    expect(path).toMatch(/^M 50,100 C/);
    expect(path).toContain('200,30');
  });

  test('getBezierAreaPath should close path to yBase baseline', () => {
    const points = [
      { x: 50, y: 100 },
      { x: 100, y: 50 }
    ];
    const areaPath = getBezierAreaPath(points, 200);
    expect(areaPath).toMatch(/^M 50,100 C/);
    expect(areaPath).toContain('L 100,200 L 50,200 Z');
  });
});
