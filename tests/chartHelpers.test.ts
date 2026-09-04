import {
  formatUptime,
  formatThroughput,
  getBezierSplinePath,
  getBezierAreaPath,
  getStackedBarSegments
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

  test('getStackedBarSegments should stack model segments vertically without overlap', () => {
    const point = {
      models: {
        'gemini-1.5-pro': 10,
        'gemini-1.5-flash': 20,
        'gemini-2.0-flash': 0
      }
    };
    const allModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'];
    const getModelCount = (pt: typeof point, m: string) => pt.models[m as keyof typeof pt.models] || 0;

    const segments = getStackedBarSegments(point, allModels, getModelCount, 30, 30, 105);

    // Should exclude 0-count model
    expect(segments).toHaveLength(2);

    // Segment 1: gemini-1.5-pro (count: 10)
    // scale = 105 / 30 = 3.5. Height = 35. Base = 140. Top = 140 - 35 = 105.
    expect(segments[0].model).toBe('gemini-1.5-pro');
    expect(segments[0].count).toBe(10);
    expect(segments[0].height).toBeCloseTo(35, 1);
    expect(segments[0].y).toBeCloseTo(105, 1);

    // Segment 2: gemini-1.5-flash (count: 20)
    // Stacked on top: bottom = 140 - 35 = 105. Height = 70. Top = 105 - 70 = 35.
    expect(segments[1].model).toBe('gemini-1.5-flash');
    expect(segments[1].count).toBe(20);
    expect(segments[1].height).toBeCloseTo(70, 1);
    expect(segments[1].y).toBeCloseTo(35, 1);
  });

  test('getStackedBarSegments should handle edge cases gracefully (yMax = 0, no data)', () => {
    const point = { count: 5 };
    const segments = getStackedBarSegments(point, ['model-a'], (pt: { count: number }) => pt.count, 0, 0, 105);

    expect(Array.isArray(segments)).toBe(true);
    for (const seg of segments) {
      expect(Number.isFinite(seg.y)).toBe(true);
      expect(Number.isFinite(seg.height)).toBe(true);
      expect(isNaN(seg.y)).toBe(false);
      expect(isNaN(seg.height)).toBe(false);
    }
  });
});
