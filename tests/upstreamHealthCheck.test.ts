import config, { updateConfig } from '../config/default';
import upstreamManager, { UpstreamHealthStatus } from '../src/utils/upstreamManager';

describe('UpstreamManager Health Checking and Dead Node Bypass', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.stopHealthCheck();
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.stopHealthCheck();
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('initializes health status list for all configured servers as healthy by default', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    const healthList = upstreamManager.getHealthStatusList();
    expect(healthList).toHaveLength(3);
    expect(healthList[0]).toMatchObject({ serverUrl: 'https://server1.com', serverIndex: 0, isHealthy: true });
    expect(healthList[1]).toMatchObject({ serverUrl: 'https://server2.com', serverIndex: 1, isHealthy: true });
    expect(healthList[2]).toMatchObject({ serverUrl: 'https://server3.com', serverIndex: 2, isHealthy: true });
  });

  it('bypasses offline nodes during per-model round-robin routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com,https://server3.com'
    });

    // Mark server 2 (index 1) as unhealthy/offline
    upstreamManager.setNodeHealth(1, false, 'Connection refused');

    const model = 'gemini-2.5-pro';
    const s1 = upstreamManager.getUpstreamServer({ model });
    expect(s1.serverIndex).toBe(0);

    // Next model call should skip server 2 (index 1) and route to server 3 (index 2)
    const s2 = upstreamManager.getUpstreamServer({ model });
    expect(s2.serverIndex).toBe(2);

    // Wraps around only between healthy nodes (0 and 2)
    const s3 = upstreamManager.getUpstreamServer({ model });
    expect(s3.serverIndex).toBe(0);
  });

  it('bypasses offline nodes during global round-robin routing', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    // Mark server 1 (index 0) as unhealthy
    upstreamManager.setNodeHealth(0, false, 'Timeout');

    const r1 = upstreamManager.getUpstreamServer();
    expect(r1.serverIndex).toBe(1);

    const r2 = upstreamManager.getUpstreamServer();
    expect(r2.serverIndex).toBe(1);
  });

  it('falls back to all configured servers if 100% of servers are unhealthy', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.setNodeHealth(0, false, 'Down');
    upstreamManager.setNodeHealth(1, false, 'Down');

    // Should not throw, should fall back to round-robin across all servers
    const r1 = upstreamManager.getUpstreamServer();
    expect([0, 1]).toContain(r1.serverIndex);
  });

  it('always respects explicit serverIndex even if the node is offline', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    upstreamManager.setNodeHealth(1, false, 'Offline');

    const explicit = upstreamManager.getUpstreamServer({ serverIndex: 1 });
    expect(explicit.serverIndex).toBe(1);
    expect(explicit.serverUrl).toBe('https://server2.com');
  });
});
