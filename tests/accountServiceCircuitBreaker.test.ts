import accountService from '../src/admin/services/accountService';
import upstreamManager from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';
import fetch from 'node-fetch';

jest.mock('node-fetch');
const mockedFetch = fetch as unknown as jest.Mock;

describe('AccountService Circuit Breaker Integration & Instant Recovery', () => {
  const originalUrl = config.geminiBaseUrl;

  beforeEach(async () => {
    upstreamManager.reset();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await updateConfig({ geminiBaseUrl: originalUrl });
    upstreamManager.reset();
  });

  it('records failure in upstreamManager when account request fails with network error or 502', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    mockedFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await accountService.getStatus(1);

    const circuit = upstreamManager.getCircuitStatusList()[1];
    expect(circuit.consecutiveFailures).toBe(1);
    expect(circuit.lastError).toContain('ECONNREFUSED');
  });

  it('isolates node when account service encounters 3 consecutive network failures', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    mockedFetch.mockRejectedValue(new Error('ETIMEDOUT'));

    await accountService.getStatus(0);
    await accountService.getStatus(0);
    await accountService.getStatus(0);

    expect(upstreamManager.isNodeIsolated(0)).toBe(true);
    const circuit = upstreamManager.getCircuitStatusList()[0];
    expect(circuit.consecutiveFailures).toBe(3);
    expect(circuit.isolatedUntil).toBeGreaterThan(Date.now());
  });

  it('immediately clears isolation and resets failures when an account request succeeds', async () => {
    await updateConfig({
      geminiBaseUrl: 'https://server1.com,https://server2.com'
    });

    // Artificially isolate node 1
    upstreamManager.recordRequestResult(1, false, 'Fail 1');
    upstreamManager.recordRequestResult(1, false, 'Fail 2');
    upstreamManager.recordRequestResult(1, false, 'Fail 3');
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    // Mock successful status response
    mockedFetch.mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        forEach: (fn: any) => fn('application/json', 'content-type')
      },
      json: async () => ({ status: { accountDetails: [] } })
    });

    const res = await accountService.getStatus(1);
    expect(res.status).toBe(200);

    // Node 1 should be immediately recovered!
    expect(upstreamManager.isNodeIsolated(1)).toBe(false);
    const circuit = upstreamManager.getCircuitStatusList()[1];
    expect(circuit.consecutiveFailures).toBe(0);
    expect(circuit.isolatedUntil).toBe(0);
    expect(circuit.lastError).toBeUndefined();
  });
});
