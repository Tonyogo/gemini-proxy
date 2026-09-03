import fs from 'fs';
import path from 'path';

describe('AccountsView Theme Refinement Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies dirty dark background filters are removed', () => {
    expect(code).not.toContain('bg-emerald-950/20');
    expect(code).not.toContain('bg-indigo-950/20');
    expect(code).not.toContain('bg-black/20');
  });

  it('verifies clean current account and checked styling are used', () => {
    expect(code).toContain('bg-emerald-50/50');
    expect(code).toContain('bg-indigo-50/60');
  });
});
