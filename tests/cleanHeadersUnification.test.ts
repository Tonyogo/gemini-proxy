import fs from 'fs';
import path from 'path';

describe('Clean Headers Unification & Redundant Title Elimination', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');

  describe('PlaygroundView Header Cleanliness', () => {
    const content = fs.readFileSync(playgroundPath, 'utf-8');

    test('removes redundant big logo, title and subtitle text from inner workbench', () => {
      // Should NOT render h2 with playground.title or p with playground.subtitle
      expect(content).not.toMatch(/<h2[^>]*>\s*\{t\(['"]playground\.title['"]\)\}\s*<\/h2>/);
      expect(content).not.toMatch(/<p[^>]*>\s*\{t\(['"]playground\.subtitle['"]\)\}\s*<\/p>/);
      expect(content).not.toContain("{t('playground.subtitle')}");
      expect(content).not.toContain('v1.0');
    });

    test('preserves all functional controls in the unified workbench bar', () => {
      // Model selector
      expect(content).toContain('selectedModel');
      expect(content).toContain('STANDARD_MODELS');

      // Endpoint selector
      expect(content).toContain('endpointOption');
      expect(content).toContain('customMethod');
      expect(content).toContain('customPath');

      // Stream toggle
      expect(content).toContain('handleToggleStreamInBody');

      // Action buttons
      expect(content).toContain('handleSend');
      expect(content).toContain('handleCopyCurl');
      expect(content).toContain('handleOpenConcurrentModal');
      expect(content).not.toContain('playground.systemKeyActive');
    });
  });
});
