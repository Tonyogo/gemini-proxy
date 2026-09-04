import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard APM & Visual Optimization', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('should import and use formatUptime and formatThroughput', () => {
    expect(content).toContain('formatUptime');
    expect(content).toContain('formatThroughput');
  });

  test('should eliminate hardcoded dark text classes in kpi cards', () => {
    expect(content).not.toContain('text-slate-100');
  });

  test('should support chart tab switching (volume vs latency)', () => {
    expect(content).toContain('chartViewTab');
    expect(content).toContain('setChartViewTab');
  });

  test('should use smooth bezier area chart path generator', () => {
    expect(content).toContain('getBezierSplinePath');
    expect(content).toContain('getBezierAreaPath');
  });

  test('should eliminate hardcoded dark text in matrix components', () => {
    const modelMatrix = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx'),
      'utf-8'
    );
    expect(modelMatrix).not.toContain('text-slate-200');
    expect(modelMatrix).toContain('bg-[var(--border-subtle)]/40');

    const runtimeMatrix = fs.readFileSync(
      path.resolve(__dirname, '../frontend/src/components/dashboard/SystemRuntimeMatrix.tsx'),
      'utf-8'
    );
    expect(runtimeMatrix).not.toContain('text-slate-200');
    expect(runtimeMatrix).not.toContain('text-slate-300');
  });
});

