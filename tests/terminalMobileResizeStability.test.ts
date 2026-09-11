import { calculateKeyboardTranslateY, shouldBlockPtyResize } from '../frontend/src/utils/mobileViewportHelper';

describe('Mobile Viewport Helper - Strict Input Focus Guard', () => {
  it('does not detect keyboard as showing if isInputFocused is false even with large height difference', () => {
    const result = calculateKeyboardTranslateY({
      baseHeight: 844,
      viewportHeight: 600, // 244px diff (e.g. browser chrome collapsed/expanded)
      isInputFocused: false,
    });
    expect(result.isKeyboardShowing).toBe(false);
    expect(result.translateY).toBe(0);
  });

  it('detects keyboard as showing when diff exceeds threshold AND isInputFocused is true', () => {
    const result = calculateKeyboardTranslateY({
      baseHeight: 844,
      viewportHeight: 500, // 344px diff
      isInputFocused: true,
    });
    expect(result.isKeyboardShowing).toBe(true);
    expect(result.translateY).toBe(344);
  });

  it('shouldBlockPtyResize allows resize if isInputFocused is false regardless of isKeyboardShowing', () => {
    const blocked = shouldBlockPtyResize({
      baseWidth: 390,
      currentWidth: 390,
      isKeyboardShowing: true,
      isMobile: true,
      standalone: true,
      isInputFocused: false,
    });
    expect(blocked).toBe(false);
  });

  it('shouldBlockPtyResize blocks resize when mobile standalone, width stable, AND isInputFocused is true with keyboard showing', () => {
    const blocked = shouldBlockPtyResize({
      baseWidth: 390,
      currentWidth: 390,
      isKeyboardShowing: true,
      isMobile: true,
      standalone: true,
      isInputFocused: true,
    });
    expect(blocked).toBe(true);
  });
});
