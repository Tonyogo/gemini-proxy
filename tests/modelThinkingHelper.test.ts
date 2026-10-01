import { parseModelThinkingSuffix, applyThinkingConfigHigh } from '../src/utils/modelThinkingHelper';

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
});
