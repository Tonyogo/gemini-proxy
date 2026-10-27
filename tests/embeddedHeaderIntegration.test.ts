import * as fs from 'fs';
import * as path from 'path';

describe('Unified Discover Header Integration for Embedded Web Apps', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const webViewPath = path.resolve(__dirname, '../frontend/src/components/EmbeddedWebView.tsx');

  let appContent: string;
  let webViewContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    webViewContent = fs.readFileSync(webViewPath, 'utf-8');
  });

  describe('App.tsx Unified Embedded Header', () => {
    it('integrates embedded web controls into global header right section', () => {
      expect(appContent).toContain('data-testid="embed-refresh-btn"');
      expect(appContent).toContain('data-testid="embed-open-external-btn"');
      expect(appContent).toContain('data-testid="embed-fullscreen-btn"');
      expect(appContent).toContain('data-testid="embed-edit-btn"');
    });

    it('unifies embedded web app title into standard breadcrumbs layout', () => {
      expect(appContent).toContain(
        "discoverSubView === 'embeddedWeb' && (activeEmbeddedApp?.name || t('discover.customAppsTitle'))"
      );
      // Header left should use standard breadcrumb flow instead of custom Lock/hostname box
      expect(appContent).not.toContain('getEmbeddedHostname');
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
