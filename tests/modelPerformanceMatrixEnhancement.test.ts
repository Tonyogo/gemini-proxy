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
    expect(zhContent).toContain('insightsPrimaryModel');
    expect(zhContent).toContain('insightsFastest');
    expect(zhContent).toContain('insightsTotalThroughput');

    expect(enContent).toContain('specDistribution');
    expect(enContent).toContain('insightsPrimaryModel');
    expect(enContent).toContain('insightsFastest');
    expect(enContent).toContain('insightsTotalThroughput');
  });

  test('ModelPerformanceMatrix should render spec distribution ratio bar', () => {
    expect(matrixContent).toContain('specDistribution');
    expect(matrixContent).toMatch(/standardRequests|highRequests/);
  });

  test('ModelPerformanceMatrix should render latency relative scale indicator', () => {
    expect(matrixContent).toContain('avgLatency');
  });

  test('ModelPerformanceMatrix should render footer insights summary strip', () => {
    expect(matrixContent).toContain('insightsPrimaryModel');
    expect(matrixContent).toContain('insightsFastest');
  });
});
