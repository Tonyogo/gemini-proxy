import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Full-Width Layout & Merged Charts', () => {
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const systemPath = path.resolve(__dirname, '../frontend/src/components/dashboard/SystemRuntimeMatrix.tsx');

  let dashboardContent: string;
  let matrixContent: string;
  let systemContent: string;

  beforeAll(() => {
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    systemContent = fs.readFileSync(systemPath, 'utf-8');
  });

  test('should eliminate 6:4 split grid classes from DashboardView', () => {
    expect(dashboardContent).not.toContain('lg:grid-cols-12');
    expect(dashboardContent).not.toContain('lg:col-span-7');
    expect(dashboardContent).not.toContain('lg:col-span-5');
  });

  test('unified APM chart should support volume and latency tab switching', () => {
    expect(dashboardContent).toContain('chartViewTab');
    expect(dashboardContent).toContain('getStackedBarSegments');
    expect(dashboardContent).toContain('volumeBarGrad');
    expect(dashboardContent).toContain('allModels');
  });

  test('ModelPerformanceMatrix should render full-width table view with throughput and wide progress bar', () => {
    expect(matrixContent).toContain('table');
    expect(matrixContent).toContain('Throughput');
    expect(matrixContent).toContain('req/s');
    expect(matrixContent).toContain('percentage');
  });

  test('SystemRuntimeMatrix should use full-width 6-column responsive grid', () => {
    expect(systemContent).toContain('lg:grid-cols-6');
  });
});
