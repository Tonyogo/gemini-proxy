import fs from 'fs';
import path from 'path';
import { STANDARD_MODELS } from '../frontend/src/utils/modelHelpers';

describe('Translate View Mobile Optimization & Model Harmonization', () => {
  const translateViewPath = path.resolve(__dirname, '../frontend/src/components/TranslateView.tsx');
  const playgroundPath = path.resolve(__dirname, '../frontend/src/components/PlaygroundView.tsx');
  const concurrentModalPath = path.resolve(__dirname, '../frontend/src/components/ConcurrentTestModal.tsx');

  let translateViewContent: string;
  let playgroundContent: string;
  let concurrentModalContent: string;

  beforeAll(() => {
    translateViewContent = fs.readFileSync(translateViewPath, 'utf-8');
    playgroundContent = fs.readFileSync(playgroundPath, 'utf-8');
    concurrentModalContent = fs.readFileSync(concurrentModalPath, 'utf-8');
  });

  test('STANDARD_MODELS contains strictly 3 models and excludes 3.1', () => {
    expect(STANDARD_MODELS).toEqual([
      'gemini-pro-latest',
      'gemini-flash-latest',
      'gemini-flash-lite-latest'
    ]);
    expect(STANDARD_MODELS).toHaveLength(3);
    expect(STANDARD_MODELS).not.toContain('gemini-3.1-flash-lite');
    expect(STANDARD_MODELS).not.toContain('gemini-2.5-flash');
    expect(STANDARD_MODELS).not.toContain('gemini-2.5-pro');
  });

  test('TranslateView uses STANDARD_MODELS from modelHelpers', () => {
    expect(translateViewContent).toContain("import { STANDARD_MODELS } from '../utils/modelHelpers';");
    expect(translateViewContent).toContain("const [availableModels, setAvailableModels] = useState<string[]>([...STANDARD_MODELS]);");
  });

  test('PlaygroundView uses STANDARD_MODELS from modelHelpers', () => {
    expect(playgroundContent).toContain("import { STANDARD_MODELS } from '../utils/modelHelpers';");
    expect(playgroundContent).toContain("{STANDARD_MODELS.map((model) => (");
  });

  test('ConcurrentTestModal uses STANDARD_MODELS from modelHelpers', () => {
    expect(concurrentModalContent).toContain("import { STANDARD_MODELS } from '../utils/modelHelpers';");
    expect(concurrentModalContent).toContain("{STANDARD_MODELS.map((model) => (");
  });
});


