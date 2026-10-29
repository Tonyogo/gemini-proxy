import * as fs from 'fs';
import * as path from 'path';

describe('App Navigation Slimming & Backward Compatibility Migration', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  let appCode: string;

  beforeAll(() => {
    appCode = fs.readFileSync(appPath, 'utf-8');
  });

  it('contains exactly 3 top-level navigation items in NAV_ITEMS', () => {
    expect(appCode).toMatch(/NAV_ITEMS:\s*NavItem\[\]\s*=\s*\[\s*\{\s*id:\s*'dashboard'/);
    expect(appCode).toContain("{ id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' }");
    expect(appCode).toContain("{ id: 'logs', icon: FileText, shortcut: '⌘2' }");
    expect(appCode).toContain("{ id: 'discover', icon: Compass, shortcut: '⌘3' }");
    // 'accounts' must not be in NAV_ITEMS
    expect(appCode).not.toMatch(/\{\s*id:\s*'accounts'/);
  });

  it('migrates legacy accounts tab to discover with upstreamNodes subview', () => {
    expect(appCode).toContain("rawSaved === 'accounts'");
    expect(appCode).toContain("'upstreamNodes'");
  });

  it('renders AccountsView inside discover subview upstreamNodes', () => {
    expect(appCode).toContain("discoverSubView === 'upstreamNodes'");
    expect(appCode).toContain('<AccountsView');
  });

  it('includes discover.upstreamNodesTitle in header breadcrumbs', () => {
    expect(appCode).toContain("discoverSubView === 'upstreamNodes' && t('discover.upstreamNodesTitle'");
  });
});
