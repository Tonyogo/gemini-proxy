import fs from 'fs';
import path from 'path';

describe('AccountsView Mobile Optimization Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies 6 stats chips cards are hidden on mobile and visible on tablet/desktop', () => {
    expect(code).toContain('hidden sm:grid sm:grid-cols-3 lg:grid-cols-6');
  });

  it('verifies title contains mobile-only total count badge', () => {
    expect(code).toContain('inline-flex sm:hidden items-center');
    expect(code).toContain('{totalCount}');
  });
});
