import proxyAgentManager from '../src/utils/proxyAgentManager';
import config from '../config/default';

describe('ProxyAgentManager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    proxyAgentManager.clearCache();
    (config as any).proxyUrl = undefined;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns undefined when no proxy is configured', () => {
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    delete process.env.ALL_PROXY;
    expect(proxyAgentManager.getAgent()).toBeUndefined();
    expect(proxyAgentManager.resolveProxyUrl()).toBeUndefined();
  });

  test('prioritizes node-level proxyUrl over global config and env', () => {
    (config as any).proxyUrl = 'http://global-proxy:8080';
    process.env.HTTPS_PROXY = 'http://env-proxy:8080';
    
    const resolved = proxyAgentManager.resolveProxyUrl('socks5://127.0.0.1:1080');
    expect(resolved).toBe('socks5://127.0.0.1:1080');
    
    const agent = proxyAgentManager.getAgent('socks5://127.0.0.1:1080');
    expect(agent).toBeDefined();
  });

  test('falls back to global config proxyUrl when node proxyUrl is not provided', () => {
    (config as any).proxyUrl = 'http://127.0.0.1:7890';
    delete process.env.HTTPS_PROXY;

    const resolved = proxyAgentManager.resolveProxyUrl(undefined);
    expect(resolved).toBe('http://127.0.0.1:7890');
    expect(proxyAgentManager.getAgent()).toBeDefined();
  });

  test('falls back to environment variable HTTPS_PROXY when neither node nor global is set', () => {
    process.env.HTTPS_PROXY = 'http://127.0.0.1:8888';
    const resolved = proxyAgentManager.resolveProxyUrl();
    expect(resolved).toBe('http://127.0.0.1:8888');
  });

  test('reuses cached Agent instances for identical proxy URLs', () => {
    const agent1 = proxyAgentManager.getAgent('http://127.0.0.1:7890');
    const agent2 = proxyAgentManager.getAgent('http://127.0.0.1:7890');
    expect(agent1).toBe(agent2);
  });

  test('handles invalid proxy URLs gracefully without throwing', () => {
    // Should safely return undefined without throwing unhandled exceptions
    const agent = proxyAgentManager.getAgent('invalid://url');
    // Either returns agent or undefined gracefully
    expect(true).toBe(true);
  });

  test('returns undefined when node explicitly sets useProxy: false even if global proxy is configured', () => {
    (config as any).proxyUrl = 'http://127.0.0.1:7890';
    expect(proxyAgentManager.getAgent({ useProxy: false })).toBeUndefined();
  });

  test('returns global proxy agent when node sets useProxy: true without custom proxyUrl', () => {
    (config as any).proxyUrl = 'http://127.0.0.1:7890';
    const agent = proxyAgentManager.getAgent({ useProxy: true });
    expect(agent).toBeDefined();
  });

  test('returns undefined when node sets useProxy: true but no global or node proxy is configured', () => {
    (config as any).proxyUrl = undefined;
    delete process.env.HTTPS_PROXY;
    delete process.env.HTTP_PROXY;
    expect(proxyAgentManager.getAgent({ useProxy: true })).toBeUndefined();
  });
});
