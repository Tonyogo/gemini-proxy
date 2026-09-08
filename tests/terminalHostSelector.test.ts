import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('TerminalHostSelector Pure Agent Tests', () => {
  const selectorPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalHostSelector.tsx');
  const content = fs.readFileSync(selectorPath, 'utf-8');

  test('does not hardcode localHostFallback object with localhost', () => {
    expect(content).not.toContain('localHostFallback');
  });

  test('auto selects first online host when current host is absent', () => {
    expect(content).toContain('onSelectHost');
  });

  test('i18n locales contain multi-host and empty state translations', () => {
    expect((en as any).webTerminal.hostSelector).toBeDefined();
    expect((zh as any).webTerminal.hostSelector).toBeDefined();
    expect((en as any).webTerminal.emptyState).toBeDefined();
    expect((zh as any).webTerminal.emptyState).toBeDefined();
    expect((zh as any).webTerminal.emptyState.title).toContain('在线终端节点');
  });
});
