import * as mobileViewportHelper from '../frontend/src/utils/mobileViewportHelper';
import { isMobileScreenOrDevice } from '../frontend/src/utils/mobileViewportHelper';

describe('mobileViewportHelper tests', () => {
  it('prunes legacy terminal functions calculateKeyboardTranslateY and shouldBlockPtyResize', () => {
    expect((mobileViewportHelper as any).calculateKeyboardTranslateY).toBeUndefined();
    expect((mobileViewportHelper as any).shouldBlockPtyResize).toBeUndefined();
  });
  describe('isMobileScreenOrDevice Helper', () => {
    beforeAll(() => {
      (global as any).window = { innerWidth: 1024 };
      (global as any).navigator = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
    });

    afterAll(() => {
      delete (global as any).window;
      delete (global as any).navigator;
    });

    it('should return false when window is undefined (SSR)', () => {
      const win = (global as any).window;
      delete (global as any).window;
      expect(isMobileScreenOrDevice()).toBe(false);
      (global as any).window = win;
    });

    it('should return true if window.innerWidth < 768', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
      expect(isMobileScreenOrDevice()).toBe(true);
    });

    it('should return true if UserAgent matches mobile device even if width is >= 768', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)', configurable: true });
      expect(isMobileScreenOrDevice()).toBe(true);
    });

    it('should return false for desktop browser with large width', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
      Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', configurable: true });
      expect(isMobileScreenOrDevice()).toBe(false);
    });
  });
});
