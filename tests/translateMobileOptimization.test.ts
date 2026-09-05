import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('Translate View Mobile Optimization & Model Harmonization', () => {
  const translateViewPath = path.resolve(__dirname, '../frontend/src/components/TranslateView.tsx');
  let translateViewContent: string;

  beforeAll(() => {
    translateViewContent = fs.readFileSync(translateViewPath, 'utf-8');
  });

  test('TRANSLATE_MODELS contains strictly the 4 models consistent with Playground', () => {
    const match = translateViewContent.match(/export const TRANSLATE_MODELS\s*=\s*\[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    const models = match![1]
      .split('\n')
      .map(line => line.trim().replace(/['",]/g, ''))
      .filter(Boolean);

    expect(models).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-pro-latest',
      'gemini-flash-latest',
      'gemini-flash-lite-latest'
    ]);
    expect(models).toHaveLength(4);
    expect(models).not.toContain('gemini-2.5-flash');
    expect(models).not.toContain('gemini-2.5-pro');
  });

  test('does not fetch or merge dynamic models from /api/admin/models', () => {
    expect(translateViewContent).not.toContain('/api/admin/models');
  });

  test('defaults to gemini-3.1-flash-lite and sanitizes legacy localStorage values', () => {
    expect(translateViewContent).toContain("if (saved && TRANSLATE_MODELS.includes(saved))");
    expect(translateViewContent).toContain("return 'gemini-3.1-flash-lite'");
    expect(translateViewContent).toContain("return ['gemini-3.1-flash-lite', 'gemini-flash-latest']");
  });

  test('handles mobile segmented tab switching with automatic switch on translate', () => {
    // State declaration
    expect(translateViewContent).toContain("const [mobileActiveTab, setMobileActiveTab] = useState<'source' | 'target'>('source');");

    // Automatic tab switch on handleTranslate
    expect(translateViewContent).toContain("setMobileActiveTab('target');");

    // Mobile tabs bar rendered with lg:hidden
    expect(translateViewContent).toContain("className=\"flex lg:hidden items-center justify-between");
    expect(translateViewContent).toContain("onClick={() => setMobileActiveTab('source')}");
    expect(translateViewContent).toContain("onClick={() => setMobileActiveTab('target')}");
  });

  test('panels toggle visibility responsively based on mobileActiveTab', () => {
    // Source Panel visibility
    expect(translateViewContent).toContain("mobileActiveTab === 'source' ? 'flex' : 'hidden lg:flex'");

    // Target Panel visibility
    expect(translateViewContent).toContain("mobileActiveTab === 'target' ? 'flex' : 'hidden lg:flex'");
  });

  test('header has responsive layout for mobile dual-row and desktop single-row', () => {
    // Header container
    expect(translateViewContent).toContain("flex flex-col lg:flex-row lg:items-center lg:justify-between");

    // Action button rendered for both mobile (< lg) and desktop (hidden on mobile, visible on lg)
    expect(translateViewContent).toContain("renderActionButton(true)");
    expect(translateViewContent).toContain("renderActionButton(false)");
    expect(translateViewContent).toContain("className=\"lg:hidden shrink-0\"");
    expect(translateViewContent).toContain("className=\"hidden lg:block shrink-0\"");
  });

  test('i18n locale dictionary contains sourceTab and targetTab keys', () => {
    expect((zh.translate as any).sourceTab).toBe('原文');
    expect((zh.translate as any).targetTab).toBe('译文');

    expect((en.translate as any).sourceTab).toBe('Source');
    expect((en.translate as any).targetTab).toBe('Translation');
  });

  test('simplifies singleModel, compareModels, and style selector button text', () => {
    // Mode toggle text is ultra-compact
    expect((zh.translate as any).singleModel).toBe('单模');
    expect((zh.translate as any).compareModels).toBe('对比');
    expect((en.translate as any).singleModel).toBe('Single');
    expect((en.translate as any).compareModels).toBe('Compare');

    // Style selector button uses shortName
    expect(translateViewContent).toContain('currentStyleObj.shortName || currentStyleObj.name');

    // Single model trigger strips gemini- on small screens
    expect(translateViewContent).toContain("selectedSingleModel.replace('gemini-', '')");
  });
});
