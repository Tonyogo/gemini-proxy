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
    // Verify concise placeholders
    expect((zh.config as any).serverAllowedModelsPlaceholder).toBe('全部模型 (逗号分隔过滤)');
    expect((en.config as any).serverAllowedModelsPlaceholder).toBe('All models (comma separated)');
    expect((zh.config as any).egressLocalShort).toBe('本机出站');
    expect((en.config as any).egressLocalShort).toBe('Local Direct');
    expect((zh.config as any).egressAgentShort).toBe('Agent 节点');
    expect((en.config as any).egressAgentShort).toBe('Remote Agent');
  });
});
