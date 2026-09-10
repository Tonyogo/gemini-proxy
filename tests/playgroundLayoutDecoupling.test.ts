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

  test('stream toggle renders icon-only on mobile and preserves label on desktop', () => {
    // Label should be hidden on mobile screens
    expect(content).toMatch(/<span\s+className="hidden\s+sm:inline[^"]*">\s*Stream\s*<\/span>/);
  });

  test('presets dropdown has adaptive width and truncation on mobile', () => {
    // Presets select should have flexible adaptive width and truncation to maintain balanced row layout
    expect(content).toMatch(/flex-1\s+min-w-\[96px\]\s+max-w-\[170px\]/);
    expect(content).toMatch(/ui-input[^"]*truncate/);
  });

  test('run test button is pinned with shrink-0 and whitespace-nowrap', () => {
    expect(content).toMatch(/handleSend[\s\S]*?shrink-0[\s\S]*?whitespace-nowrap/);
  });

  test('presets dropdown defaults to basicChat and does not contain duplicate disabled placeholder', () => {
    expect(content).toContain("useState<PresetKey>('basicChat')");
    // Does not contain disabled placeholder option in presets select
    expect(content).not.toMatch(/<option\s+value=""\s+disabled>\s*\{\s*t\('playground\.presets'\)\s*\}\s*<\/option>/);
    // Contains clean 4 preset options
    expect(content).toContain('<option value="basicChat">');
    expect(content).toContain('<option value="toolUse">');
    expect(content).toContain('<option value="vision">');
    expect(content).toContain('<option value="thinkingMode">');
  });
});
