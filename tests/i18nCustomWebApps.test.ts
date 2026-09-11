// tests/i18nCustomWebApps.test.ts
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('i18n Custom Web Apps Keys', () => {
  const requiredKeys = [
    'customAppsTitle',
    'customAppsSubtitle',
    'addCustomApp',
    'editCustomApp',
    'deleteCustomApp',
    'appName',
    'appNamePlaceholder',
    'appUrl',
    'appUrlPlaceholder',
    'colorTheme',
    'useGatewayProxy',
    'confirmDeleteApp',
    'backToDiscover',
    'refresh',
    'openExternal',
    'fullscreen',
    'exitFullscreen',
    'loadingApp',
    'mixedContentWarn',
  ];

  it('should have all required keys in zh.ts discover namespace', () => {
    const zhDiscover = (zh as any).discover;
    expect(zhDiscover).toBeDefined();
    for (const key of requiredKeys) {
      expect(zhDiscover[key]).toBeDefined();
      expect(typeof zhDiscover[key]).toBe('string');
    }
  });

  it('should have all required keys in en.ts discover namespace', () => {
    const enDiscover = (en as any).discover;
    expect(enDiscover).toBeDefined();
    for (const key of requiredKeys) {
      expect(enDiscover[key]).toBeDefined();
      expect(typeof enDiscover[key]).toBe('string');
    }
  });
});
