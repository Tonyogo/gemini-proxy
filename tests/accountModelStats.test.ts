import { calculateServerModelStats, getAccountTopModels, AccountDetail } from '../frontend/src/utils/accountModelStats';

describe('accountModelStats utility', () => {
  it('aggregates server model statistics across multiple accounts accurately', () => {
    const mockAccounts: AccountDetail[] = [
      {
        index: 0,
        name: 'acc1@gmail.com',
        status: 'active',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: true,
        hasContext: true,
        canonicalIndex: null,
        usage: {
          totalRequests: 100,
          totalSuccess: 90,
          totalError: 10,
          byModel: {
            'gemini-2.5-flash': { requests: 80, success: 75, error: 5 },
            'gemini-2.5-pro': { requests: 20, success: 15, error: 5 }
          }
        }
      },
      {
        index: 1,
        name: 'acc2@gmail.com',
        status: 'active',
        isDisabled: false,
        isInvalid: false,
        isDuplicate: false,
        isExpired: false,
        isRotation: true,
        hasContext: false,
        canonicalIndex: null,
        usage: {
          totalRequests: 50,
          totalSuccess: 50,
          totalError: 0,
          byModel: {
            'gemini-2.5-flash': { requests: 20, success: 20, error: 0 },
            'claude-3-7-sonnet': { requests: 30, success: 30, error: 0 }
          }
        }
      }
    ];

    const stats = calculateServerModelStats(mockAccounts);

    expect(stats.totalRequests).toBe(150);
    expect(stats.totalSuccess).toBe(140);
    expect(stats.totalError).toBe(10);
    expect(stats.successRate).toBe(93.3);

    // Verify models breakdown sorted by request count descending
    expect(stats.models).toHaveLength(3);
    expect(stats.models[0].model).toBe('gemini-2.5-flash');
    expect(stats.models[0].requests).toBe(100);
    expect(stats.models[0].sharePercent).toBe(66.7);

    expect(stats.models[1].model).toBe('claude-3-7-sonnet');
    expect(stats.models[1].requests).toBe(30);

    expect(stats.models[2].model).toBe('gemini-2.5-pro');
    expect(stats.models[2].requests).toBe(20);
  });

  it('handles empty accounts list or accounts with no usage data without NaN', () => {
    const stats = calculateServerModelStats([]);
    expect(stats.totalRequests).toBe(0);
    expect(stats.totalSuccess).toBe(0);
    expect(stats.totalError).toBe(0);
    expect(stats.successRate).toBe(100);
    expect(stats.models).toEqual([]);
  });

  it('extracts top models for an account correctly', () => {
    const usage = {
      byModel: {
        'gemini-2.5-flash': { requests: 100 },
        'gemini-2.5-pro': { requests: 20 },
        'claude-3-7-sonnet': { requests: 50 }
      }
    };
    const top2 = getAccountTopModels(usage, 2);
    expect(top2).toEqual([
      { model: 'gemini-2.5-flash', count: 100 },
      { model: 'claude-3-7-sonnet', count: 50 }
    ]);
  });
});
