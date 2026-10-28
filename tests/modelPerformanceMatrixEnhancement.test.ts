import * as fs from 'fs';
import * as path from 'path';

describe('ModelPerformanceMatrix Visual & Metrics Enhancement', () => {
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  let matrixContent: string;
  let zhContent: string;
  let enContent: string;

  beforeAll(() => {
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    zhContent = fs.readFileSync(zhPath, 'utf-8');
    enContent = fs.readFileSync(enPath, 'utf-8');
  });

  test('should have localization keys for matrix enhancements in zh and en', () => {
    expect(zhContent).toContain('specDistribution');
    expect(zhContent).toContain('highSpecDistribution');
    expect(zhContent).toContain('insightsPrimaryModel');
    expect(zhContent).toContain('insightsFastest');
    expect(zhContent).toContain('insightsTotalThroughput');

    expect(enContent).toContain('specDistribution');
    expect(enContent).toContain('highSpecDistribution');
    expect(enContent).toContain('insightsPrimaryModel');
    expect(enContent).toContain('insightsFastest');
    expect(enContent).toContain('insightsTotalThroughput');
  });

  test('ModelPerformanceMatrix should render high spec distribution capsules with highAvgLatency', () => {
    expect(matrixContent).toContain('highSpecDistribution');
    expect(matrixContent).toMatch(/highRequests/);
    expect(matrixContent).toContain('highAvgLatency');
    expect(matrixContent).toContain('rounded-full');
  });

  test('ModelPerformanceMatrix should render High spec capsule and ghost capsule without standard spec capsule', () => {
    // Should use fuchsia badge colors for High spec capsule
    expect(matrixContent).toMatch(/fuchsia-500|fuchsia-400/);
    // Should have ghost capsule styling for zero high requests
    expect(matrixContent).toContain('High 0 · 0%');
    // Should have min-w-[210px] for desktop spec column
    expect(matrixContent).toContain('min-w-[210px]');
    // Should display High average latency when present
    expect(matrixContent).toContain('highAvgLatency');
    // Standard spec capsule should not be rendered
    expect(matrixContent).not.toContain('Std {stdCount');
    // Bottom bar removed as requested
    expect(matrixContent).not.toMatch(/h-2\.5\s+rounded-full\s+overflow-hidden/);
    expect(matrixContent).not.toContain('from-sky-500 to-blue-500');
    expect(matrixContent).not.toContain('from-fuchsia-500 to-purple-600');
  });

  test('ModelPerformanceMatrix should render latency relative scale indicator', () => {
    expect(matrixContent).toContain('avgLatency');
  });

  test('ModelPerformanceMatrix should render footer insights summary strip', () => {
    expect(matrixContent).toContain('insightsPrimaryModel');
    expect(matrixContent).toContain('insightsFastest');
  });

  test('ModelPerformanceMatrix should support interactive column sorting with sort icons', () => {
    expect(matrixContent).toContain('handleSort');
    expect(matrixContent).toContain('sortField');
    expect(matrixContent).toContain('sortDirection');
    expect(matrixContent).toMatch(/ArrowUpDown|ArrowUp|ArrowDown/);
  });

  test('ModelPerformanceMatrix should support real-time model search and quick filtering', () => {
    expect(matrixContent).toContain('searchQuery');
    expect(matrixContent).toContain('filterModelsPlaceholder');
    expect(zhContent).toContain('filterModelsPlaceholder');
    expect(enContent).toContain('filterModelsPlaceholder');
  });

  test('ModelPerformanceMatrix should support model family tags and one-click copy', () => {
    expect(matrixContent).toContain('detectModelFamily');
    expect(matrixContent).toContain('handleCopy');
    expect(matrixContent).toContain('copiedModel');
    expect(matrixContent).toContain('family.label');
  });

  test('ModelPerformanceMatrix should use tabular-nums font styling for numerical data', () => {
    expect(matrixContent).toContain('tabular-nums');
  });
});
