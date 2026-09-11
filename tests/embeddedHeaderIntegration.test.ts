import * as fs from 'fs';
import * as path from 'path';

describe('Unified Embedded Header Integration & Elimination of Duplicate Toolbar', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const webViewPath = path.resolve(__dirname, '../frontend/src/components/EmbeddedWebView.tsx');

  let appContent: string;
  let webViewContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    webViewContent = fs.readFileSync(webViewPath, 'utf-8');
  });

  describe('App.tsx Unified Embedded Header', () => {
    it('integrates embedded web controls into global header', () => {
      expect(appContent).toContain('data-testid="embed-back-btn"');
      expect(appContent).toContain('data-testid="embed-refresh-btn"');
      expect(appContent).toContain('data-testid="embed-open-external-btn"');
      expect(appContent).toContain('data-testid="embed-fullscreen-btn"');
      expect(appContent).toContain('data-testid="embed-edit-btn"');
    });

    it('renders hostname capsule and security indicator in global header for embedded web', () => {
      expect(appContent).toMatch(/discoverSubView === 'embeddedWeb' && activeEmbeddedApp/);
      expect(appContent).toContain('hostname');
      expect(appContent).toContain('Lock');
    });

    it('syncs remote customWebApps from status response on console load', () => {
      expect(appContent).toContain('syncCustomWebAppsFromRemote');
    });

    it('passes reload trigger and fullscreen state to EmbeddedWebView', () => {
      expect(appContent).toContain('embeddedReloadKey');
      expect(appContent).toContain('isEmbeddedFullscreen');
    });
  });

  describe('EmbeddedWebView Elimination of Duplicate Toolbar', () => {
    it('does not render duplicate internal navigation toolbar in EmbeddedWebView', () => {
      // The back button and toolbar should be in global header, not in EmbeddedWebView
      expect(webViewContent).not.toContain('data-testid="embed-back-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-refresh-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-open-external-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-fullscreen-btn"');
      expect(webViewContent).not.toContain('data-testid="embed-edit-btn"');
    });

    it('EmbeddedWebView directly renders iframe with full height', () => {
      expect(webViewContent).toContain('data-testid="embedded-iframe"');
      expect(webViewContent).toContain('reloadKey');
      expect(webViewContent).toContain('isFullscreen');
      expect(webViewContent).toContain('100%');
    });
  });
});
