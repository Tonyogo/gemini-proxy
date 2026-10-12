import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover I18n translations', () => {
  const requiredKeys = [
    'managePage',
    'manageTitle',
    'manageDesc',
    'moveUp',
    'moveDown',
    'show',
    'hide',
    'builtinType',
    'customType',
    'resetDefault',
    'resetConfirm',
    'allHiddenPrompt',
    'openSettings',
  ];

  it('zh locale has all required discover management keys', () => {
    requiredKeys.forEach((key) => {
      expect((zh.discover as any)[key]).toBeDefined();
    });
  });

  it('en locale has all required discover management keys', () => {
    requiredKeys.forEach((key) => {
      expect((en.discover as any)[key]).toBeDefined();
    });
  });
});
