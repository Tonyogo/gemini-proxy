import fs from 'fs';
import path from 'path';

describe('Terminal Mobile Selection and Copy/Paste Integration', () => {
  const accessoryBarPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalAccessoryBar.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const zhLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  it('verifies TerminalAccessoryBar provides paste, copy, and select mode buttons', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf8');
    expect(content).toContain('onPaste');
    expect(content).toContain('onCopy');
    expect(content).toContain('onToggleSelectMode');
    expect(content).toContain('ClipboardPaste');
    expect(content).toContain('TextSelect');
    expect(content).toContain('hasSelection');
    expect(content).toContain('isSelectMode');
  });

  it('verifies WebTerminalView implements selection and clipboard operations', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf8');
    expect(content).toContain('handleCopySelection');
    expect(content).toContain('handlePasteClipboard');
    expect(content).toContain('handleToggleSelectMode');
    expect(content).toContain('handleSelectAll');
    expect(content).toContain('handleClearSelection');
    expect(content).toContain('onSelectionChange');
    expect(content).toContain('getCellCoordsFromTouch');
    expect(content).toContain('term.select(');
  });

  it('verifies localization strings are present in both zh.ts and en.ts', () => {
    const zh = fs.readFileSync(zhLocalePath, 'utf8');
    const en = fs.readFileSync(enLocalePath, 'utf8');

    const keys = [
      'copy',
      'paste',
      'copiedToast',
      'selectMode',
      'selectModeActive',
      'selectAll',
      'clearSelection',
      'exitSelectMode'
    ];

    for (const key of keys) {
      expect(zh).toContain(`${key}:`);
      expect(en).toContain(`${key}:`);
    }
  });
});
