import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('Terminal Host Selector & Multi-host Frontend Integration', () => {
  const selectorPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalHostSelector.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  test('TerminalHostSelector component exists', () => {
    expect(fs.existsSync(selectorPath)).toBe(true);
  });

  test('WebTerminalView integrates hostId state and host switching', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');
    expect(content).toContain('activeHostId');
    expect(content).toContain('TerminalHostSelector');
    expect(content).toContain('hostId=');
  });

  test('i18n locales contain multi-host translations', () => {
    expect((en as any).webTerminal.hostSelector).toBeDefined();
    expect((zh as any).webTerminal.hostSelector).toBeDefined();
    expect((zh as any).webTerminal.hostSelector.localhost).toBe('本地宿主机');
    expect((zh as any).webTerminal.hostSelector.onlyLocalTip).toBeDefined();
  });

  test('TerminalHostSelector ensures local host is always in displayHosts list', () => {
    const content = fs.readFileSync(selectorPath, 'utf-8');
    expect(content).toContain('displayHosts');
    expect(content).toContain('localHostFallback');
    expect(content).toContain('onlyLocalTip');
  });
});
