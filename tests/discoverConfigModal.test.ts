import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverConfigModal Component Integrity', () => {
  const filePath = path.resolve(__dirname, '../frontend/src/components/DiscoverConfigModal.tsx');

  it('exports DiscoverConfigModal with required props and controls', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export const DiscoverConfigModal');
    expect(content).toContain('onAppsUpdated');
    expect(content).toContain('moveDiscoverApp');
    expect(content).toContain('toggleDiscoverAppVisibility');
    expect(content).toContain('resetDiscoverAppsToDefault');
  });

  it('includes Move Up, Move Down, Toggle Switch and Action buttons', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ArrowUp');
    expect(content).toContain('ArrowDown');
    expect(content).toContain('Eye');
    expect(content).toContain('Trash2');
    expect(content).toContain('Edit3');
  });
});
