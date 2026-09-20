import fs from 'fs';
import path from 'path';

describe('AccountsView Mobile Optimization Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies duplicate page title is hidden on mobile and visible on tablet/desktop, and obsolete stats chips grid is removed', () => {
    // Header block is hidden on mobile to avoid duplicate header with App bar
    expect(code).toContain('hidden sm:flex');
    expect(code).not.toContain('sm:grid-cols-3 lg:grid-cols-6');
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

  it('verifies mobile compact server tab capsules and dedicated active node status bar', () => {
    // Compact mobile tab short label
    expect(code).toContain('accounts.mobileTabShort');
    // Mobile-only active node status bar
    expect(code).toContain('block sm:hidden');
    expect(code).toContain('getServerHost(servers[activeServerIndex])');
  });
});

