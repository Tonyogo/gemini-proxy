import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Workbench Redesign & Modern Dual-Column Experience', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  let modalContent: string;
  let zhContent: string;
  let enContent: string;

  beforeAll(() => {
    modalContent = fs.readFileSync(modalPath, 'utf-8');
    zhContent = fs.readFileSync(zhPath, 'utf-8');
    enContent = fs.readFileSync(enPath, 'utf-8');
  });

  describe('i18n completeness', () => {
    test('zh and en locales should define all workbench redesign keys', () => {
      const requiredKeys = [
        'expandAll',
        'collapseAll',
        'unsavedChanges',
        'configSynced',
        'revertChanges',
        'confirmRevert',
        'filterMappingsPlaceholder',
        'shortcutSave',
        'nodesBadge',
        'rulesBadge'
      ];
      for (const key of requiredKeys) {
        expect(zhContent).toContain(`${key}:`);
        expect(enContent).toContain(`${key}:`);
      }
    });
  });

  describe('Dual-Column Workbench Layout & Responsive Breakpoints', () => {
    test('modal container should use max-w-5xl and responsive viewport heights', () => {
      expect(modalContent).toContain('max-w-5xl');
      expect(modalContent).toContain('h-[92dvh] sm:h-[86vh]');
    });

    test('should provide desktop vertical sidebar and mobile horizontal pill bar', () => {
      // Desktop sidebar navigation
      expect(modalContent).toContain('hidden sm:flex');
      expect(modalContent).toMatch(/w-56|w-60/);
      // Mobile horizontal pill bar
      expect(modalContent).toContain('sm:hidden');
    });

    test('sidebar tabs should render icon, labels, dynamic counter badges and dirty indicator dot', () => {
      expect(modalContent).toContain("t('config.nodesBadge'");
      expect(modalContent).toContain("t('config.rulesBadge'");
    });
  });

  describe('Upstream Servers Accordion & Smart Cards', () => {
    test('manages expandedServers state with bulk expand and collapse handlers', () => {
      expect(modalContent).toContain('expandedServers');
      expect(modalContent).toContain("t('config.expandAll'");
      expect(modalContent).toContain("t('config.collapseAll'");
    });

    test('node card supports header click toggle with chevron indicator', () => {
      expect(modalContent).toContain('toggleServerExpand');
      expect(modalContent).toMatch(/ChevronDown|ChevronRight/);
    });

    test('collapsed summary preserves node status, weight percentage and mode badge', () => {
      expect(modalContent).toContain('getEffectivePercent');
      expect(modalContent).toContain('server.type');
      expect(modalContent).toContain('role="switch"');
    });
  });

  describe('Dirty Checking & Persistent Sticky Footer Bar', () => {
    test('tracks initial snapshot and calculates dirty state', () => {
      expect(modalContent).toContain('initialConfigRef');
      expect(modalContent).toContain('isDirty');
      expect(modalContent).toContain('dirtyCount');
    });

    test('footer renders sync indicator when clean and unsaved warning when dirty', () => {
      expect(modalContent).toContain("t('config.configSynced'");
      expect(modalContent).toContain("t('config.shortcutSave'");
      expect(modalContent).toContain("t('config.unsavedChanges'");
      expect(modalContent).toContain("t('config.revertChanges'");
    });

    test('supports discard changes to restore initial snapshot', () => {
      expect(modalContent).toContain('handleRevertChanges');
      expect(modalContent).toContain("t('config.confirmRevert'");
    });

    test('registers keyboard shortcuts for Cmd/Ctrl+S save and Esc modal dismissal', () => {
      expect(modalContent).toContain('keydown');
      expect(modalContent).toMatch(/e\.key === 'Escape'|e\.key === 'Esc'/);
      expect(modalContent).toMatch(/\((e\.metaKey \|\| e\.ctrlKey)\) && e\.key\.toLowerCase\(\) === 's'/);
    });
  });

  describe('Model Mapping Search and Filtering', () => {
    test('renders model mapping filter input and filters entries', () => {
      expect(modalContent).toContain("t('config.filterMappingsPlaceholder'");
      expect(modalContent).toContain('mappingSearchQuery');
    });
  });
});
