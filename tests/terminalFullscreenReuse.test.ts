import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Fullscreen Connection Reuse & Lifecycle', () => {
  const terminalViewPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  let terminalContent: string;
  let appContent: string;

  beforeAll(() => {
    terminalContent = fs.readFileSync(terminalViewPath, 'utf-8');
    appContent = fs.readFileSync(appPath, 'utf-8');
  });

  test('WebTerminalView main init effect should NOT depend on standalone', () => {
    // The main useEffect that creates Terminal and WebSocket must not have standalone in dependency array
    expect(terminalContent).not.toMatch(/term\.dispose\(\);\s*\}\s*;\s*\}\s*,\s*\[[^\]]*\bstandalone\b/);
  });

  test('WebTerminalView should have dedicated standalone effect for fit and sendResize', () => {
    expect(terminalContent).toMatch(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?fitAddonRef\.current[\s\S]*?sendResize[\s\S]*?\}\s*,\s*\[\s*standalone/);
  });

  test('App.tsx should NOT unmount terminal on standalone toggle via early return', () => {
    // Should eliminate early return `if (isStandaloneTerminal) return ...`
    expect(appContent).not.toMatch(/if\s*\(\s*isStandaloneTerminal\s*\)\s*\{\s*return\s*\(\s*<div[^>]*>\s*<WebTerminalView/);
  });
});
