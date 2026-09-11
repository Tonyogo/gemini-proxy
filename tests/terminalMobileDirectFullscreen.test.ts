import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Mobile Direct Fullscreen Routing & Logic', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  let appContent: string;
  let unifiedContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
  });

  it('App.tsx imports isMobileScreenOrDevice from mobileViewportHelper', () => {
    expect(appContent).toContain('isMobileScreenOrDevice');
    expect(appContent).toContain('./utils/mobileViewportHelper');
  });

  it('App.tsx handleSelectDiscoverTool directly enters standalone mode on mobile', () => {
    expect(appContent).toMatch(/handleSelectDiscoverTool\s*=\s*\(tool:\s*DiscoverToolId\)\s*=>\s*\{[\s\S]*?if\s*\(tool\s*===\s*'terminal'\s*&&\s*isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?handleEnterStandalone\(\);/);
  });

  it('App.tsx handleExitStandalone resets discoverSubView to hub on mobile', () => {
    expect(appContent).toMatch(/handleExitStandalone\s*=\s*\(\)\s*=>\s*\{[\s\S]*?if\s*\(isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?setDiscoverSubView\('hub'\);/);
  });

  it('App.tsx popstate/hashchange listener returns to hub on mobile when leaving terminal', () => {
    expect(appContent).toMatch(/handlePopState[\s\S]*?if\s*\(!isTerm\s*&&\s*isMobileScreenOrDevice\(\)\)\s*\{[\s\S]*?setDiscoverSubView\('hub'\);/);
  });

  it('UnifiedTerminalView hides Fullscreen toggle button completely on mobile', () => {
    expect(unifiedContent).toContain('{!isMobile && (');
    expect(unifiedContent).toMatch(/\{!isMobile\s*&&\s*\([\s\S]*?<Maximize2/);
  });
});
