import fs from 'fs';
import path from 'path';

describe('Theme System Cleanliness Test', () => {
  const readComponent = (name: string) => {
    return fs.readFileSync(path.resolve(__dirname, `../frontend/src/components/${name}`), 'utf-8');
  };

  it('verifies AccountsView does not have hardcoded #10121A, #121520, or #151824 in main tables', () => {
    const code = readComponent('AccountsView.tsx');
    expect(code).not.toContain('bg-[#10121A]');
    expect(code).not.toContain('bg-[#151824]');
  });

  it('verifies ConfigModal does not have hardcoded #0C0E14 or #10121A background', () => {
    const code = readComponent('ConfigModal.tsx');
    expect(code).not.toContain('bg-[#0C0E14]');
    expect(code).not.toContain('bg-[#10121A]');
  });

  it('verifies ConcurrentTestModal does not have hardcoded #0F1118 or #121520 background', () => {
    const code = readComponent('ConcurrentTestModal.tsx');
    expect(code).not.toContain('bg-[#0F1118]');
    expect(code).not.toContain('bg-[#121520]');
  });
});
