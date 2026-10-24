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

describe('UpstreamManager direct mode scheduling', () => {
  const originalServers = config.upstreamServers;

  afterEach(() => {
    config.upstreamServers = originalServers;
    upstreamManager.reset();
  });

  it('returns serverType direct for configured direct server', () => {
    config.upstreamServers = [
      {
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        name: 'Direct Server'
      }
    ];

    const sel = upstreamManager.getUpstreamServer();
    expect(sel.serverType).toBe('direct');
    expect(sel.serverUrl).toBe('https://direct-claude.example.com');
    expect((sel as any).selectedApiKey).toBeUndefined();
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
        url: 'https://direct-claude.example.com',
        weight: 1,
        enabled: true,
        type: 'direct',
        allowedModels: ['claude-sonnet-4-5']
      }
    ];

    const sel = upstreamManager.getUpstreamServer({ model: 'claude-sonnet-4-5' });
    expect(sel.serverType).toBe('direct');
    expect(sel.serverIndex).toBe(1);
    expect(sel.serverUrl).toBe('https://direct-claude.example.com');
  });
});

