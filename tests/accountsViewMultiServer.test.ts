import fs from 'fs';
import path from 'path';

describe('AccountsView & ConfigModal Multi-Server UI Integration', () => {
  const accountsCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');
  const configCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx'), 'utf-8');

  it('AccountsView should define multi-server state and fetch /api/admin/accounts/servers', () => {
    expect(accountsCode).toContain('const [servers, setServers] = useState<string[]>([]);');
    expect(accountsCode).toContain('const [activeServerIndex, setActiveServerIndex] = useState<number>(0);');
    expect(accountsCode).toContain('/api/admin/accounts/servers');
  });

  it('AccountsView should render server tabs when servers.length > 1 with Server N (host) format', () => {
    expect(accountsCode).toContain('servers.length > 1');
    expect(accountsCode).toContain('Server {idx + 1} ({host})');
    expect(accountsCode).toContain('handleSwitchServer');
  });

  it('AccountsView should include serverId query param in requests', () => {
    expect(accountsCode).toContain('getApiUrl');
    expect(accountsCode).toContain('serverId=${serverIdx}');
    expect(accountsCode).toContain('/close-context');
    expect(accountsCode).toContain('/toggle-disabled');
    expect(accountsCode).toContain('/batch-delete');
    expect(accountsCode).toContain('/deduplicate');
    expect(accountsCode).toContain('/batch-download');
  });

  it('AccountsView should not render redundant in-page h1 accounts title', () => {
    expect(accountsCode).not.toContain('<h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">\n                {t(\'accounts.title\')}\n              </h1>');
  });

  it('AccountsView should render gateway server selector with server indices and status', () => {
    expect(accountsCode).toContain('handleSwitchServer');
    expect(accountsCode).toContain('Server {idx + 1}');
  });

  it('AccountsView should integrate server model stats calculation and banner', () => {
    expect(accountsCode).toContain('calculateServerModelStats');
    expect(accountsCode).toContain('serverModelStats');
    expect(accountsCode).toContain('serverModelStatsTitle');
  });

  it('AccountsView should integrate inline top models in account rows', () => {
    expect(accountsCode).toContain('getAccountTopModels');
  });

  it('AccountsView should display modelSuccessFailed translation in the model stats grid', () => {
    expect(accountsCode).toContain('modelSuccessFailed');
  });

  it('AccountsView should not use invalid Tailwind class py-0.2', () => {
    expect(accountsCode).not.toContain('py-0.2');
  });

  it('ConfigModal should manage multi-server via upstreamServers without legacy geminiBaseUrl input', () => {
    expect(configCode).toContain('upstreamServers');
    expect(configCode).toContain('setUpstreamServers');
    expect(configCode).not.toContain('geminiBaseUrl');
  });
});
