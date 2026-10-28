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

  test('ModelPerformanceMatrix should not render high spec distribution column', () => {
    expect(matrixContent).not.toContain('highSpecDistribution');
    expect(matrixContent).not.toContain('High 0 · 0%');
    expect(matrixContent).not.toContain('min-w-[210px]');
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
