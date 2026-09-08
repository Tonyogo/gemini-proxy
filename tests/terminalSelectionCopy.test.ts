import fs from 'fs';
import path from 'path';

describe('Terminal Selection and Copy Optimization Tests', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const zhLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  const terminalContent = fs.readFileSync(webTerminalPath, 'utf-8');
  const zhContent = fs.readFileSync(zhLocalePath, 'utf-8');
  const enContent = fs.readFileSync(enLocalePath, 'utf-8');

  test('WebTerminalView contains floating copy bubble for desktop selection', () => {
    // Should manage bubble position state or selection bubble anchor
    expect(terminalContent).toContain('selectionBubblePos');
    // Should render floating bubble with copy action
    expect(terminalContent).toMatch(/selectionBubblePos\s*&&\s*hasSelection/);
    expect(terminalContent).toContain('handleCopySelection');
  });

  test('WebTerminalView top control bar contains persistent copy button linked to hasSelection', () => {
    // Top bar action buttons section should have a copy button wired to hasSelection
    const actionButtonsMatch = terminalContent.match(/\{\/\*\s*Action Buttons\s*\*\/\}[\s\S]*?\{\/\*\s*xterm\.js Canvas Container/);
    expect(actionButtonsMatch).not.toBeNull();
    if (actionButtonsMatch) {
      expect(actionButtonsMatch[0]).toContain('handleCopySelection');
      expect(actionButtonsMatch[0]).toContain('hasSelection');
    }
  });

  test('Mobile selection mode bar enforces single-line layout without line wraps', () => {
    // Selection mode floating bar must have strict nowrap and max width
    expect(terminalContent).toContain('whitespace-nowrap');
    expect(terminalContent).toMatch(/max-w-\[(?:92|95)vw\]/);
  });

  test('i18n locales contain compact selection keys', () => {
    expect(zhContent).toContain('selectAllShort');
    expect(enContent).toContain('selectAllShort');
  });
});
