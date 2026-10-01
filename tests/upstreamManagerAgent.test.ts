import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('UpstreamManager Agent Egress Scheduling', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    await updateConfig({}, { resetToEnv: true });
    upstreamManager.reset();
  });

  it('skips direct server with offline agent and selects fallback proxy', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 10,
          enabled: true
        },
        {
          type: 'proxy',
          url: 'https://fallback-proxy.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('proxy');
    expect(selection.serverUrl).toBe('https://fallback-proxy.com');
  });

  it('selects direct server with agent egress when agent is online', async () => {
    const mockWs = { readyState: 1, send: jest.fn() };
    terminalHostManager.registerHost({
      id: 'agent-id-1',
      name: 'remote-hk',
      hostname: 'vps',
      ip: '1.1.1.1',
      platform: 'linux',
      type: 'agent'
    }, mockWs);

    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('direct');
    expect(selection.agentId).toBe('remote-hk');
    expect(selection.serverUrl).toBe('https://generativelanguage.googleapis.com');

    terminalHostManager.unregisterHost('agent-id-1');
  });

  it('does not skip direct server with local egress (no agentId)', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'direct',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('direct');
    expect(selection.agentId).toBeUndefined();
  });
});
