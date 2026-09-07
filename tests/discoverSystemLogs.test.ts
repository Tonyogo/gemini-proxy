import * as fs from 'fs';
import * as path from 'path';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Extract System Logs to Discover Hub', () => {
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');

  let hubContent: string;
  let appContent: string;

  beforeAll(() => {
    hubContent = fs.existsSync(hubPath) ? fs.readFileSync(hubPath, 'utf-8') : '';
    appContent = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf-8') : '';
  });

  test('i18n should include systemLogs translations in both zh and en', () => {
    expect((zh as any).discover.systemLogsTitle).toBe('运行日志');
    expect((en as any).discover.systemLogsTitle).toBe('System Logs');
    expect((zh as any).discover.systemLogsDesc).toBeDefined();
    expect((en as any).discover.systemLogsDesc).toBeDefined();
  });

  test('DiscoverHubView should support systemLogs tool in DiscoverToolId and render 4 tools', () => {
    expect(hubContent).toContain("'systemLogs'");
    expect(hubContent).toContain('systemLogsTitle');
    // Group 1 gradient
    expect(hubContent).toContain('from-blue-500 to-cyan-600');
  });

  test('App.tsx should route discoverSubView systemLogs to TerminalLogsView', () => {
    expect(appContent).toContain("discoverSubView === 'systemLogs'");
    expect(appContent).toContain('<TerminalLogsView');
  });
});
