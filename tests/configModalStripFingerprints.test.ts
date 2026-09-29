import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Strip System Fingerprints Integration', () => {
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

  test('ConfigModal should manage stripSystemFingerprints state with default true', () => {
    expect(modalContent).toContain('const [stripSystemFingerprints, setStripSystemFingerprints] = useState<boolean>(true);');
    expect(modalContent).toContain('setStripSystemFingerprints(data.config.stripSystemFingerprints !== false);');
  });

  test('ConfigModal should send stripSystemFingerprints in save payload', () => {
    expect(modalContent).toMatch(/body:\s*JSON\.stringify\(\s*\{[\s\S]*stripSystemFingerprints[\s\S]*\}\s*\)/);
  });

  test('ConfigModal should render STRIP_SYSTEM_FINGERPRINTS toggle switch with i18n keys', () => {
    expect(modalContent).toContain("t('config.stripFingerprintsTitle')");
    expect(modalContent).toContain("t('config.stripFingerprintsDesc')");
    expect(modalContent).toContain('onClick={() => setStripSystemFingerprints(!stripSystemFingerprints)}');
  });

  test('zh and en locales should define stripFingerprintsTitle and stripFingerprintsDesc', () => {
    expect(zhContent).toContain('stripFingerprintsTitle: "STRIP_SYSTEM_FINGERPRINTS"');
    expect(zhContent).toContain('stripFingerprintsDesc:');
    expect(enContent).toContain('stripFingerprintsTitle: "STRIP_SYSTEM_FINGERPRINTS"');
    expect(enContent).toContain('stripFingerprintsDesc:');
  });
});
