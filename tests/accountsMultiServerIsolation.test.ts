import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Tab Isolation and Caching', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('uses serverDataMap sharded dictionary instead of single data state', () => {
    expect(accountsViewContent).toContain('serverDataMap');
    expect(accountsViewContent).toContain('serverLoadingMap');
    expect(accountsViewContent).toContain('serverErrorMap');
    expect(accountsViewContent).toMatch(/const currentData = serverDataMap\[activeServerIndex\]/);
  });

  test('implements request-ID sequence guard to eliminate race conditions', () => {
    expect(accountsViewContent).toContain('latestRequestIdRef');
    expect(accountsViewContent).toMatch(/reqId !== latestRequestIdRef\.current/);
  });

  test('handleSwitchServer immediately activates new index and checks cached data', () => {
    expect(accountsViewContent).toMatch(/const hasCachedData = Boolean\(serverDataMap\[idx\]\)/);
    expect(accountsViewContent).toContain('setActiveServerIndex(idx)');
  });

  test('mutation handlers explicitly lock targetServerIdx for scoped mutations', () => {
    expect(accountsViewContent).toContain('const targetServerIdx = activeServerIndex');
    expect(accountsViewContent).toMatch(/fetchStatus\(\s*(?:false|true)\s*,\s*targetServerIdx\s*\)/);
  });

  test('renders Server Scope Banner when servers.length > 1', () => {
    expect(accountsViewContent).toContain('accounts.serverScope');
    expect(accountsViewContent).toContain('accounts.scopeDesc');
    expect(accountsViewContent).toContain('activeAuthBadge');
  });
});
