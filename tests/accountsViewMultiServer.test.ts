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

  it('ConfigModal should support comma-separated multi-server GEMINI_BASE_URL cleaning', () => {
    expect(configCode).toContain("geminiBaseUrl.split(',').map");
    expect(configCode).toContain("placeholder=\"https://generativelanguage.googleapis.com,https://s2.example.com\"");
  });
});
