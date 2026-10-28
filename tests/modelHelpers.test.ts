import {
  normalizeModelName,
  aggregateModelStats,
  detectModelFamily
} from '../frontend/src/utils/modelHelpers';

describe('Model Normalization & Aggregation Helpers', () => {
  test('normalizeModelName should strip -high suffix and flag isHigh', () => {
    expect(normalizeModelName('gemini-3.8-flash-high')).toEqual({
      baseModel: 'gemini-3.8-flash',
      isHigh: true
    });
    expect(normalizeModelName('gemini-3.8-flash')).toEqual({
      baseModel: 'gemini-3.8-flash',
      isHigh: false
    });
    expect(normalizeModelName('claude-3-5-sonnet-20241022')).toEqual({
      baseModel: 'claude-3-5-sonnet-20241022',
      isHigh: false
    });
  });

  test('detectModelFamily identifies families correctly', () => {
    expect(detectModelFamily('gemini-2.5-pro').label).toBe('Gemini');
    expect(detectModelFamily('claude-3-7-sonnet').label).toBe('Claude');
    expect(detectModelFamily('gpt-4o').label).toBe('OpenAI');
    expect(detectModelFamily('o1-mini').label).toBe('OpenAI');
    expect(detectModelFamily('o3-mini').label).toBe('OpenAI');
    expect(detectModelFamily('deepseek-v3').label).toBe('DeepSeek');
    expect(detectModelFamily('qwen-2.5-72b').label).toBe('Qwen');
    expect(detectModelFamily('llama-3.3-70b').label).toBe('Llama');
    expect(detectModelFamily('unknown-model').label).toBe('LLM');
    expect(detectModelFamily('').label).toBe('LLM');
  });

  test('aggregateModelStats should group -high and standard into the same base model and compute highAvgLatency', () => {
    const mockTimeSeries = [
      {
        time: '12:00',
        total: 15,
        models: {
          'gemini-3.8-flash': 10,
          'gemini-3.8-flash-high': 5
        },
        modelDurations: {
          'gemini-3.8-flash': 500,
          'gemini-3.8-flash-high': 800
        }
      }
    ];

    const result = aggregateModelStats(mockTimeSeries);
    expect(result.totalRequests).toBe(15);
    expect(result.list.length).toBe(1);

    const flash = result.list[0];
    expect(flash.model).toBe('gemini-3.8-flash');
    expect(flash.requests).toBe(15);
    expect(flash.standardRequests).toBe(10);
    expect(flash.highRequests).toBe(5);
    expect(flash.percentage).toBe(100);
    expect(flash.avgLatency).toBe(650);
    expect(flash.highAvgLatency).toBe(800);
  });

  test('aggregateModelStats should set highAvgLatency to 0 when no high durations exist', () => {
    const mockTimeSeries = [
      {
        time: '12:00',
        total: 10,
        models: {
          'claude-3-5-sonnet': 10
        },
        modelDurations: {
          'claude-3-5-sonnet': 1200
        }
      }
    ];

    const result = aggregateModelStats(mockTimeSeries);
    expect(result.list[0].highAvgLatency).toBe(0);
    expect(result.list[0].avgLatency).toBe(1200);
  });
});
