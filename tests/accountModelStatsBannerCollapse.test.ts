import * as fs from 'fs';
import * as path from 'path';

describe('AccountsView Node Model Usage Overview Banner Collapse', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(accountsViewPath, 'utf-8');
  });

  test('isStatsCollapsed should initialize to true (default collapsed)', () => {
    expect(content).toMatch(/const\s*\[isStatsCollapsed,\s*setIsStatsCollapsed\]\s*=\s*useState<boolean>\(true\);/);
  });

  test('header row should be directly clickable with cursor-pointer and hover styling', () => {
    const headerRowStart = content.indexOf('{/* Node Model Usage Overview Banner */}');
    const headerRowEnd = content.indexOf('{/* Collapsible Content */}');
    expect(headerRowStart).toBeGreaterThan(-1);
    expect(headerRowEnd).toBeGreaterThan(headerRowStart);

    const headerArea = content.substring(headerRowStart, headerRowEnd);
    expect(headerArea).toContain('cursor-pointer');
    expect(headerArea).toContain('onClick={() => setIsStatsCollapsed(!isStatsCollapsed)}');
    expect(headerArea).toMatch(/hover:bg-slate-500\/5|hover:bg-black\/|hover:bg-white\//);
  });

  test('toggle button should still render with accessible title and toggle chevron', () => {
    expect(content).toContain('title={isStatsCollapsed ? t(\'accounts.toggleStatsExpand\') : t(\'accounts.toggleStatsCollapse\')}');
    expect(content).toContain('{isStatsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}');
  });
});
