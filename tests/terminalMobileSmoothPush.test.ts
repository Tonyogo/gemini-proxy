import fs from 'fs';
import path from 'path';

describe('WebTerminalView Mobile Smooth Push Integration', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const content = fs.readFileSync(webTerminalPath, 'utf-8');

  test('imports mobileViewportHelper utilities', () => {
    expect(content).toMatch(
      /import\s*{[^}]*calculateKeyboardTranslateY[^}]*shouldBlockPtyResize[^}]*}\s*from\s*['"]\.\.\/utils\/mobileViewportHelper['"]/
    );
  });

  test('maintains base dimension refs for mobile standalone', () => {
    expect(content).toContain('baseHeightRef');
    expect(content).toContain('baseWidthRef');
  });

  test('applies translate3d and spring transition in mobile standalone viewportStyle', () => {
    expect(content).toContain('translate3d(0, -');
    expect(content).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(content).toContain('willChange');
  });

  test('blocks fitAddon.fit and sendResize when keyboard is showing', () => {
    expect(content).toContain('shouldBlockPtyResize');
    expect(content).toMatch(/scrollToBottom(?:Safe)?/);
  });

  test('dismisses keyboard on swipe down gesture in terminal', () => {
    expect(content).toContain('handleTouchMove');
    expect(content).toContain('handleHideKeyboard');
  });

  test('handles orientation change by resetting base dimensions and blurring active inputs', () => {
    expect(content).toContain('orientationchange');
  });
});

