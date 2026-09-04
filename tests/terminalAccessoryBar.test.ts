import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('TerminalAccessoryBar and Anti-Keyboard-Popup Controls', () => {
  const accessoryBarPath = path.resolve(__dirname, '../frontend/src/components/terminal/TerminalAccessoryBar.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');

  test('TerminalAccessoryBar props include isShiftActive and onToggleShift', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    expect(content).toContain('isShiftActive?: boolean');
    expect(content).toContain('onToggleShift?: () => void');
    expect(content).toContain('isShiftActive = false');
  });

  test('TerminalAccessoryBar renders Shift, Page Up, and Page Down shortcut buttons', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Sticky Shift button in modifier section
    expect(content).toContain("{t('webTerminal.accessoryKeys.shift')}");
    expect(content).toContain('onClick={onToggleShift}');
    expect(content).toContain('isShiftActive');
    expect(content).toContain('bg-amber-600');

    // Page Up & Page Down in navigation section
    expect(content).toContain("{t('webTerminal.accessoryKeys.pgUp')}");
    expect(content).toContain("{t('webTerminal.accessoryKeys.pgDn')}");
    expect(content).toContain("encodeNavigationKey('PageUp'");
    expect(content).toContain("encodeNavigationKey('PageDown'");
  });

  test('All accessory shortcut buttons prevent default on touch and mouse to prevent keyboard popup', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Every key button prevents default on touchStart and mouseDown so soft keyboard is not triggered
    expect(content).toContain('onTouchStart={(e) => e.preventDefault()}');
    expect(content).toContain('onMouseDown={(e) => e.preventDefault()}');
  });

  test('Navigation buttons use encodeNavigationKey for Shift/Ctrl/Alt modifier compatibility', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    expect(content).toContain("encodeNavigationKey('ArrowUp', isCtrlActive, isAltActive, !!isShiftActive)");
    expect(content).toContain("encodeNavigationKey('ArrowDown', isCtrlActive, isAltActive, !!isShiftActive)");
    expect(content).toContain("encodeNavigationKey('ArrowLeft', isCtrlActive, isAltActive, !!isShiftActive)");
    expect(content).toContain("encodeNavigationKey('ArrowRight', isCtrlActive, isAltActive, !!isShiftActive)");
  });

  test('WebTerminalView handleSendInput defaults shouldFocus to false and avoids keyboard popup', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    // handleSendInput accepts shouldFocus = false
    expect(content).toContain('const handleSendInput = (data: string, shouldFocus = false) => {');
    expect(content).toContain('if (shouldFocus) {\n      xtermRef.current?.focus();\n    }');

    // Calling from accessory bar does not focus terminal
    expect(content).toContain('handleSendInput(data, false)');
  });

  test('WebTerminalView manages isShiftActive state and auto-resets on input send', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    // Defines Shift state and ref
    expect(content).toContain('const [isShiftActive, setIsShiftActive] = useState<boolean>(false);');
    expect(content).toContain('const isShiftActiveRef = useRef<boolean>(isShiftActive);');

    // attachCustomKeyEventHandler includes Shift
    expect(content).toContain('const isShift = isShiftActiveRef.current;');
    expect(content).toContain('encodeModifierKey(domEvent, isCtrl, isAlt, isShift)');
    expect(content).toContain('setIsShiftActive(false);');

    // Passes props to TerminalAccessoryBar and auto-resets
    expect(content).toContain('isShiftActive={isShiftActive}');
    expect(content).toContain('onToggleShift={() => setIsShiftActive(!isShiftActive)}');
  });

  test('i18n locales contain shift, pgUp, and pgDn translations in accessoryKeys', () => {
    expect(en.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(en.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(en.webTerminal.accessoryKeys.pgDn).toBe('PgDn');

    expect(zh.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(zh.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(zh.webTerminal.accessoryKeys.pgDn).toBe('PgDn');
  });
});
