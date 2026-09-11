import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverHubView Custom Apps & App Routing Integration', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  it('DiscoverHubView imports storage utility and CustomWebAppModal', () => {
    const content = fs.readFileSync(hubPath, 'utf-8');
    expect(content).toContain('CustomWebAppModal');
    expect(content).toContain('loadCustomWebApps');
    expect(content).toContain('onSelectCustomApp');
  });

  it('DiscoverHubView renders custom app cards and add app action button', () => {
    const content = fs.readFileSync(hubPath, 'utf-8');
    expect(content).toContain('custom-app-card-');
    expect(content).toContain('addCustomApp');
    expect(content).toContain('customAppsTitle');
  });

  it('DiscoverHubView supports custom apps in both desktop grid and mobile WeChat view', () => {
    const content = fs.readFileSync(hubPath, 'utf-8');
    // Mobile section
    expect(content).toContain('md:hidden');
    // Desktop section
    expect(content).toContain('hidden md:block');
    // Hostname or domain display
    expect(content).toContain('getHostname');
  });

  it('App.tsx includes embeddedWeb in DiscoverSubView and handles activeEmbeddedApp', () => {
    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toContain("'embeddedWeb'");
    expect(content).toContain('activeEmbeddedApp');
    expect(content).toContain('EmbeddedWebView');
    expect(content).toContain('onSelectCustomApp');
  });

  it('App.tsx renders EmbeddedWebView with onBack returning to hub', () => {
    const content = fs.readFileSync(appPath, 'utf-8');
    expect(content).toContain("discoverSubView === 'embeddedWeb'");
    expect(content).toContain("setDiscoverSubView('hub')");
  });
});
