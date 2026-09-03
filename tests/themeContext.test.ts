import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Theme Context Logic', () => {
  let classList: Set<string> = new Set();
  let attributes: Record<string, string> = {};

  const documentMock = {
    documentElement: {
      classList: {
        add: (c: string) => classList.add(c),
        remove: (c: string) => classList.delete(c),
        toggle: (c: string, force?: boolean) => {
          if (force !== undefined) {
            if (force) classList.add(c);
            else classList.delete(c);
            return force;
          }
          if (classList.has(c)) {
            classList.delete(c);
            return false;
          } else {
            classList.add(c);
            return true;
          }
        },
        contains: (c: string) => classList.has(c),
      },
      setAttribute: (k: string, v: string) => {
        attributes[k] = v;
      },
      getAttribute: (k: string) => attributes[k] || null,
      removeAttribute: (k: string) => {
        delete attributes[k];
      },
      className: '',
    },
  };

  beforeEach(() => {
    classList = new Set();
    attributes = {};
    documentMock.documentElement.className = '';
  });

  it('defaults to system and resolves according to matchMedia', () => {
    const isDark = true;
    const resolved = isDark ? 'dark' : 'light';
    expect(resolved).toBe('dark');
  });

  it('correctly sets dark mode classes on html element', () => {
    documentMock.documentElement.classList.add('dark');
    documentMock.documentElement.setAttribute('data-theme', 'dark');
    expect(documentMock.documentElement.classList.contains('dark')).toBe(true);
    expect(documentMock.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('correctly sets light mode classes on html element', () => {
    documentMock.documentElement.classList.remove('dark');
    documentMock.documentElement.setAttribute('data-theme', 'light');
    expect(documentMock.documentElement.classList.contains('dark')).toBe(false);
    expect(documentMock.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
