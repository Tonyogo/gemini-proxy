import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Proxy UI Integration', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('ConfigModal should manage proxyUrl state', () => {
    expect(content).toContain('const [proxyUrl, setProxyUrl] = useState<string>');
    expect(content).toContain('proxyUrl: proxyUrl.trim()');
  });

  test('ConfigModal should render global proxy input', () => {
    expect(content).toContain("t('config.globalProxyTitle'");
    expect(content).toContain("t('config.globalProxyPlaceholder'");
  });

  test('ConfigModal should render egress channel segmented switcher for upstream nodes', () => {
    expect(content).toContain("t('config.egressChannelTitle'");
    expect(content).toContain("t('config.egressLocalShort'");
    expect(content).toContain("t('config.egressProxyShort'");
  });

  test('ConfigModal should remove per-node proxy input textboxes', () => {
    expect(content).not.toContain("t('config.nodeProxyTitle'");
  });

  test('ConfigModal should save useProxy boolean in upstreamServers', () => {
    expect(content).toContain('useProxy: Boolean(s.useProxy)');
  });
});
