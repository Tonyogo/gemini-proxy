import fs from 'fs';
import path from 'path';

describe('GitHub Project Link Integration Verification', () => {
  const repoUrl = 'https://github.com/Tonyogo/gemini-proxy';
  const frontendDir = path.resolve(__dirname, '../frontend/src');

  test('App.tsx contains GitHub repository link and security attributes', () => {
    const appContent = fs.readFileSync(path.join(frontendDir, 'App.tsx'), 'utf-8');
    expect(appContent).toContain(repoUrl);
    expect(appContent).toContain('target="_blank"');
    expect(appContent).toContain('rel="noopener noreferrer"');
    expect(appContent).toContain('Github');
    expect(appContent).toContain('ExternalLink');
  });

  test('ConfigModal.tsx contains GitHub repository link and security attributes', () => {
    const configContent = fs.readFileSync(path.join(frontendDir, 'components/ConfigModal.tsx'), 'utf-8');
    expect(configContent).toContain(repoUrl);
    expect(configContent).toContain('target="_blank"');
    expect(configContent).toContain('rel="noopener noreferrer"');
    expect(configContent).toContain('Github');
  });

  test('i18n locales contain nav.github translations', () => {
    const zhContent = fs.readFileSync(path.join(frontendDir, 'i18n/locales/zh.ts'), 'utf-8');
    const enContent = fs.readFileSync(path.join(frontendDir, 'i18n/locales/en.ts'), 'utf-8');

    expect(zhContent).toContain('github: "GitHub 源码"');
    expect(enContent).toContain('github: "GitHub Repository"');
  });
});
