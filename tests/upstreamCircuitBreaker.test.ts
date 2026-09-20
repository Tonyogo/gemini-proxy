import config, { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';

describe('UpstreamManager Passive Circuit Breaker (3 failures / 180s isolation)', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('initializes all nodes with 0 failures and not isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    const statusList = upstreamManager.getCircuitStatusList();
    expect(statusList).toHaveLength(2);
    expect(statusList[0]).toMatchObject({ serverIndex: 0, consecutiveFailures: 0, isolatedUntil: 0 });
    expect(statusList[1]).toMatchObject({ serverIndex: 1, consecutiveFailures: 0, isolatedUntil: 0 });
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);
  });

  it('does not isolate node after 1 or 2 failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.recordRequestResult(0, false, 'ECONNREFUSED');
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);

    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);

    const status = upstreamManager.getCircuitStatusList()[0];
    expect(status.consecutiveFailures).toBe(2);
    expect(status.isolatedUntil).toBe(0);
  });

  it('resets consecutive failures to 0 on success', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    upstreamManager.recordRequestResult(0, false, 'ETIMEDOUT');
    expect(upstreamManager.getCircuitStatusList()[0].consecutiveFailures).toBe(2);

    upstreamManager.recordRequestResult(0, true);
    expect(upstreamManager.getCircuitStatusList()[0].consecutiveFailures).toBe(0);
    expect(upstreamManager.isNodeIsolated(0)).toBe(false);
  });

  it('isolates node for 180 seconds upon reaching 3 consecutive failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    const before = Date.now();
    upstreamManager.recordRequestResult(1, false, '502 Bad Gateway');
    upstreamManager.recordRequestResult(1, false, '503 Service Unavailable');
    upstreamManager.recordRequestResult(1, false, 'ECONNREFUSED');

    expect(upstreamManager.isNodeIsolated(1)).toBe(true);
    const status = upstreamManager.getCircuitStatusList()[1];
    expect(status.consecutiveFailures).toBe(3);
    expect(status.isolatedUntil).toBeGreaterThanOrEqual(before + 179_000);
    expect(status.isolatedUntil).toBeLessThanOrEqual(before + 181_000);
  });

  it('bypasses isolated nodes during round-robin model routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    // Isolate server 2 (index 1) with 3 failures
    upstreamManager.recordRequestResult(1, false, 'Down');
    upstreamManager.recordRequestResult(1, false, 'Down');
    upstreamManager.recordRequestResult(1, false, 'Down');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    const model = 'gemini-2.5-pro';
    const s1 = upstreamManager.getUpstreamServer({ model });
    expect(s1.serverIndex).toBe(0);

    // Skips index 1, goes straight to index 2
    const s2 = upstreamManager.getUpstreamServer({ model });
    expect(s2.serverIndex).toBe(2);

    // Wraps around to index 0
    const s3 = upstreamManager.getUpstreamServer({ model });
    expect(s3.serverIndex).toBe(0);
  });

  it('falls back to full cluster if 100% of nodes are isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(0, false, 'Fail');
    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(1, false, 'Fail');

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    // Does not crash, falls back to full cluster
    const s = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(s.serverIndex);
  });

  it('always honors explicit serverIndex even if isolated', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    for (let i = 0; i < 3; i++) upstreamManager.recordRequestResult(1, false, 'Fail');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    const s = upstreamManager.getUpstreamServer({ serverIndex: 1 });
    expect(s.serverIndex).toBe(1);
    expect(s.serverUrl).toBe('https://server2.com');
  });
});
