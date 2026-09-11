import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Mobile Keyboard History Scroll Lock Tests', () => {
  const unifiedPath = path.resolve(__dirname, '../frontend/src/components/UnifiedTerminalView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  const unifiedContent = fs.readFileSync(unifiedPath, 'utf-8');
  const webTerminalContent = fs.readFileSync(webTerminalPath, 'utf-8');

  it('verifies UnifiedTerminalView does not call terminal.fit() on keyboard popup', () => {
    // Should set workspaceStyle and call scrollToBottomSafe, but NOT call fit() which shrinks rows
    const handlerStart = unifiedContent.indexOf('if (offsetResult.isKeyboardShowing)');
    const handlerEnd = unifiedContent.indexOf('} else {', handlerStart);
    const ifBlock = unifiedContent.slice(handlerStart, handlerEnd);
    expect(ifBlock).not.toContain('terminalRef.current?.fit()');
    expect(ifBlock).toContain('terminalRef.current?.scrollToBottomSafe?.()');
  });

  it('verifies safeFit in WebTerminalView suppresses row resizing while mobile keyboard is showing', () => {
    expect(webTerminalContent).toContain('!forceResize && isMobile && standalone && isKeyboardShowingRef.current');
  });

  it('verifies WebTerminalView skips safeFit when keyboard closes with stable width', () => {
    expect(webTerminalContent).toContain('const isWidthStable = Math.abs(window.innerWidth - baseWidthRef.current) <= 20;');
    expect(webTerminalContent).toContain('if (!mobile || !standalone || !isWidthStable)');
  });

  it('verifies WebTerminalView anchors to bottom cursor when keyboard opens', () => {
    expect(webTerminalContent).toContain('if (blockResize)');
    expect(webTerminalContent).toContain('scrollToBottomSafe(xtermRef.current);');
  });
});
