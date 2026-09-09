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

  test('TerminalAccessoryBar renders Shift, Page Up, Page Down, Home, End, Del, and OK shortcut buttons', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Sticky Shift button in modifier section
    expect(content).toContain("{t('webTerminal.accessoryKeys.shift')}");
    expect(content).toContain('onClick={onToggleShift}');
    expect(content).toContain('isShiftActive');
    expect(content).toContain('bg-amber-600');

    // Quick OK button next to Enter
    expect(content).toContain("onClick={() => onSendInput('ok\\r')}");
    expect(content).toContain("t('webTerminal.accessoryKeys.ok'");
    expect(content).toContain('bg-emerald-500/15');

    // Navigation section: Home, End, Del, Page Up, Page Down
    expect(content).toContain("t('webTerminal.accessoryKeys.home'");
    expect(content).toContain("t('webTerminal.accessoryKeys.end'");
    expect(content).toContain("t('webTerminal.accessoryKeys.del'");
    expect(content).toContain("encodeNavigationKey('Home'");
    expect(content).toContain("encodeNavigationKey('End'");
    expect(content).toContain("encodeNavigationKey('Delete'");

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

    expect(content).toContain("encodeNavigationKey('Home', isCtrlActive, isAltActive, !!isShiftActive)");
    expect(content).toContain("encodeNavigationKey('End', isCtrlActive, isAltActive, !!isShiftActive)");
    expect(content).toContain("encodeNavigationKey('Delete', isCtrlActive, isAltActive, !!isShiftActive)");
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

  test('i18n locales contain shift, pgUp, pgDn, home, end, del, and ok translations in accessoryKeys', () => {
    expect(en.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(en.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(en.webTerminal.accessoryKeys.pgDn).toBe('PgDn');
    expect(en.webTerminal.accessoryKeys.home).toBe('Home');
    expect(en.webTerminal.accessoryKeys.end).toBe('End');
    expect(en.webTerminal.accessoryKeys.del).toBe('Del');
    expect(en.webTerminal.accessoryKeys.ok).toBe('ok');

    expect(zh.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(zh.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(zh.webTerminal.accessoryKeys.pgDn).toBe('PgDn');
    expect(zh.webTerminal.accessoryKeys.home).toBe('Home');
    expect(zh.webTerminal.accessoryKeys.end).toBe('End');
    expect(zh.webTerminal.accessoryKeys.del).toBe('Del');
    expect(zh.webTerminal.accessoryKeys.ok).toBe('ok');
  });
});
