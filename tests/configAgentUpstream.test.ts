import { parseUpstreamServers } from '../config/default';

describe('parseUpstreamServers - agent type', () => {
  it('correctly parses an agent upstream config item', () => {
    const raw = [
      {
        type: 'agent',
        agentId: 'hk-vps-node',
        url: 'https://generativelanguage.googleapis.com',
        weight: 3,
        enabled: true,
        name: 'HK Agent Node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('agent');
    expect(servers[0].agentId).toBe('hk-vps-node');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].weight).toBe(3);
  });

  it('defaults url to official Gemini endpoint if url is omitted for agent type', () => {
    const raw = [
      {
        type: 'agent',
        agentId: 'us-node'
      }
    ];
    const servers = parseUpstreamServers(raw);
    expect(servers).toHaveLength(1);
    expect(servers[0].type).toBe('agent');
    expect(servers[0].url).toBe('https://generativelanguage.googleapis.com');
    expect(servers[0].agentId).toBe('us-node');
  });

  it('rejects agent upstream without agentId', () => {
    const raw = [
      {
        type: 'agent',
        url: 'https://generativelanguage.googleapis.com'
      }
    ];
    const servers = parseUpstreamServers(raw);
    // Should fallback to default because agent item without agentId is invalid
    expect(servers[0].type).not.toBe('agent');
  });
});
