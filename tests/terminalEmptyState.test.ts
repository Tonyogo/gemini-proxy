import fs from 'fs';
import path from 'path';

describe('WebTerminal Empty State Tests', () => {
  const terminalViewPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const content = fs.readFileSync(terminalViewPath, 'utf-8');

  test('contains empty state rendering when no active host is connected', () => {
    expect(content).toContain('webTerminal.emptyState');
    expect(content).toContain('npm run terminal-agent');
    expect(content).toContain('terminal-empty-state');
  });

  test('ensures useMemo is imported in WebTerminalView to prevent runtime ReferenceError', () => {
    const importReactLine = content.split('\n').find((l) => l.startsWith('import React'));
    expect(importReactLine).toBeDefined();
    expect(importReactLine).toContain('useMemo');
  });
});

