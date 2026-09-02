const IGNORED_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'ContextMenu',
  'Unidentified'
]);

export function encodeModifierKey(
  event: { key: string; code?: string; shiftKey?: boolean },
  ctrl: boolean,
  alt: boolean
): string | null {
  if (!ctrl && !alt) {
    return null;
  }

  const { key } = event;
  if (!key || IGNORED_KEYS.has(key)) {
    return null;
  }

  // 1. Arrow Keys with Modifier
  const arrowMap: Record<string, string> = {
    ArrowUp: 'A',
    ArrowDown: 'B',
    ArrowRight: 'C',
    ArrowLeft: 'D',
  };

  if (arrowMap[key]) {
    const code = arrowMap[key];
    const modParam = ctrl && alt ? '7' : ctrl ? '5' : '3';
    return `\x1b[1;${modParam}${code}`;
  }

  // 2. Letters (a-z, A-Z)
  if (/^[a-zA-Z]$/.test(key)) {
    let base = key;
    if (ctrl) {
      const charCode = key.toUpperCase().charCodeAt(0);
      base = String.fromCharCode((charCode - 64) & 0x1F);
    }
    return alt ? `\x1b${base}` : base;
  }

  // 3. CTRL + Numbers & Special Control Symbols
  if (ctrl) {
    switch (key) {
      case '@':
      case '2':
      case ' ':
        return alt ? '\x1b\x00' : '\x00';
      case '[':
      case '3':
      case 'Escape':
        return alt ? '\x1b\x1b' : '\x1b';
      case '\\':
      case '4':
        return alt ? '\x1b\x1c' : '\x1c';
      case ']':
      case '5':
        return alt ? '\x1b\x1d' : '\x1d';
      case '^':
      case '6':
        return alt ? '\x1b\x1e' : '\x1e';
      case '_':
      case '-':
      case '7':
        return alt ? '\x1b\x1f' : '\x1f';
      case '?':
      case '8':
        return alt ? '\x1b\x7f' : '\x7f';
      case 'Backspace':
        return alt ? '\x1b\x08' : '\x08';
      case 'Enter':
        return alt ? '\x1b\n' : '\n';
      case 'Tab':
        return alt ? '\x1b\t' : '\t';
      default:
        break;
    }
  }

  // 4. ALT + other character
  if (alt) {
    if (key === 'Enter') return '\x1b\r';
    if (key === 'Tab') return '\x1b\t';
    if (key === 'Backspace') return '\x1b\x7f';
    if (key.length === 1) return `\x1b${key}`;
  }

  return null;
}
