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

  test('TerminalAccessoryBar renders categorized layout: ok with ^C, Enter with arrows, and extended keys after arrows', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Sticky Shift button in modifier section
    expect(content).toContain("{t('webTerminal.accessoryKeys.shift')}");
    expect(content).toContain('onClick={onToggleShift}');
    expect(content).toContain('isShiftActive');
    expect(content).toContain('bg-amber-600');

    // Quick OK button grouped with ^C signal/action keys
    expect(content).toContain("onClick={() => onSendInput('ok\\r')}");
    expect(content).toContain("t('webTerminal.accessoryKeys.ok'");
    expect(content).toContain('bg-emerald-500/15');

    // Relative ordering verification:
    // 1. ^C comes before ok
    const idxCtrlC = content.indexOf("title=\"SIGINT (Ctrl+C)\"");
    const idxOk = content.indexOf("onClick={() => onSendInput('ok\\r')}");
    expect(idxCtrlC).toBeGreaterThan(0);
    expect(idxOk).toBeGreaterThan(idxCtrlC);

    // 2. ok comes before Enter (↵)
    const idxEnter = content.indexOf("title=\"Enter (Return)\"");
    expect(idxEnter).toBeGreaterThan(idxOk);

    // 3. Enter (↵) comes before arrows
    const idxArrowUp = content.indexOf("encodeNavigationKey('ArrowUp'");
    expect(idxArrowUp).toBeGreaterThan(idxEnter);

    // 4. Arrow keys come before Home, End, Del, PgUp, PgDn
    const idxArrowRight = content.indexOf("encodeNavigationKey('ArrowRight'");
    const idxHome = content.indexOf("encodeNavigationKey('Home'");
    const idxEnd = content.indexOf("encodeNavigationKey('End'");
    const idxDel = content.indexOf("encodeNavigationKey('Delete'");
    const idxPgUp = content.indexOf("encodeNavigationKey('PageUp'");
    const idxPgDn = content.indexOf("encodeNavigationKey('PageDown'");

    expect(idxHome).toBeGreaterThan(idxArrowRight);
    expect(idxEnd).toBeGreaterThan(idxHome);
    expect(idxDel).toBeGreaterThan(idxEnd);
    expect(idxPgUp).toBeGreaterThan(idxDel);
    expect(idxPgDn).toBeGreaterThan(idxPgUp);
  });

  test('TerminalAccessoryBar supports concise mode and localStorage persistence', () => {
    const content = fs.readFileSync(accessoryBarPath, 'utf-8');

    // Default concise mode from localStorage
    expect(content).toContain("localStorage.getItem('terminal_accessory_concise_mode')");
    expect(content).toContain("localStorage.setItem('terminal_accessory_concise_mode'");

    // Toggle button renders moreKeys and conciseKeys
    expect(content).toContain("t('webTerminal.accessoryKeys.moreKeys'");
    expect(content).toContain("t('webTerminal.accessoryKeys.conciseKeys'");

    // Non-concise keys guarded by !isConciseMode
    expect(content).toContain('{!isConciseMode && (');
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

  test('i18n locales contain shift, pgUp, pgDn, home, end, del, ok, and mode toggle translations in accessoryKeys', () => {
    expect(en.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(en.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(en.webTerminal.accessoryKeys.pgDn).toBe('PgDn');
    expect(en.webTerminal.accessoryKeys.home).toBe('Home');
    expect(en.webTerminal.accessoryKeys.end).toBe('End');
    expect(en.webTerminal.accessoryKeys.del).toBe('Del');
    expect(en.webTerminal.accessoryKeys.ok).toBe('ok');
    expect(en.webTerminal.accessoryKeys.moreKeys).toBe('More');
    expect(en.webTerminal.accessoryKeys.conciseKeys).toBe('Compact');

    expect(zh.webTerminal.accessoryKeys.shift).toBe('SHIFT');
    expect(zh.webTerminal.accessoryKeys.pgUp).toBe('PgUp');
    expect(zh.webTerminal.accessoryKeys.pgDn).toBe('PgDn');
    expect(zh.webTerminal.accessoryKeys.home).toBe('Home');
    expect(zh.webTerminal.accessoryKeys.end).toBe('End');
    expect(zh.webTerminal.accessoryKeys.del).toBe('Del');
    expect(zh.webTerminal.accessoryKeys.ok).toBe('ok');
    expect(zh.webTerminal.accessoryKeys.moreKeys).toBe('更多');
    expect(zh.webTerminal.accessoryKeys.conciseKeys).toBe('简洁');
  });
});
