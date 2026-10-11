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

  test('ConfigModal should render per-node proxy input in upstream server cards', () => {
    expect(content).toContain("t('config.nodeProxyTitle'");
  });
});
