import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Streamlined APM Charts & SystemRuntimeMatrix Removal', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  let content = '';

  beforeAll(() => {
    content = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('should completely remove SystemRuntimeMatrix from DashboardView', () => {
    expect(content).not.toContain('SystemRuntimeMatrix');
    expect(content).not.toContain('<SystemRuntimeMatrix');
  });

  test('should declare chartViewTab state with volume and latency modes', () => {
    expect(content).toMatch(/const\s+\[chartViewTab,\s*setChartViewTab\]\s*=\s*useState<['"]volume['"]\s*\|\s*['"]latency['"]>\(['"]volume['"]\)/);
  });

  test('should declare focusedModel state for model latency inspection', () => {
    expect(content).toMatch(/const\s+\[focusedModel,\s*setFocusedModel\]\s*=\s*useState<string\s*\|\s*null>\(null\)/);
  });

  test('should import and utilize getStackedBarSegments helper for volume mode', () => {
    expect(content).toContain('getStackedBarSegments');
    expect(content).toMatch(/getStackedBarSegments\(/);
  });

  test('should support interactive model focus with hover or click handlers on legend pills', () => {
    expect(content).toMatch(/onMouseEnter=\{.*setFocusedModel/);
    expect(content).toMatch(/onMouseLeave=\{.*setFocusedModel\(null\)/);
    expect(content).toMatch(/onClick=\{.*setFocusedModel/);
  });

  test('should apply conditional styling to latency paths based on focusedModel', () => {
    expect(content).toContain('focusedModel === model');
  });

  test('should maintain no obsolete path helpers in DashboardView', () => {
    expect(content).not.toContain('getOverallLatencyPath');
    expect(content).not.toContain('getModelDistributionPath');
  });
});

describe('Dashboard Anti-Shift & Dark Border Polish', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');

  let dashboardContent: string;
  let matrixContent: string;

  beforeAll(() => {
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
  });

  test('should eliminate volumeChartType switcher and state from DashboardView', () => {
    expect(dashboardContent).not.toContain('volumeChartType');
    expect(dashboardContent).not.toContain('setVolumeChartType');
  });

  test('should eliminate dynamic hoveredIndex metric badge from chart header toolbar', () => {
    // Header toolbar should not dynamically insert hoveredIndex badge
    expect(dashboardContent).not.toMatch(/hoveredIndex\s*!==\s*null\s*&&\s*timeSeries\[hoveredIndex\]\s*&&\s*\(\s*<span[^>]*font-mono/);
  });

  test('ModelPerformanceMatrix should eliminate divide-y divide-[var(--border-subtle)]/50', () => {
    expect(matrixContent).not.toContain('divide-[var(--border-subtle)]/50');
  });

  test('ModelPerformanceMatrix should use dark-subtle border classes', () => {
    expect(matrixContent).toContain('dark:border-white/[0.04]');
  });
});
