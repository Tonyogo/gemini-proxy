import { formatRelativeTime } from '../frontend/src/utils/timeHelpers';

describe('timeHelpers - formatRelativeTime', () => {
  const now = 1726400000000;

  test('formats less than 1 minute as just now', () => {
    expect(formatRelativeTime(now - 30 * 1000, 'zh', now)).toBe('刚刚离线');
    expect(formatRelativeTime(now - 30 * 1000, 'en', now)).toBe('Just now');
  });

  test('formats minutes correctly', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, 'zh', now)).toBe('离线于 5分钟前');
    expect(formatRelativeTime(now - 5 * 60 * 1000, 'en', now)).toBe('Offline 5m ago');
  });

  test('formats hours correctly', () => {
    expect(formatRelativeTime(now - 3 * 3600 * 1000, 'zh', now)).toBe('离线于 3小时前');
    expect(formatRelativeTime(now - 3 * 3600 * 1000, 'en', now)).toBe('Offline 3h ago');
  });

  test('formats days correctly', () => {
    expect(formatRelativeTime(now - 2 * 86400 * 1000, 'zh', now)).toBe('离线于 2天前');
    expect(formatRelativeTime(now - 2 * 86400 * 1000, 'en', now)).toBe('Offline 2d ago');
  });

  test('handles invalid or empty timestamp', () => {
    expect(formatRelativeTime(0, 'zh', now)).toBe('');
    expect(formatRelativeTime(NaN, 'zh', now)).toBe('');
  });
});
