import { calculateUpstreamNodeSummary } from '../frontend/src/utils/upstreamNodeHelpers';

describe('upstreamNodeHelpers.calculateUpstreamNodeSummary', () => {
  it('returns empty array when upstreamServers is empty or undefined', () => {
    expect(calculateUpstreamNodeSummary(undefined, [])).toEqual([]);
    expect(calculateUpstreamNodeSummary([], [])).toEqual([]);
  });

  it('aggregates metrics per node correctly across timeSeries modelNodes', () => {
    const upstreamServers = [
      {
        serverIndex: 0,
        url: 'https://proxy-1.example.com',
        name: 'Node Alpha',
        type: 'proxy',
        weight: 1,
        enabled: true,
        isIsolated: false,
        effectivePercent: 50.0,
      },
      {
        serverIndex: 1,
        url: 'https://generativelanguage.googleapis.com',
        name: 'Direct Gemini',
        type: 'direct',
        weight: 1,
        enabled: true,
        isIsolated: false,
        effectivePercent: 50.0,
        apiKeys: ['key-1', 'key-2'],
      },
    ];

    const timeSeries = [
      {
        time: '2026-10-29 10:00',
        modelNodes: {
          'gemini-pro': {
            '0': { requests: 10, success: 9, error: 1, totalDuration: 9000, durationCount: 9 },
            '1': { requests: 5, success: 5, error: 0, totalDuration: 4000, durationCount: 5 },
          },
        },
      },
      {
        time: '2026-10-29 11:00',
        modelNodes: {
          'gemini-flash': {
            '0': { requests: 20, success: 20, error: 0, totalDuration: 12000, durationCount: 20 },
            '1': { requests: 15, success: 14, error: 1, totalDuration: 6000, durationCount: 14 },
          },
        },
      },
    ];

    const summary = calculateUpstreamNodeSummary(upstreamServers, timeSeries);
    expect(summary).toHaveLength(2);

    // Node 0
    expect(summary[0].name).toBe('Node Alpha');
    expect(summary[0].host).toBe('proxy-1.example.com');
    expect(summary[0].type).toBe('proxy');
    expect(summary[0].requests).toBe(30);
    expect(summary[0].success).toBe(29);
    expect(summary[0].error).toBe(1);
    expect(summary[0].successRate).toBe(96.7);
    expect(summary[0].avgLatency).toBe(Math.round((9000 + 12000) / (9 + 20))); // 724ms

    // Node 1 (Direct)
    expect(summary[1].name).toBe('Direct Gemini');
    expect(summary[1].type).toBe('direct');
    expect(summary[1].keyCount).toBe(2);
    expect(summary[1].requests).toBe(20);
    expect(summary[1].successRate).toBe(95.0);
    expect(summary[1].avgLatency).toBe(Math.round((4000 + 6000) / (5 + 14))); // 526ms
  });

  it('handles zero requests without NaN', () => {
    const upstreamServers = [
      {
        serverIndex: 0,
        url: 'https://proxy-idle.example.com',
        type: 'proxy',
        weight: 1,
        enabled: true,
      },
    ];
    const summary = calculateUpstreamNodeSummary(upstreamServers, []);
    expect(summary[0].requests).toBe(0);
    expect(summary[0].successRate).toBe(100.0);
    expect(summary[0].avgLatency).toBe(0);
  });
});
