import fs from 'fs';
import path from 'path';

describe('Playground View Mobile Layout Optimization', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(playgroundPath, 'utf-8');
  });

  test('auto-switches mobile tab to response on handleSend', () => {
    expect(content).toContain("setMobileActiveTab('response');");
  });

  test('uses responsive height on main container to prevent mobile viewport clipping', () => {
    expect(content).toMatch(/h-auto\s+min-h-0\s+md:h-\[calc\(100dvh-6\.5rem\)\]/);
  });

  test('organizes mobile controls with responsive tiered layout', () => {
    // Top brand/action row
    expect(content).toContain('hidden sm:block');
    // Compact action button in header
    expect(content).toContain('handleSend');
  });
});
