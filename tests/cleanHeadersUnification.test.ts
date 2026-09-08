import fs from 'fs';
import path from 'path';

describe('Clean Headers Unification & Redundant Title Elimination', () => {
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  const webTerminalPath = path.resolve(__dirname, '../frontend/src/components/WebTerminalView.tsx');
  const terminalLogsPath = path.resolve(__dirname, '../frontend/src/components/TerminalLogsView.tsx');

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

  describe('WebTerminalView Header Cleanliness', () => {
    const content = fs.readFileSync(webTerminalPath, 'utf-8');

    test('removes duplicate static title text webTerminal.title from top window bar', () => {
      expect(content).not.toContain("{t('webTerminal.title')}");
    });

    test('preserves TerminalHostSelector and window action buttons', () => {
      expect(content).toContain('<TerminalHostSelector');
      expect(content).toContain('handleFullscreenToggle');
      expect(content).toContain('handleResetSession');
    });
  });

  describe('TerminalLogsView Header Cleanliness', () => {
    const content = fs.readFileSync(terminalLogsPath, 'utf-8');

    test('removes duplicate static title text terminal.title from window toolbar', () => {
      expect(content).not.toContain("{t('terminal.title')}");
    });

    test('preserves interactive tab toggle and log filters', () => {
      expect(content).toContain("t('terminal.interactiveTab')");
      expect(content).toContain("t('terminal.logsTab')");
      expect(content).toContain('levelFilter');
    });
  });
});
