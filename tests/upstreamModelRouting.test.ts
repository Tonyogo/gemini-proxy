import { upstreamManager } from '../src/utils/upstreamManager';
import config, { updateConfig } from '../config/default';

describe('UpstreamManager Model-Aware SWRR Routing', () => {
  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
    upstreamManager.reset();
  });

  beforeEach(async () => {
    upstreamManager.reset();
  });

  it('identifies whether a server supports a model correctly', () => {
    const unrestrictedServer = { url: 'https://s1.example.com', weight: 1, enabled: true };
    expect(upstreamManager.serverSupportsModel(unrestrictedServer, 'gemini-2.5-pro')).toBe(true);

    const restrictedServer = {
      url: 'https://s2.example.com',
      weight: 1,
      enabled: true,
      allowedModels: ['gemini-2.5-flash', 'claude-3-7-sonnet']
    };
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'gemini-2.5-flash')).toBe(true);
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'GEMINI-2.5-FLASH')).toBe(true);
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'gemini-2.5-pro')).toBe(false);

    // Dual-direction matching: client model or mapped target model
    expect(upstreamManager.serverSupportsModel(restrictedServer, 'claude-3-7-sonnet', 'gemini-2.5-pro')).toBe(true);
  });

  it('determines if any upstream server supports the model', async () => {
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 1, enabled: true, allowedModels: ['gemini-2.5-flash'] },
        { url: 'https://s2.example.com', weight: 1, enabled: false, allowedModels: ['gemini-2.5-pro'] }
      ]
    });

    expect(upstreamManager.hasUpstreamForModel('gemini-2.5-flash')).toBe(true);
    // s2 is disabled, so gemini-2.5-pro has no active upstream
    expect(upstreamManager.hasUpstreamForModel('gemini-2.5-pro')).toBe(false);
    expect(upstreamManager.hasUpstreamForModel('unknown-model')).toBe(false);
  });

  it('routes traffic strictly to servers supporting the requested model', async () => {
    // S1: weight 80, unrestricted (supports all)
    // S2: weight 20, restricted to flash
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 80, enabled: true },
        { url: 'https://s2.example.com', weight: 20, enabled: true, allowedModels: ['gemini-2.5-flash'] }
      ]
    });

    // Requesting 'gemini-2.5-pro': ONLY S1 can serve it
    for (let i = 0; i < 20; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-pro' });
      expect(sel.serverIndex).toBe(0);
      expect(sel.serverUrl).toBe('https://s1.example.com');
    }

    // Requesting 'gemini-2.5-flash': Both S1 and S2 can serve it with 80% vs 20%
    const counts = { 0: 0, 1: 0 };
    for (let i = 0; i < 100; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-flash' });
      counts[sel.serverIndex as 0 | 1]++;
    }
    expect(counts[0]).toBe(80);
    expect(counts[1]).toBe(20);
  });

  it('falls back strictly within model-supporting servers when isolated', async () => {
    // S1: weight 50, restricted to pro
    // S2: weight 50, restricted to pro
    // S3: weight 100, restricted to flash
    await updateConfig({
      upstreamServers: [
        { url: 'https://s1.example.com', weight: 50, enabled: true, allowedModels: ['gemini-2.5-pro'] },
        { url: 'https://s2.example.com', weight: 50, enabled: true, allowedModels: ['gemini-2.5-pro'] },
        { url: 'https://s3.example.com', weight: 100, enabled: true, allowedModels: ['gemini-2.5-flash'] }
      ]
    });

    // Isolate both S1 and S2 (consecutive failures)
    for (let i = 0; i < 3; i++) {
      upstreamManager.recordRequestResult(0, false, 'error');
      upstreamManager.recordRequestResult(1, false, 'error');
    }
    expect(upstreamManager.isNodeIsolated(0)).toBe(true);
    expect(upstreamManager.isNodeIsolated(1)).toBe(true);

    // Requesting gemini-2.5-pro: all pro servers isolated. Must fall back to S1/S2, NEVER S3!
    for (let i = 0; i < 10; i++) {
      const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-pro' });
      expect([0, 1]).toContain(sel.serverIndex);
      expect(sel.serverIndex).not.toBe(2);
    }
  });
});
