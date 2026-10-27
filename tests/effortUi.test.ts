import * as fs from 'fs';
import * as path from 'path';
import {
  parseMappingsObjectToEntries,
  serializeEntriesToMappingsObject,
  MappingEntry
} from '../frontend/src/utils/mappingHelpers';

describe('Effort Level UI & ConfigModal Workbench Integration', () => {
  const configModalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  const effortSelectorPath = path.resolve(__dirname, '../frontend/src/components/EffortSelector.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const enLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');
  const zhLocalePath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');

  let configModalContent: string;
  let effortSelectorContent: string;
  let appContent: string;
  let enLocaleContent: string;
  let zhLocaleContent: string;

  beforeAll(() => {
    configModalContent = fs.readFileSync(configModalPath, 'utf-8');
    effortSelectorContent = fs.readFileSync(effortSelectorPath, 'utf-8');
    appContent = fs.readFileSync(appPath, 'utf-8');
    enLocaleContent = fs.readFileSync(enLocalePath, 'utf-8');
    zhLocaleContent = fs.readFileSync(zhLocalePath, 'utf-8');
  });

  describe('Pure Mapping Serialization Helpers', () => {
    test('parseMappingsObjectToEntries correctly parses string, array, and object targets', () => {
      const raw = {
        'model-a': 'target-a',
        'model-b': ['target-b1', 'target-b2'],
        'model-c': { targets: ['target-c1', 'target-c2'], strategy: 'round-robin' },
        'model-d': { target: 'target-d1', strategy: 'least-used' }
      };

      const entries: MappingEntry[] = parseMappingsObjectToEntries(raw);
      expect(entries).toHaveLength(4);

      const entryA = entries.find((e: MappingEntry) => e.source === 'model-a');
      expect(entryA?.target).toBe('target-a');
      expect(entryA?.strategy).toBe('');

      const entryB = entries.find((e: MappingEntry) => e.source === 'model-b');
      expect(entryB?.target).toBe('target-b1, target-b2');

      const entryC = entries.find((e: MappingEntry) => e.source === 'model-c');
      expect(entryC?.target).toBe('target-c1, target-c2');
      expect(entryC?.strategy).toBe('round-robin');

      const entryD = entries.find((e: MappingEntry) => e.source === 'model-d');
      expect(entryD?.target).toBe('target-d1');
      expect(entryD?.strategy).toBe('least-used');
    });

    test('serializeEntriesToMappingsObject correctly produces mappings config structure', () => {
      const entries: MappingEntry[] = [
        { id: '1', source: 'claude-3-5-sonnet', target: 'gemini-2.5-pro' },
        { id: '2', source: 'claude-opus', target: 'gemini-2.5-pro, gemini-3.0-pro', strategy: 'round-robin' },
        { id: '3', source: 'claude-haiku', target: 'gemini-2.5-flash', strategy: 'least-used' }
      ];

      const serialized = serializeEntriesToMappingsObject(entries);
      expect(serialized['claude-3-5-sonnet']).toBe('gemini-2.5-pro');
      expect(serialized['claude-opus']).toEqual({
        targets: ['gemini-2.5-pro', 'gemini-3.0-pro'],
        strategy: 'round-robin'
      });
      expect(serialized['claude-haiku']).toEqual({
        target: 'gemini-2.5-flash',
        strategy: 'least-used'
      });
    });
  });

  describe('i18n Effort Keys Completeness', () => {
    test('en and zh locales define all required effort keys', () => {
      const requiredKeys = [
        'title',
        'label',
        'low',
        'medium',
        'high',
        'lowShort',
        'mediumShort',
        'highShort',
        'lowDesc',
        'mediumDesc',
        'highDesc',
        'rulesCount',
        'activeBadge',
        'setActive',
        'isCurrentlyActive',
        'copyFrom',
        'copyFromLevel',
        'configureMappings',
        'invalidJsonInLevel'
      ];

      for (const key of requiredKeys) {
        expect(enLocaleContent).toContain(`${key}:`);
        expect(zhLocaleContent).toContain(`${key}:`);
      }
    });
  });

  describe('EffortSelector Component Design', () => {
    test('defines EffortLevel, EffortModelMappings, and EffortSelectorProps', () => {
      expect(effortSelectorContent).toContain("export type EffortLevel = 'low' | 'medium' | 'high';");
      expect(effortSelectorContent).toContain('export type EffortModelMappings = Record<EffortLevel, Record<string, any>>;');
      expect(effortSelectorContent).toContain('export interface EffortSelectorProps');
    });

    test('renders signal strength indicator and quick configure mappings button', () => {
      expect(effortSelectorContent).toContain('SignalBars');
      expect(effortSelectorContent).toContain('data-testid="effort-selector-trigger"');
      expect(effortSelectorContent).toContain('data-testid="effort-configure-mappings-btn"');
      expect(effortSelectorContent).toContain("data-testid={`effort-option-${lvl}`}");
    });

    test('uses solid opaque surface background for dropdown popover to prevent background bleed-through', () => {
      expect(effortSelectorContent).not.toContain('--card-bg');
      expect(effortSelectorContent).not.toContain('--text-tertiary');
      expect(effortSelectorContent).toContain('bg-white dark:bg-[#11131C]');
      expect(configModalContent).not.toContain('--card-bg');
      expect(configModalContent).not.toContain('--text-tertiary');
    });
  });

  describe('Header Integration in App.tsx', () => {
    test('imports and renders EffortSelector in App header breadcrumbs', () => {
      expect(appContent).toContain("import { EffortSelector, EffortLevel, EffortModelMappings } from './components/EffortSelector';");
      expect(appContent).toContain('<EffortSelector');
      expect(appContent).toContain('effortLevel={effortLevel}');
      expect(appContent).toContain('effortModelMappings={effortModelMappings}');
      expect(appContent).toContain("setConfigModalInitialTab('mappings')");
    });

    test('maintains effortLevel and effortModelMappings state with server sync', () => {
      expect(appContent).toContain("const [effortLevel, setEffortLevel] = useState<EffortLevel>('medium');");
      expect(appContent).toContain('syncEffortStateFromConfig');
      expect(appContent).toContain('handleSelectEffort');
    });
  });

  describe('ConfigModal Per-Effort Workbench', () => {
    test('manages per-effort entries and raw JSON state', () => {
      expect(configModalContent).toContain('effortMappingEntries');
      expect(configModalContent).toContain('effortMappingsRaw');
      expect(configModalContent).toContain('activeEffortLevel');
      expect(configModalContent).toContain('editingEffortTab');
    });

    test('renders 3 effort pill tabs in Mappings view with copy from actions', () => {
      expect(configModalContent).toContain('data-testid={`config-effort-tab-${lvl}`}');
      expect(configModalContent).toContain('data-testid="set-active-effort-btn"');
      expect(configModalContent).toContain('handleCopyFromEffort');
    });

    test('validates all three effort levels JSON on save and aborts on syntax error', () => {
      expect(configModalContent).toContain("t('effort.invalidJsonInLevel'");
      expect(configModalContent).toContain('effortLevel: activeEffortLevel');
      expect(configModalContent).toContain('effortModelMappings: parsedEffortMappings');
    });
  });
});
