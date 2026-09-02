import { encodeModifierKey } from '../frontend/src/utils/terminalKeyEncoder';

describe('terminalKeyEncoder', () => {
  it('returns null when no virtual modifiers are active', () => {
    expect(encodeModifierKey({ key: 'c' }, false, false)).toBeNull();
  });

  it('ignores modifier keys alone (Shift, Control, Alt, Meta)', () => {
    expect(encodeModifierKey({ key: 'Shift' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Control' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Alt' }, true, false)).toBeNull();
    expect(encodeModifierKey({ key: 'Meta' }, false, true)).toBeNull();
  });

  it('encodes CTRL + letter to control character (\\x01 - \\x1a)', () => {
    expect(encodeModifierKey({ key: 'a' }, true, false)).toBe('\x01');
    expect(encodeModifierKey({ key: 'c' }, true, false)).toBe('\x03');
    expect(encodeModifierKey({ key: 'd' }, true, false)).toBe('\x04');
    expect(encodeModifierKey({ key: 'z' }, true, false)).toBe('\x1a');
    expect(encodeModifierKey({ key: 'C' }, true, false)).toBe('\x03');
  });

  it('encodes ALT + letter to ESC + letter', () => {
    expect(encodeModifierKey({ key: 'b' }, false, true)).toBe('\x1bb');
    expect(encodeModifierKey({ key: 'f' }, false, true)).toBe('\x1bf');
    expect(encodeModifierKey({ key: 'd' }, false, true)).toBe('\x1bd');
  });

  it('encodes CTRL + ALT + letter to ESC + control char', () => {
    expect(encodeModifierKey({ key: 'a' }, true, true)).toBe('\x1b\x01');
    expect(encodeModifierKey({ key: 'c' }, true, true)).toBe('\x1b\x03');
  });

  it('encodes CTRL + number / special symbol characters', () => {
    expect(encodeModifierKey({ key: '2' }, true, false)).toBe('\x00');
    expect(encodeModifierKey({ key: '@' }, true, false)).toBe('\x00');
    expect(encodeModifierKey({ key: '[' }, true, false)).toBe('\x1b');
    expect(encodeModifierKey({ key: '\\' }, true, false)).toBe('\x1c');
    expect(encodeModifierKey({ key: ']' }, true, false)).toBe('\x1d');
    expect(encodeModifierKey({ key: '^' }, true, false)).toBe('\x1e');
    expect(encodeModifierKey({ key: '_' }, true, false)).toBe('\x1f');
    expect(encodeModifierKey({ key: '?' }, true, false)).toBe('\x7f');
    expect(encodeModifierKey({ key: 'Backspace' }, true, false)).toBe('\x08');
  });

  it('encodes arrow keys with modifiers', () => {
    expect(encodeModifierKey({ key: 'ArrowUp' }, true, false)).toBe('\x1b[1;5A');
    expect(encodeModifierKey({ key: 'ArrowDown' }, true, false)).toBe('\x1b[1;5B');
    expect(encodeModifierKey({ key: 'ArrowRight' }, false, true)).toBe('\x1b[1;3C');
    expect(encodeModifierKey({ key: 'ArrowLeft' }, true, true)).toBe('\x1b[1;7D');
  });
});
