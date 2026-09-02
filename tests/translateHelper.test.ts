import {
  detectLanguageClient,
  buildTranslationSystemPrompt,
  SUPPORTED_LANGUAGES,
  STYLE_PRESETS
} from '../frontend/src/utils/translateHelper';

describe('translateHelper', () => {
  test('detectLanguageClient identifies Chinese, English, Japanese, and Russian correctly', () => {
    expect(detectLanguageClient('你好世界')).toBe('zh');
    expect(detectLanguageClient('Hello world, this is a test.')).toBe('en');
    expect(detectLanguageClient('こんにちは、元気ですか？')).toBe('ja');
    expect(detectLanguageClient('Привет мир')).toBe('ru');
    expect(detectLanguageClient('')).toBe('en');
  });

  test('buildTranslationSystemPrompt generates strict instructions without conversational filler', () => {
    const prompt = buildTranslationSystemPrompt('zh', 'en', 'technical');
    expect(prompt).toContain('Translate the text from');
    expect(prompt).toContain('Strict Rules:');
    expect(prompt).toContain('Output ONLY the translated text');
    expect(prompt).toContain('Software engineering');
    expect(prompt).toContain('Preserve code syntax');
  });

  test('SUPPORTED_LANGUAGES and STYLE_PRESETS contain expected keys', () => {
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'auto')).toBe(true);
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'zh')).toBe(true);
    expect(SUPPORTED_LANGUAGES.some(l => l.code === 'en')).toBe(true);
    expect(STYLE_PRESETS.some(s => s.id === 'technical')).toBe(true);
    expect(STYLE_PRESETS.some(s => s.id === 'standard')).toBe(true);
  });
});
