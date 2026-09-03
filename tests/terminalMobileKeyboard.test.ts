import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('Mobile Keyboard Dismissal and Checkmark Controls', () => {
  const accessoryBarPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalAccessoryBar.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const translateViewPath = path.resolve(__dirname, '../frontend/src/components/TranslateView.tsx');

  test('TerminalAccessoryBar renders a dedicated Done checkmark button to dismiss mobile keyboard', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Check icon import
    expect(content).toMatch(/import\s*{[^}]*Check[^}]*}\s*from\s*'lucide-react'/);

    // Props definition includes onHideKeyboard and isKeyboardOpen
    expect(content).toContain('onHideKeyboard?: () => void');
    expect(content).toContain('isKeyboardOpen?: boolean');

    // Renders dedicated Check button calling onHideKeyboard or onToggleKeyboard
    expect(content).toContain('onClick={onHideKeyboard || onToggleKeyboard}');
    expect(content).toContain('<Check className="w-3.5 h-3.5 stroke-[2.5]" />');
    expect(content).toContain("{t('webTerminal.done')}");
  });

  test('WebTerminalView sets enterkeyhint="done" on helperTextarea and implements keyboard dismissal', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    // Virtual keyboard action hint set to "done" for mobile checkmark
    expect(content).toContain("helperTextarea.setAttribute('enterkeyhint', 'done')");

    // Tracks focus and blur to sync isKeyboardOpen
    expect(content).toContain("helperTextarea.addEventListener('focus', handleFocus)");
    expect(content).toContain("helperTextarea.addEventListener('blur', handleBlur)");

    // Implements handleHideKeyboard which blurs textarea and activeElement
    expect(content).toContain('const handleHideKeyboard = () => {');
    expect(content).toContain('textarea.blur()');
    expect(content).toContain('(document.activeElement as HTMLElement)?.blur()');
    expect(content).toContain('setIsKeyboardOpen(false)');

    // Passes onHideKeyboard and isKeyboardOpen to TerminalAccessoryBar
    expect(content).toContain('onHideKeyboard={handleHideKeyboard}');
    expect(content).toContain('isKeyboardOpen={isKeyboardOpen}');
  });

  test('TranslateView includes mobile Done checkmark button for dismissing keyboard', () => {
    const content = fs.readFileSync(translateViewPath, 'utf-8');

    expect(content).toContain("title={t('translate.done')}");
    expect(content).toContain('(document.activeElement as HTMLElement)?.blur()');
  });

  test('i18n locales contain matching hideKeyboard and done translation keys', () => {
    expect(en.webTerminal.hideKeyboard).toBe('Hide Keyboard');
    expect(en.webTerminal.done).toBe('Done');
    expect(zh.webTerminal.hideKeyboard).toBe('收起键盘');
    expect(zh.webTerminal.done).toBe('完成');

    expect(en.translate.done).toBe('Done');
    expect(zh.translate.done).toBe('完成');
  });
});
