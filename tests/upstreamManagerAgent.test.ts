import { updateConfig } from '../config/default';
import upstreamManager from '../src/utils/upstreamManager';
import { terminalHostManager } from '../src/terminal/services/terminalHostManager';

describe('UpstreamManager Agent Scheduling', () => {
  beforeEach(async () => {
    upstreamManager.reset();
  });

  afterEach(async () => {
    upstreamManager.reset();
  });

  it('skips agent server if agent is offline and selects fallback proxy', async () => {
    await updateConfig({
      upstreamServers: [
        {
          type: 'agent',
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

    // remote-hk is offline
    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('proxy');
    expect(selection.serverUrl).toBe('https://fallback-proxy.com');
  });

  it('selects agent server when agent is online', async () => {
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
          type: 'agent',
          agentId: 'remote-hk',
          url: 'https://generativelanguage.googleapis.com',
          weight: 1,
          enabled: true
        }
      ]
    });

    const selection = upstreamManager.getUpstreamUrl('v1beta/models/gemini-2.5-pro:generateContent');
    expect(selection.serverType).toBe('agent');
    expect(selection.agentId).toBe('remote-hk');
    expect(selection.serverUrl).toBe('https://generativelanguage.googleapis.com');

    terminalHostManager.unregisterHost('agent-id-1');
  });
});
