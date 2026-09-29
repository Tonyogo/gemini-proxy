import { parseUpstreamServers } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('UpstreamServerConfig type & direct mode parsing', () => {
  it('defaults to proxy type if type is omitted in JSON array', () => {
    const raw: any[] = [
      { url: 'https://proxy1.example.com', weight: 1, enabled: true }
    ];
    const res = parseUpstreamServers(raw);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('proxy');
    expect(res[0].url).toBe('https://proxy1.example.com');
  });

  it('correctly parses direct mode server with apiKeys and default URL', () => {
    const raw: any[] = [
      {
        type: 'direct',
        url: '',
        weight: 3,
        enabled: true,
        name: 'Official Gemini',
        allowedModels: ['gemini-2.5-pro', 'gemini-2.5-flash'],
        apiKeys: ['AIzaSy111', ' AIzaSy222 ', 'AIzaSy111', '']
      }
    ];
    const res = parseUpstreamServers(raw);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('direct');
    expect(res[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(res[0].weight).toBe(3);
    expect(res[0].allowedModels).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(res[0].apiKeys).toEqual(['AIzaSy111', 'AIzaSy222']);
  });

  it('parses direct mode with custom url and hash string format', () => {
    const rawStr = 'https://custom-official.com#type=direct&name=CustomDirect&weight=2&models=gemini-2.5-pro&keys=keyA+keyB';
    const res = parseUpstreamServers(rawStr);
    expect(res).toHaveLength(1);
    expect(res[0].type).toBe('direct');
    expect(res[0].url).toBe('https://custom-official.com');
    expect(res[0].name).toBe('CustomDirect');
    expect(res[0].weight).toBe(2);
    expect(res[0].allowedModels).toEqual(['gemini-2.5-pro']);
    expect(res[0].apiKeys).toEqual(['keyA', 'keyB']);
  });
});

import upstreamManager from '../src/utils/upstreamManager';
import config from '../config/default';

describe('UpstreamManager direct mode scheduling and key distribution', () => {
  const originalServers = config.upstreamServers;

  afterEach(() => {
    config.upstreamServers = originalServers;
  });

  it('returns serverType and distributes configured apiKeys evenly in round-robin', () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server',
        apiKeys: ['key-1', 'key-2', 'key-3']
      }
    ];

    const sel1 = upstreamManager.getUpstreamServer();
    expect(sel1.serverType).toBe('direct');
    expect(sel1.selectedApiKey).toBe('key-1');

    const sel2 = upstreamManager.getUpstreamServer();
    expect(sel2.serverType).toBe('direct');
    expect(sel2.selectedApiKey).toBe('key-2');

    const sel3 = upstreamManager.getUpstreamServer();
    expect(sel3.serverType).toBe('direct');
    expect(sel3.selectedApiKey).toBe('key-3');

    const sel4 = upstreamManager.getUpstreamServer();
    expect(sel4.selectedApiKey).toBe('key-1');
  });

  it('falls back to undefined selectedApiKey if direct server has no apiKeys', () => {
    config.upstreamServers = [
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server Empty Keys'
      }
    ];

    const sel = upstreamManager.getUpstreamServer();
    expect(sel.serverType).toBe('direct');
    expect(sel.selectedApiKey).toBeUndefined();
  });

  it('respects allowedModels filter on direct mode server', () => {
    config.upstreamServers = [
      {
        url: 'https://proxy.example.com',
        weight: 1,
        enabled: true,
        type: 'proxy',
        allowedModels: ['gemini-2.5-flash']
      },
      {
        url: 'https://generativelanguage.googleapis.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        allowedModels: ['gemini-2.5-pro'],
        apiKeys: ['direct-key-pro']
      }
    ];

    // Request for gemini-2.5-pro should ONLY hit the direct server
    const sel = upstreamManager.getUpstreamServer({ model: 'gemini-2.5-pro' });
    expect(sel.serverType).toBe('direct');
    expect(sel.serverIndex).toBe(1);
    expect(sel.selectedApiKey).toBe('direct-key-pro');
  });
});

