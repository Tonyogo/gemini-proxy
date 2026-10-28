import * as fs from 'fs';
import * as path from 'path';

describe('LogsView Header & Metadata Optimization', () => {
  const logsViewPath = path.resolve(__dirname, '../frontend/src/components/LogsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(logsViewPath, 'utf-8');
  });

  test('should decouple viewMode into clientViewMode and upstreamViewMode states', () => {
    expect(content).toContain('clientViewMode');
    expect(content).toContain('setClientViewMode');
    expect(content).toContain('upstreamViewMode');
    expect(content).toContain('setUpstreamViewMode');
  });

  test('detail top navigation should only keep global JSON copy and remove global preview toggle', () => {
    // Top bar should not have global setViewMode toggle
    expect(content).not.toMatch(/setViewMode\(['"]preview['"]\)/);
    // Should retain handleCopyJson in top bar
    expect(content).toContain('handleCopyJson');
  });

  test('columns should have VS Code style headers with independent toggles and actions', () => {
    // Claude column header should have clientViewMode toggle and Claude cURL
    expect(content).toContain("setClientViewMode('preview')");
    expect(content).toContain("setClientViewMode('raw')");
    expect(content).toContain('handleCopyClaudeCurl');

    // Gemini column header should have upstreamViewMode toggle and Gemini cURL
    expect(content).toContain("setUpstreamViewMode('preview')");
    expect(content).toContain("setUpstreamViewMode('raw')");
    expect(content).toContain('handleCopyGeminiCurl');

    // No legacy viewMode check should remain in payload/response columns
    expect(content).not.toContain('viewMode ===');
  });

  test('metadata ribbon should be single-line compact and eliminate redundant labels', () => {
    // Should use whitespace-nowrap and overflow-x-auto
    expect(content).toContain('overflow-x-auto');
    expect(content).toContain('whitespace-nowrap');

    // Should eliminate redundant prefixes like "Model:" and "Latency:"
    expect(content).not.toMatch(/>\s*Model:\s*\{selectedLog\.model\}/);
    expect(content).not.toMatch(/>\s*Latency:\s*\{selectedLog\.duration\}ms/);
  });

  test('should hide internal duplicate header on mobile and provide all-in-one single-row bar', () => {
    // Header bar is hidden on mobile to avoid duplicate header with App global bar
    expect(content).toContain('hidden md:flex items-center justify-between pb-2.5 mb-2 border-b');
    // Mobile single-row controls include search trigger and refresh buttons
    expect(content).toMatch(/flex md:hidden[\s\S]*?setIsMobileSearchOpen[\s\S]*?fetchLogs\(true\)/);
  });

  test('should enforce path truncation and tooltip in metadata ribbon and list items', () => {
    // Detail metadata ribbon: path truncation and title tooltip
    expect(content).toMatch(
      /<span[^>]*className="[^"]*max-w-\[160px\] sm:max-w-\[220px\] md:max-w-\[280px\] lg:max-w-\[360px\][^"]*truncate[^"]*inline-block[^"]*"[^>]*title=\{selectedLog\.path\}[^>]*>\s*\{selectedLog\.path\}\s*<\/span>/
    );

    // Master list row 1: pathLabel truncation and title tooltip
    expect(content).toMatch(
      /max-w-\[100px\] sm:max-w-\[120px\] truncate[\s\S]*?title=\{log\.reqPath \|\| pathLabel\}/
    );
  });

  test('should isolate detail loading state, cancel in-flight requests, and render error card on failure', () => {
    // 1. Manages detailError state and detailAbortControllerRef
    expect(content).toContain('detailError');
    expect(content).toContain('setDetailError');
    expect(content).toContain('detailAbortControllerRef');

    // 2. Abort controller lifecycle in loadDetail
    expect(content).toContain('detailAbortControllerRef.current.abort()');
    expect(content).toContain('signal: controller.signal');

    // 3. Resets selectedLog and detailError to null before fetch to prevent stale ribbon
    expect(content).toMatch(/setSelectedLog\(null\)[\s\S]*?setDetailError\(null\)[\s\S]*?setDetailLoading\(true\)/);

    // 4. Sets detailError on error or !r.ok rather than falling back into selectedLog
    expect(content).toContain("setDetailError(t('logs.detailLoadError'))");

    // 5. Renders AlertCircle and error card container when detailError is present
    expect(content).toContain('AlertCircle');
    expect(content).toContain('{detailError}');
    expect(content).toMatch(/t\(['"]logs\.detailLoadErrorDesc['"]\)/);
  });
});


