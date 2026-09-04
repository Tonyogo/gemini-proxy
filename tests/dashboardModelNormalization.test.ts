import * as fs from 'fs';
import * as path from 'path';

describe('ModelPerformanceMatrix Normalization & Dual-State View', () => {
  const matrixPath = path.resolve(__dirname, '../frontend/src/components/dashboard/ModelPerformanceMatrix.tsx');
  const dashboardPath = path.resolve(__dirname, '../frontend/src/components/DashboardView.tsx');

  let matrixContent: string;
  let dashboardContent: string;

  beforeAll(() => {
    matrixContent = fs.readFileSync(matrixPath, 'utf-8');
    dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');
  });

  test('ModelPerformanceMatrix should have desktop table view and mobile card view', () => {
    expect(matrixContent).toContain('hidden md:block');
    expect(matrixContent).toContain('md:hidden');
  });

  test('desktop table view should display standardRequests and highRequests columns', () => {
    expect(matrixContent).toContain('standardRequests');
    expect(matrixContent).toContain('highRequests');
  });

  test('DashboardView should place ModelPerformanceMatrix before charts', () => {
    const matrixIndex = dashboardContent.indexOf('<ModelPerformanceMatrix');
    const chartIndex = dashboardContent.indexOf('volumeBarGrad');

    expect(matrixIndex).toBeGreaterThan(0);
    expect(chartIndex).toBeGreaterThan(0);

    // Matrix must appear BEFORE chart in the DOM
    expect(matrixIndex).toBeLessThan(chartIndex);
  });
});
