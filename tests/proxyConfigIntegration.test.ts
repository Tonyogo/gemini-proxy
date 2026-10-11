import config, { parseUpstreamServers, updateConfig } from '../config/default';

describe('Proxy Config Integration', () => {
  test('parseUpstreamServers correctly parses proxyUrl', () => {
    const servers = parseUpstreamServers([
      { url: 'https://generativelanguage.googleapis.com', proxyUrl: 'http://127.0.0.1:7890' }
    ]);
    expect(servers[0].proxyUrl).toBe('http://127.0.0.1:7890');
  });

  test('updateConfig persists and reloads proxyUrl', async () => {
    await updateConfig({ proxyUrl: 'socks5://127.0.0.1:1080' });
    expect((config as any).proxyUrl).toBe('socks5://127.0.0.1:1080');

    // Clean up
    await updateConfig({ proxyUrl: '' });
    expect((config as any).proxyUrl).toBe('');
  });
});
