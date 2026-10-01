import { parseUpstreamServers } from '../config/default';

describe('parseUpstreamServers - direct mode with agentId egress', () => {
  it('correctly parses direct upstream with agentId egress channel', () => {
    const raw = [
      {
        type: 'direct',
        agentId: 'hk-vps-node',
        url: 'https://generativelanguage.googleapis.com',
        weight: 3,
        enabled: true,
        name: 'HK Agent Direct Node',
        apiKeys: ['key-1', 'key-2']
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('direct');
    expect(servers[0].agentId).toBe('hk-vps-node');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].weight).toBe(3);
    expect(servers[0].apiKeys).toEqual(['key-1', 'key-2']);
  });

  it('correctly parses direct upstream with local egress (no agentId)', () => {
    const raw = [
      {
        type: 'direct',
        name: 'Local Direct Node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('direct');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].agentId).toBeUndefined();
  });

  it('does not recognize type: agent, defaults to proxy', () => {
    const raw = [
      {
        type: 'agent',
        agentId: 'some-agent',
        url: 'https://custom-proxy.com'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers[0].type).toBe('proxy');
    expect(servers[0].agentId).toBeUndefined();
  });
});
