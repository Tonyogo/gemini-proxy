import { parseUpstreamServers } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('Per-Upstream Model Config Parser', () => {
  it('parses extended hash parameters with models list separated by + or ,', () => {
    const raw = 'https://s1.example.com#weight=80&models=gemini-2.5-flash+gemini-2.5-pro,https://s2.example.com#weight=20&models=gemini-2.5-flash';
    const servers = parseUpstreamServers(raw);

    expect(servers).toEqual([
      {
        url: 'https://s1.example.com',
        weight: 80,
        enabled: true,
        type: 'proxy',
        allowedModels: ['gemini-2.5-flash', 'gemini-2.5-pro']
      },
      {
        url: 'https://s2.example.com',
        weight: 20,
        enabled: true,
        type: 'proxy',
        allowedModels: ['gemini-2.5-flash']
      }
    ]);
  });

  it('defaults allowedModels to undefined or empty array when not specified (meaning all allowed)', () => {
    const raw = 'https://s1.example.com#weight=50,https://s2.example.com';
    const servers = parseUpstreamServers(raw);

    expect(servers[0].allowedModels).toBeUndefined();
    expect(servers[1].allowedModels).toBeUndefined();
  });

  it('parses JSON array format containing allowedModels', () => {
    const input: UpstreamServerConfig[] = [
      {
        url: 'https://s1.example.com',
        weight: 70,
        enabled: true,
        allowedModels: ['gemini-2.5-pro', 'claude-3-7-sonnet']
      },
      {
        url: 'https://s2.example.com',
        weight: 30,
        enabled: true
      }
    ];
    const servers = parseUpstreamServers(input);

    expect(servers[0].allowedModels).toEqual(['gemini-2.5-pro', 'claude-3-7-sonnet']);
    expect(servers[1].allowedModels).toBeUndefined();
  });

  it('sanitizes and deduplicates model names in allowedModels', () => {
    const input = [
      {
        url: 'https://s1.example.com',
        weight: 10,
        enabled: true,
        allowedModels: [' gemini-2.5-flash ', '', 'gemini-2.5-flash', 'gemini-2.5-pro']
      }
    ];
    const servers = parseUpstreamServers(input);
    expect(servers[0].allowedModels).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro']);
  });
});
