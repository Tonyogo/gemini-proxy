import {
  parseModelThinkingSuffix,
  applyThinkingConfigHigh,
  applyThinkingConfigMedium,
  hasGeminiExplicitThinking,
  hasClaudeExplicitThinking
} from '../src/utils/modelThinkingHelper';

describe('modelThinkingHelper', () => {
  it('parses normal models without high suffix', () => {
    const res = parseModelThinkingSuffix('gemini-2.5-flash');
    expect(res).toEqual({
      baseModel: 'gemini-2.5-flash',
      isHigh: false
    });
  });

  it('parses models with -high suffix (case-insensitive and trimmed)', () => {
    const res1 = parseModelThinkingSuffix('gemini-2.5-flash-high');
    expect(res1).toEqual({
      baseModel: 'gemini-2.5-flash',
      isHigh: true,
      thinkingLevel: 'HIGH'
    });

    const res2 = parseModelThinkingSuffix('gemini-3-pro-HIGH ');
    expect(res2).toEqual({
      baseModel: 'gemini-3-pro',
      isHigh: true,
      thinkingLevel: 'HIGH'
    });
  });

  it('handles empty, undefined, or malformed models gracefully', () => {
    expect(parseModelThinkingSuffix('')).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix(undefined)).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix('  ')).toEqual({ baseModel: '', isHigh: false });
    expect(parseModelThinkingSuffix('-high')).toEqual({ baseModel: '', isHigh: true, thinkingLevel: 'HIGH' });
  });

  it('injects thinkingLevel: HIGH and strips includeThoughts while preserving other properties', () => {
    const config1 = applyThinkingConfigHigh({});
    expect(config1.thinkingConfig).toEqual({ thinkingLevel: 'HIGH' });
    expect(config1.thinkingConfig.includeThoughts).toBeUndefined();

    const config2 = applyThinkingConfigHigh({
      thinkingConfig: {
        includeThoughts: true,
        customProperty: 'keep-me'
      }
    });
    expect(config2.thinkingConfig).toEqual({
      customProperty: 'keep-me',
      thinkingLevel: 'HIGH'
    });
    expect(config2.thinkingConfig.includeThoughts).toBeUndefined();
  });

  it('injects thinkingLevel: MEDIUM and strips includeThoughts while preserving other properties', () => {
    const config1 = applyThinkingConfigMedium({});
    expect(config1.thinkingConfig).toEqual({ thinkingLevel: 'MEDIUM' });
    expect(config1.thinkingConfig.includeThoughts).toBeUndefined();

    const config2 = applyThinkingConfigMedium({
      thinkingConfig: {
        includeThoughts: true,
        customProperty: 'preserve-medium'
      }
    });
    expect(config2.thinkingConfig).toEqual({
      customProperty: 'preserve-medium',
      thinkingLevel: 'MEDIUM'
    });
    expect(config2.thinkingConfig.includeThoughts).toBeUndefined();
  });

  it('correctly detects explicit thinking in Gemini requests with hasGeminiExplicitThinking', () => {
    expect(hasGeminiExplicitThinking(undefined)).toBe(false);
    expect(hasGeminiExplicitThinking({})).toBe(false);
    expect(hasGeminiExplicitThinking({ temperature: 0.7 })).toBe(false);
    expect(hasGeminiExplicitThinking({ thinkingConfig: undefined })).toBe(false);
    expect(hasGeminiExplicitThinking({ thinkingConfig: {} })).toBe(true);
    expect(hasGeminiExplicitThinking({ thinkingConfig: { thinkingBudget: 0 } })).toBe(true);
    expect(hasGeminiExplicitThinking({ thinkingConfig: { thinkingLevel: 'LOW' } })).toBe(true);
  });

  it('correctly detects explicit thinking in Claude requests with hasClaudeExplicitThinking', () => {
    expect(hasClaudeExplicitThinking(undefined)).toBe(false);
    expect(hasClaudeExplicitThinking({})).toBe(false);
    expect(hasClaudeExplicitThinking({ model: 'claude-3-7-sonnet' })).toBe(false);
    expect(hasClaudeExplicitThinking({ thinking: { type: 'enabled', budget_tokens: 1024 } })).toBe(true);
    expect(hasClaudeExplicitThinking({ thinking: { type: 'disabled' } })).toBe(true);
    expect(hasClaudeExplicitThinking({ output_config: {} })).toBe(false);
    expect(hasClaudeExplicitThinking({ output_config: { effort: 'low' } })).toBe(true);
    expect(hasClaudeExplicitThinking({ output_config: { effort: 'medium' } })).toBe(true);
    expect(hasClaudeExplicitThinking({ output_config: { effort: 'high' } })).toBe(true);
  });
});
