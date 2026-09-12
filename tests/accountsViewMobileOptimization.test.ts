import fs from 'fs';
import path from 'path';

describe('AccountsView Mobile Optimization Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies 6 stats chips cards and duplicate page title are hidden on mobile and visible on tablet/desktop', () => {
    // Header block is hidden on mobile to avoid duplicate header with App bar
    expect(code).toContain('hidden sm:flex flex-col md:flex-row');
    expect(code).toContain('hidden sm:grid sm:grid-cols-3 lg:grid-cols-6');
  });

  it('verifies duplicate mobile total count badge is removed since status filter provides counts', () => {
    expect(code).not.toContain('inline-flex sm:hidden items-center');
  });

  it('verifies AccountsView root container adopts responsive compact spacing', () => {
    expect(code).toContain('space-y-2.5 sm:space-y-6');
  });

  it('verifies AccountsView toolbar contains mobile compact single-row and collapsible search', () => {
    expect(code).toContain('isMobileSearchOpen');
    expect(code).toContain('setIsMobileSearchOpen');
    // Mobile search button and toggle
    expect(code).toMatch(/sm:hidden[\s\S]*?setIsMobileSearchOpen/);
  });
});

