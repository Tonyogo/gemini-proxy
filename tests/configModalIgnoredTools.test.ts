import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Ignored Tools Integration', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  const zhPath = path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts');
  const enPath = path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts');

  let modalContent: string;
  let zhContent: string;
  let enContent: string;

  beforeAll(() => {
    modalContent = fs.readFileSync(modalPath, 'utf-8');
    zhContent = fs.readFileSync(zhPath, 'utf-8');
    enContent = fs.readFileSync(enPath, 'utf-8');
  });

  test('zh locale should define all ignoredTools i18n keys under config', () => {
    expect(zhContent).toContain('ignoredToolsTitle:');
    expect(zhContent).toContain('ignoredToolsDesc:');
    expect(zhContent).toContain('ignoredToolsPlaceholder:');
    expect(zhContent).toContain('ignoredToolsAdd:');
    expect(zhContent).toContain('ignoredToolsResetDefault:');
    expect(zhContent).toContain('ignoredToolsClear:');
    expect(zhContent).toContain('ignoredToolsEmpty:');
  });

  test('en locale should define all ignoredTools i18n keys under config', () => {
    expect(enContent).toContain('ignoredToolsTitle:');
    expect(enContent).toContain('ignoredToolsDesc:');
    expect(enContent).toContain('ignoredToolsPlaceholder:');
    expect(enContent).toContain('ignoredToolsAdd:');
    expect(enContent).toContain('ignoredToolsResetDefault:');
    expect(enContent).toContain('ignoredToolsClear:');
    expect(enContent).toContain('ignoredToolsEmpty:');
  });
});
