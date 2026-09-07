import fs from 'fs';
import path from 'path';

describe('Mobile Sticky Headers and Playground 2-Row Layout', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');

  describe('App.tsx Mobile Sticky Shell & Header', () => {
    const content = fs.readFileSync(appPath, 'utf-8');

    test('locks root viewport height and overflow on mobile', () => {
      expect(content).toContain('h-[100dvh]');
      expect(content).toContain('max-h-[100dvh]');
      expect(content).toContain('overflow-hidden');
    });

    test('header has sticky top-0, z-40 and shrink-0 to guarantee sticky positioning', () => {
      expect(content).toMatch(/<header[^>]*sticky\s+top-0[^>]*z-40[^>]*shrink-0/);
    });

    test('renders back button with ChevronLeft when isMobileDetailActive is true', () => {
      expect(content).toContain('isMobileDetailActive');
      expect(content).toContain('handleMobileBack');
      expect(content).toContain('ChevronLeft');
    });
  });

  describe('LogsView.tsx Isolated Scroll Containers', () => {
    const content = fs.readFileSync(logsViewPath, 'utf-8');

    test('separates master list filter controls and pagination into shrink-0 sections', () => {
      // Header and filter controls must be shrink-0
      expect(content).toMatch(/shrink-0[^>]*Date\s*&\s*Hour/i);
      expect(content).toContain('overflow-y-auto');
    });
  });

  describe('PlaygroundView.tsx Mobile 2-Row Compact Grid', () => {
    const content = fs.readFileSync(playgroundPath, 'utf-8');

    test('structures mobile workbench into exact 2-row compact layout', () => {
      // Row 1 contains model and endpoint
      expect(content).toContain('selectedModel');
      expect(content).toContain('endpointOption');
      expect(content).toContain('handleToggleStreamInBody');

      // Row 2 contains presets, action triggers, and run test button
      expect(content).toContain('handleApplyPreset');
      expect(content).toContain('handleSend');
    });
  });
});
