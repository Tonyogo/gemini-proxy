import * as fs from 'fs';
import * as path from 'path';

describe('EmbeddedWebView Component Structure & Features', () => {
  const compPath = path.resolve(__dirname, '../frontend/src/components/EmbeddedWebView.tsx');

  it('EmbeddedWebView component file exists', () => {
    expect(fs.existsSync(compPath)).toBe(true);
  });

  it('contains top navigation controls with required data-testid attributes', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('data-testid="embed-back-btn"');
    expect(content).toContain('data-testid="embed-refresh-btn"');
    expect(content).toContain('data-testid="embed-open-external-btn"');
    expect(content).toContain('data-testid="embed-fullscreen-btn"');
    expect(content).toContain('data-testid="embed-edit-btn"');
  });

  it('renders iframe container with proper permissions and data-testid', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('data-testid="embedded-iframe"');
    expect(content).toContain('allow=');
    expect(content).toContain('fullscreen');
    expect(content).toContain('clipboard-read');
    expect(content).toContain('clipboard-write');
  });

  it('supports app title, hostname badge, and open external handler', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('app.name');
    expect(content).toContain('app.url');
    expect(content).toContain('window.open');
    expect(content).toContain('_blank');
  });

  it('supports iframe loading indicator state and error/mixed-content fallback notice', () => {
    const content = fs.readFileSync(compPath, 'utf-8');
    expect(content).toContain('isLoading');
    expect(content).toContain('onLoad');
    expect(content).toContain('mixedContentWarn');
  });
});
