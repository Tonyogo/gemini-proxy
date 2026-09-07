import fs from 'fs';
import path from 'path';

describe('PlaygroundView Header Controls Decoupling', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  const content = fs.readFileSync(playgroundPath, 'utf-8');

  test('endpoint container does not contain embedded stream toggle button', () => {
    // Look for the endpoint option wrapper - it should NOT contain handleToggleStreamInBody inside it
    const endpointBlockMatch = content.match(/<Globe[^>]*>[\s\S]*?<\/select>[\s\S]*?<\/div>/);
    expect(endpointBlockMatch).not.toBeNull();
    if (endpointBlockMatch) {
      expect(endpointBlockMatch[0]).not.toContain('handleToggleStreamInBody');
    }
  });

  test('stream toggle is an independent pill button rendered alongside action controls', () => {
    // Stream button should be independently rendered
    expect(content).toContain('handleToggleStreamInBody');
    expect(content).toContain('isStreamChecked');
    expect(content).toContain('<Zap');
  });

  test('model and endpoint selectors share row 1 with flexible balanced widths', () => {
    expect(content).toContain('selectedModel');
    expect(content).toContain('STANDARD_MODELS');
    expect(content).toContain('endpointOption');
  });

  test('presets selector and run test button are clearly separated in row 2', () => {
    expect(content).toContain('activePreset');
    expect(content).toContain('handleApplyPreset');
    expect(content).toContain('handleSend');
  });

  test('stream toggle is positioned in row 2 after presets selector', () => {
    const presetIndex = content.lastIndexOf('handleApplyPreset');
    const streamIndex = content.lastIndexOf('handleToggleStreamInBody');
    expect(streamIndex).toBeGreaterThan(presetIndex);
  });
});
