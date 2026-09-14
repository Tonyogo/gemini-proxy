import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Mobile Enhancements', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('should include a mobile-only header quick save button', () => {
    expect(content).toContain('onClick={handleSave}');
    expect(content).toContain('sm:hidden');
  });

  test('should lock body scroll when modal is open and restore on close', () => {
    expect(content).toContain("document.body.style.overflow = 'hidden'");
  });

  test('should use dynamic viewport height dvh and safe area inset padding', () => {
    expect(content).toContain('dvh');
    expect(content).toContain('safe-area-inset-bottom');
  });

  test('should layout model mapping with mobile top action bar and desktop single-line flow', () => {
    expect(content).toContain('order-1');
    expect(content).toContain('order-2 sm:order-3');
    expect(content).toContain('order-3 sm:order-2');
    expect(content).toContain('basis-full sm:basis-auto');
    expect(content).toContain('h-7 sm:h-8');
  });

  test('should remove bottom action separator in mobile mapping card', () => {
    // Verifies that the previous pt-1.5 border-t separator inside mapping item actions is eliminated
    expect(content).not.toContain('pt-1.5 sm:pt-0 border-t border-white/[0.04]');
  });
});
