import {
  normalizeModelName,
  aggregateModelStats
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

  test('aggregateModelStats should group -high and standard into the same base model', () => {
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
  });
});
