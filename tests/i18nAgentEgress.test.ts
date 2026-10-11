import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n locales for Minimalist Agent Egress', () => {
  const requiredKeys = [
    'egressChannelTitle',
    'egressLocalShort',
    'egressAgentShort',
    'targetOfficialEndpoint',
    'serverAllowedModelsPlaceholder'
  ];

  it('contains minimalist egress channel and endpoint translation keys in zh and en', () => {
    for (const key of requiredKeys) {
      expect((zh.config as any)[key]).toBeDefined();
      expect(typeof (zh.config as any)[key]).toBe('string');
      expect((en.config as any)[key]).toBeDefined();
      expect(typeof (en.config as any)[key]).toBe('string');
    }
    expect((zh.config as any).serverAllowedModelsPlaceholder).toBe('全部模型 (逗号分隔过滤)');
    expect((en.config as any).serverAllowedModelsPlaceholder).toBe('All models (comma separated)');
    expect((zh.config as any).egressLocalShort).toBe('本机直连');
    expect((en.config as any).egressLocalShort).toBe('Local Direct');
    expect((zh.config as any).egressProxyShort).toBe('代理通道');
    expect((en.config as any).egressProxyShort).toBe('Proxy Channel');
    expect((zh.config as any).viaGlobalProxyBadge).toBe('全局代理: {proxy}');
    expect((en.config as any).viaGlobalProxyBadge).toBe('Global Proxy: {proxy}');
    expect((zh.config as any).globalProxyNotConfigured).toBe('需配置全局代理');
    expect((en.config as any).globalProxyNotConfigured).toBe('Global Proxy Required');
    expect((zh.config as any).egressAgentShort).toBe('Agent 节点');
    expect((en.config as any).egressAgentShort).toBe('Remote Agent');
    expect((zh.config as any).targetOfficialEndpoint).toBe('目标: 官方 Gemini API (本机直连)');
    expect((en.config as any).targetOfficialEndpoint).toBe('Target: Official Gemini API (Local Direct)');
  });
});
