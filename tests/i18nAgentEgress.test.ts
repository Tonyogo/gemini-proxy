import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n locales for Agent Egress Channel', () => {
  const keys = [
    'egressChannelTitle',
    'egressLocal',
    'egressLocalDesc',
    'egressAgent',
    'egressAgentDesc',
    'selectAgent',
    'noAgentsAvailable'
  ];

  it('contains all egress channel translation keys in zh and en', () => {
    for (const key of keys) {
      expect((zh.config as any)[key]).toBeDefined();
      expect(typeof (zh.config as any)[key]).toBe('string');
      expect((en.config as any)[key]).toBeDefined();
      expect(typeof (en.config as any)[key]).toBe('string');
    }
  });
});
