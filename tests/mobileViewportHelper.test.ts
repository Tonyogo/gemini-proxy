import {
  calculateKeyboardTranslateY,
  shouldBlockPtyResize,
  isMobileScreenOrDevice,
} from '../frontend/src/utils/mobileViewportHelper';

describe('mobileViewportHelper tests', () => {
  describe('calculateKeyboardTranslateY', () => {
    test('returns 0 translateY and isKeyboardShowing=false when visual viewport matches base height', () => {
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 844,
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(false);
      expect(result.translateY).toBe(0);
    });

    test('detects keyboard and computes translateY when viewport height is reduced by soft keyboard', () => {
      // 844 - 544 = 300px keyboard
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 544,
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(true);
      expect(result.translateY).toBe(300);
    });

    test('takes offsetTop into account when browser auto-shifts visual viewport', () => {
      // 844 - 544 = 300px diff, with offsetTop 50 -> translateY = 250
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 544,
        offsetTop: 50,
      });
      expect(result.isKeyboardShowing).toBe(true);
      expect(result.translateY).toBe(250);
    });

    test('ignores tiny height fluctuations under 150px or under 18% baseHeight', () => {
      const result = calculateKeyboardTranslateY({
        baseHeight: 844,
        viewportHeight: 800, // 44px diff (e.g. browser address bar hide)
        offsetTop: 0,
      });
      expect(result.isKeyboardShowing).toBe(false);
      expect(result.translateY).toBe(0);
    });
  });

  describe('shouldBlockPtyResize', () => {
    test('does not block on desktop or when not standalone', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 1024,
          currentWidth: 1024,
          isKeyboardShowing: true,
          isMobile: false,
          standalone: false,
        })
      ).toBe(false);
    });

    test('blocks PTY resize when mobile standalone and keyboard is showing without width change', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 390,
          currentWidth: 390,
          isKeyboardShowing: true,
          isMobile: true,
          standalone: true,
        })
      ).toBe(true);
    });

    test('does not block PTY resize if width changed significantly (screen rotation)', () => {
      expect(
        shouldBlockPtyResize({
          baseWidth: 390,
          currentWidth: 844, // rotated to landscape
          isKeyboardShowing: true,
          isMobile: true,
          standalone: true,
        })
      ).toBe(false);
    });
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
