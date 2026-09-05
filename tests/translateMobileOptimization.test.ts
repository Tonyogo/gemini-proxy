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

  test('DEFAULT_MODELS contains strictly the 4 models consistent with Playground', () => {
    const match = translateViewContent.match(/const DEFAULT_MODELS\s*=\s*\[([\s\S]*?)\];/);
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

  test('supports single model and compare models configuration', () => {
    expect(translateViewContent).toContain("DEFAULT_MODELS = [");
    expect(translateViewContent).toContain("'gemini-3.1-flash-lite'");
  });
});

