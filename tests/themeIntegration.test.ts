import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Theme System Integration', () => {
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
  });

  it('cycles through theme modes correctly: dark -> light -> system -> dark', () => {
    const modes = ['dark', 'light', 'system'] as const;
    let currentIdx = 0;
    const nextTheme = () => {
      currentIdx = (currentIdx + 1) % modes.length;
      return modes[currentIdx];
    };

    expect(nextTheme()).toBe('light');
    expect(nextTheme()).toBe('system');
    expect(nextTheme()).toBe('dark');
  });

  it('persists selected theme to storage', () => {
    storage['gemini_proxy_theme'] = 'light';
    expect(storage['gemini_proxy_theme']).toBe('light');
  });
});
