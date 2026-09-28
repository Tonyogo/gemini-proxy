import { parseUpstreamServers, normalizeBaseUrls, config, updateConfig } from '../config/default';
import { UpstreamServerConfig } from '../src/types';

describe('Upstream Config Parser', () => {
  it('parses legacy comma-separated urls with default weight and enabled status', () => {
    const raw = 'https://s1.example.com, https://s2.example.com/';
    const servers = parseUpstreamServers(raw);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 1, enabled: true },
      { url: 'https://s2.example.com', weight: 1, enabled: true }
    ]);
  });

  it('parses extended hash parameters including weight, percent, disabled, and name', () => {
    const raw = 'https://s1.example.com#weight=80&name=MainHK,https://s2.example.com#percent=20&name=BackupUS,https://s3.example.com#disabled';
    const servers = parseUpstreamServers(raw);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 80, enabled: true, name: 'MainHK' },
      { url: 'https://s2.example.com', weight: 20, enabled: true, name: 'BackupUS' },
      { url: 'https://s3.example.com', weight: 1, enabled: false }
    ]);
  });

  it('parses JSON array format properly', () => {
    const input: UpstreamServerConfig[] = [
      { url: 'https://s1.example.com', weight: 75, enabled: true, name: 'Primary' },
      { url: 'https://s2.example.com', weight: 25, enabled: false }
    ];
    const servers = parseUpstreamServers(input);
    expect(servers).toEqual([
      { url: 'https://s1.example.com', weight: 75, enabled: true, name: 'Primary' },
      { url: 'https://s2.example.com', weight: 25, enabled: false }
    ]);
  });

  it('sanitizes invalid weights and protocol missing urls', () => {
    const raw = 's1.example.com#weight=-10,s2.example.com#weight=invalid,s3.example.com#weight=2000';
    const servers = parseUpstreamServers(raw);
    expect(servers[0]).toEqual({ url: 'https://s1.example.com', weight: 1, enabled: true });
    expect(servers[1]).toEqual({ url: 'https://s2.example.com', weight: 1, enabled: true });
    expect(servers[2]).toEqual({ url: 'https://s3.example.com', weight: 1000, enabled: true });
  });

  it('falls back to official Gemini endpoint when raw input is empty', () => {
    expect(parseUpstreamServers('')).toEqual([
      { url: 'https://generativelanguage.googleapis.com', weight: 1, enabled: true, name: 'Official Gemini API' }
    ]);
  });
});
