import fs from 'fs';
import path from 'path';

describe('Global Theme CSS Safety Net', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../frontend/src/index.css'), 'utf-8');

  it('defines --code-bg and light/dark color tokens', () => {
    expect(indexCss).toContain('--code-bg:');
    expect(indexCss).toContain('--bg-canvas:');
    expect(indexCss).toContain('--text-primary:');
  });

  it('contains light mode slate text overrides to prevent white-on-white text', () => {
    expect(indexCss).toContain(':root:not(.dark)');
    expect(indexCss).toContain('--text-primary');
  });
});
