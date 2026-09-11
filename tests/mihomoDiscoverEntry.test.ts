import * as fs from 'fs';
import * as path from 'path';

describe('Discover Hub Mihomo Entry Integration', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  it('DiscoverHubView includes mihomo tool type and render items', () => {
    const content = fs.readFileSync(hubPath, 'utf-8');
    expect(content).toContain("'mihomo'");
    expect(content).toContain("onSelectTool('mihomo')");
  });

  it('App.tsx handles discoverSubView === "mihomo"', () => {
    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toContain("discoverSubView === 'mihomo'");
  });

  it('translations include mihomo titles and descriptions in zh and en', () => {
    const zh = fs.readFileSync(zhPath, 'utf-8');
    const en = fs.readFileSync(enPath, 'utf-8');
    expect(zh).toContain('mihomoTitle');
    expect(en).toContain('mihomoTitle');
  });
});
