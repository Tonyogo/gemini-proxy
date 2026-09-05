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
});
