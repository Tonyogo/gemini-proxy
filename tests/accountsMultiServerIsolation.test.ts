import fs from 'fs';
import path from 'path';

describe('AccountsView Multi-Server Tab Isolation & Direct Status', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  const accountsViewContent = fs.readFileSync(accountsViewPath, 'utf-8');

  test('derives health status directly from status fetch response', () => {
    expect(accountsViewContent).toContain('setServerHealthMap(prev => ({ ...prev, [idx]: true }))');
    expect(accountsViewContent).toContain('setServerHealthMap(prev => ({ ...prev, [idx]: false }))');
  });

  test('displays clear online / offline health indicators on server tabs', () => {
    expect(accountsViewContent).toContain('accounts.nodeOffline');
    expect(accountsViewContent).toMatch(/bg-rose-500/);
    expect(accountsViewContent).toMatch(/bg-emerald-500/);
  });

  test('renders modernized compact header with badge and removes legacy description', () => {
    expect(accountsViewContent).toContain('accounts.modernSub');
    expect(accountsViewContent).not.toContain('Manage multi-account credentials, automatic context rotation');
  });

  test('renders node offline fallback state when active server is unreachable', () => {
    expect(accountsViewContent).toContain('accounts.nodeConnectionFailed');
    expect(accountsViewContent).toContain('accounts.retryNode');
  });
});
