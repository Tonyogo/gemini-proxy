import * as fs from 'fs';
import * as path from 'path';

describe('Mobile WeChat-Style Immersive Detail Navigation', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');

  let appContent: string;
  let logsViewContent: string;

  beforeAll(() => {
    appContent = fs.readFileSync(appPath, 'utf-8');
    logsViewContent = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('LogsView should support onMobileDetailChange callback and eliminate duplicate inner back button', () => {
    expect(logsViewContent).toContain('onMobileDetailChange');
    // Ensure duplicate mobile inner back button with ArrowLeft is removed from detail header
    expect(logsViewContent).not.toMatch(/<button[^>]*setMobileDetailOpen\(false\)[^>]*>\s*<ArrowLeft/);
  });

  test('App.tsx should detect mobile detail immersion and conditionally hide mobile bottom nav', () => {
    expect(appContent).toMatch(/isMobileDetailActive|isMobileImmersive/);
    // Bottom nav must be conditionally rendered based on immersion
    expect(appContent).toMatch(/!isMobileDetailActive\s*&&\s*\(?\s*<nav[^>]*fixed bottom-0/);
  });

  test('App.tsx should render WeChat-style back button in top bar during mobile detail immersion', () => {
    // Top bar should have a back button with ChevronLeft for both logs and discover
    expect(appContent).toContain('ChevronLeft');
    expect(appContent).toContain("t('logs.title'");
  });
});
