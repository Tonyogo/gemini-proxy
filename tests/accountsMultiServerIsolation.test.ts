import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Concurrent Refresh & Simplified UI', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('implements concurrent fetchAllServers querying all servers at once', () => {
    expect(accountsViewContent).toContain('fetchAllServers');
    expect(accountsViewContent).toMatch(/Promise\.allSettled/);
  });

  test('displays clear online / offline health indicators on server tabs', () => {
    expect(accountsViewContent).toContain('accounts.nodeOffline');
    expect(accountsViewContent).toMatch(/bg-rose-500/);
    expect(accountsViewContent).toMatch(/bg-emerald-500/);
  });

  test('removes 6 stats chips and server scope banner for maximized viewport', () => {
    // Should NOT contain the old stats chips grid
    expect(accountsViewContent).not.toContain('stats.totalAccounts');
    expect(accountsViewContent).not.toContain('t(\'accounts.serverScope\'');
    // Scope banner removed
    expect(accountsViewContent).not.toContain('t(\'accounts.scopeDesc\'');
  });

  test('renders node offline fallback state when active server is unreachable', () => {
    expect(accountsViewContent).toContain('accounts.nodeConnectionFailed');
    expect(accountsViewContent).toContain('accounts.retryNode');
  });
});
