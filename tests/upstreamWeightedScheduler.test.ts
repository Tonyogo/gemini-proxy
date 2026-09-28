import { upstreamManager } from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';

describe('UpstreamManager Smooth Weighted Round-Robin (SWRR)', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  it('distributes requests matching configured 4:1 (80% vs 20%) ratio smoothly', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 80, enabled: true },
        { url: 'https://s2.example.com', weight: 20, enabled: true }
      ]
    });

    const sequence: number[] = [];
    for (let i = 0; i < 5; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'test-model' });
      sequence.push(sel.serverIndex);
    }
    // SWRR for 4:1 generates A, A, A, B, A (smooth distribution)
    expect(sequence).toEqual([0, 0, 0, 1, 0]);

    // Aggregate over 100 requests
    const counts = { 0: 0, 1: 0 };
    for (let i = 0; i < 95; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'test-model' });
      counts[sel.serverIndex as 0 | 1]++;
    }
    // 5 + 95 = 100 requests total
    counts[0] += 4;
    counts[1] += 1;
    expect(counts[0]).toBe(80);
    expect(counts[1]).toBe(20);
  });

  it('completely excludes disabled nodes and normalizes active nodes to 100%', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 60, enabled: true },
        { url: 'https://s2.example.com', weight: 40, enabled: false }
      ]
    });

    const statusList = upstreamManager.getUpstreamServerStatusList();
    expect(statusList[0].effectivePercent).toBe(100);
    expect(statusList[1].effectivePercent).toBe(0);

    for (let i = 0; i < 10; i++) {
      const sel = upstreamManager.getUpstreamServer();
      expect(sel.serverIndex).toBe(0);
      expect(sel.serverUrl).toBe('https://s1.example.com');
    }
  });

  it('transfers 100% traffic to healthy nodes when a node is isolated by circuit breaker', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 50, enabled: true },
        { url: 'https://s2.example.com', weight: 50, enabled: true }
      ]
    });

    // Node 0 fails 3 times
    upstreamManager.recordRequestResult(0, false, '500 Error');
    upstreamManager.recordRequestResult(0, false, '500 Error');
    upstreamManager.recordRequestResult(0, false, '500 Error');

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);

    const statusList = upstreamManager.getUpstreamServerStatusList();
    expect(statusList[0].isIsolated).toBe(true);
    expect(statusList[0].effectivePercent).toBe(0);
    expect(statusList[1].effectivePercent).toBe(100);

    for (let i = 0; i < 5; i++) {
      const sel = upstreamManager.getUpstreamServer();
      expect(sel.serverIndex).toBe(1);
    }
  });

  it('falls back safely when all nodes are disabled to prevent complete service denial', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 50, enabled: false },
        { url: 'https://s2.example.com', weight: 50, enabled: false }
      ]
    });

    // Should not throw and should still route
    const sel = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(sel.serverIndex);
  });
});
