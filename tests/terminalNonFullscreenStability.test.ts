import * as fs from 'fs';
import * as path from 'path';

describe('Non-Fullscreen Terminal Stability & Continuous Canvas', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  let unifiedContent: string;
  let webTerminalContent: string;

  beforeAll(() => {
    unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
    webTerminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('UnifiedTerminalView enforces min-h-[420px] on non-fullscreen container to prevent height collapse', () => {
    expect(unifiedContent).toContain('min-h-[420px]');
    expect(unifiedContent).toContain('flex-1');
  });

  it('WebTerminalView canvas container does not use conditional hidden class', () => {
    // terminalContainerRef must not be conditionally set to hidden
    expect(webTerminalContent).not.toMatch(/ref=\{terminalContainerRef\}[\s\S]*?!activeHostId\s*\?\s*['"]hidden['"]/);
    expect(webTerminalContent).toMatch(/!activeHostId\s*&&[\s\S]*?absolute inset-0 z-20/);
  });
});
