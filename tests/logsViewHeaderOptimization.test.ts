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
});

