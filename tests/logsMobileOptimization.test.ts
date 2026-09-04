import fs from 'fs';
import path from 'path';
import { en } from '../frontend/src/i18n/locales/en';
import { zh } from '../frontend/src/i18n/locales/zh';

describe('Logs Mobile Optimization and Sub-Tab Navigation', () => {
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  let logsViewContent: string;

  beforeAll(() => {
    logsViewContent = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('default view on mobile remains on list page without auto-opening detail', () => {
    // Initial fetchLogs passes false to loadDetail
    expect(logsViewContent).toContain('loadDetail(fetchedLogs[0], false)');

    // loadDetail accepts openMobile defaulting to true
    expect(logsViewContent).toContain('const loadDetail = (log: any, openMobile = true) => {');
    expect(logsViewContent).toContain('if (openMobile) {\n      setMobileDetailOpen(true);\n    }');

    // Clicking a log item explicitly passes true
    expect(logsViewContent).toContain('onClick={() => loadDetail(log, true)}');
  });

  test('detail page header back button is a pure icon without text clutter', () => {
    // Back button has ArrowLeft icon
    expect(logsViewContent).toContain('<ArrowLeft className="w-4 h-4" />');

    // Back button does not render the text span on mobile
    expect(logsViewContent).not.toMatch(/<ArrowLeft[^>]*>\s*<\/ArrowLeft>\s*<span[^>]*>\{t\('logs\.backToList'/);
    expect(logsViewContent).not.toMatch(/<ArrowLeft[^>]*\/>\s*<span[^>]*>\{t\('logs\.backToList'/);
  });

  test('action buttons in detail view hide text on small screens', () => {
    // Global JSON copy button text is hidden on small screens
    expect(logsViewContent).toContain('<span className="hidden sm:inline">JSON</span>');
    expect(logsViewContent).toContain('<span className="text-emerald-400 font-semibold hidden sm:inline">');

    // Claude cURL button text is hidden on small screens
    expect(logsViewContent).toContain('<span className="hidden sm:inline">Claude cURL</span>');

    // Gemini cURL button text is hidden on small screens
    expect(logsViewContent).toContain('<span className="hidden sm:inline">Gemini cURL</span>');
  });

  test('payload and response tabs provide mobile segmented sub-tab controls and responsive columns', () => {
    // Sub-tab states are defined
    expect(logsViewContent).toContain("const [mobilePayloadSubtab, setMobilePayloadSubtab] = useState<'client' | 'upstream'>('client');");
    expect(logsViewContent).toContain("const [mobileResponseSubtab, setMobileResponseSubtab] = useState<'client' | 'upstream'>('client');");

    // Mobile segmented control for payload
    expect(logsViewContent).toContain("onClick={() => setMobilePayloadSubtab('client')}");
    expect(logsViewContent).toContain("onClick={() => setMobilePayloadSubtab('upstream')}");
    expect(logsViewContent).toContain("{t('logs.clientReqTab', '客户端请求')}");
    expect(logsViewContent).toContain("{t('logs.upstreamReqTab', '上游请求')}");

    // Mobile segmented control for response
    expect(logsViewContent).toContain("onClick={() => setMobileResponseSubtab('client')}");
    expect(logsViewContent).toContain("onClick={() => setMobileResponseSubtab('upstream')}");
    expect(logsViewContent).toContain("{t('logs.clientResTab', '客户端响应')}");
    expect(logsViewContent).toContain("{t('logs.upstreamResTab', '上游响应')}");

    // Responsive column display classes
    expect(logsViewContent).toContain("mobilePayloadSubtab === 'client' ? 'flex flex-1' : 'hidden md:flex md:flex-1'");
    expect(logsViewContent).toContain("mobilePayloadSubtab === 'upstream' ? 'flex flex-1' : 'hidden md:flex md:flex-1'");
    expect(logsViewContent).toContain("mobileResponseSubtab === 'client' ? 'flex flex-1' : 'hidden md:flex md:flex-1'");
    expect(logsViewContent).toContain("mobileResponseSubtab === 'upstream' ? 'flex flex-1' : 'hidden md:flex md:flex-1'");
  });

  test('i18n locales define subtab translation keys for both zh and en', () => {
    expect(zh.logs.clientReqTab).toBe('客户端请求');
    expect(zh.logs.upstreamReqTab).toBe('上游请求');
    expect(zh.logs.clientResTab).toBe('客户端响应');
    expect(zh.logs.upstreamResTab).toBe('上游响应');

    expect(en.logs.clientReqTab).toBe('Client Request');
    expect(en.logs.upstreamReqTab).toBe('Upstream Request');
    expect(en.logs.clientResTab).toBe('Client Response');
    expect(en.logs.upstreamResTab).toBe('Upstream Response');
  });
});
