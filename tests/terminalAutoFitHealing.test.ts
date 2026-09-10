import * as fs from 'fs';
import * as path from 'path';

describe('WebTerminalView Auto-Fit Initialization & Healing', () => {
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(webTerminalPath, 'utf-8');
  });

  it('implements safeFit with container dimension guards (clientWidth > 0 && clientHeight > 0)', () => {
    expect(content).toContain('safeFit');
    expect(content).toMatch(/container\.clientWidth\s*<=\s*0\s*\|\|\s*container\.clientHeight\s*<=\s*0/);
  });

  it('uses multi-stage mount probing with requestAnimationFrame and staged fallbacks', () => {
    expect(content).toContain('requestAnimationFrame');
    expect(content).toMatch(/setTimeout\([^,]+,\s*150\)/);
    expect(content).toMatch(/setTimeout\([^,]+,\s*300\)/);
  });
});
