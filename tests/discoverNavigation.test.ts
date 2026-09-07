import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover Navigation & WeChat Style Hub', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const hubComponentPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  let appContent: string;

  beforeAll(() => {
    appContent = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf-8') : '';
  });

  test('i18n should include complete discover translations in both zh and en', () => {
    expect((zh.nav as any).discover).toBe('发现');
    expect((en.nav as any).discover).toBe('Discover');

    expect((zh as any).discover).toBeDefined();
    expect((en as any).discover).toBeDefined();

    expect((zh as any).discover.title).toBe('发现中心');
    expect((en as any).discover.title).toBe('Discover Hub');

    expect((zh as any).discover.terminalTitle).toBe('在线终端');
    expect((zh as any).discover.playgroundTitle).toBe('API 调试器');
    expect((zh as any).discover.translateTitle).toBe('翻译工作台');
    expect((zh as any).discover.back).toBe('发现');

    expect((en as any).discover.terminalTitle).toBe('Web Terminal');
    expect((en as any).discover.playgroundTitle).toBe('API Playground');
    expect((en as any).discover.translateTitle).toBe('Translate Studio');
    expect((en as any).discover.back).toBe('Discover');
  });

  test('App.tsx should only have 4 top-level nav items and use Compass icon for discover', () => {
    expect(appContent).toContain("id: 'discover'");
    expect(appContent).toContain('Compass');
    // Ensure terminal, playground, translate are not in top-level NAV_ITEMS
    expect(appContent).not.toMatch(/id:\s*'terminal'/);
    expect(appContent).not.toMatch(/id:\s*'playground'/);
    expect(appContent).not.toMatch(/id:\s*'translate'/);
  });

  test('App.tsx should manage discoverSubView state and handle back navigation', () => {
    expect(appContent).toContain('discoverSubView');
    expect(appContent).toContain('setDiscoverSubView');
    expect(appContent).toContain('DiscoverHubView');
  });

  test('DiscoverHubView component file should exist and support wechat mobile style', () => {
    expect(fs.existsSync(hubComponentPath)).toBe(true);
    const hubContent = fs.readFileSync(hubComponentPath, 'utf-8');
    // Must contain gradient icon containers and chevron right
    expect(hubContent).toContain('from-emerald-500 to-teal-600');
    expect(hubContent).toContain('from-orange-500 to-amber-600');
    expect(hubContent).toContain('from-indigo-500 to-purple-600');
    expect(hubContent).toContain('ChevronRight');
  });
});
