import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Mobile Enhancements & Minimalist Upstream Layout', () => {
  const modalPath = path.resolve(__dirname, '../frontend/src/components/ConfigModal.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(modalPath, 'utf-8');
  });

  test('should include a mobile-only header quick save button', () => {
    expect(content).toContain('onClick={handleSave}');
    expect(content).toContain('sm:hidden');
  });

  test('should lock body scroll when modal is open and restore on close', () => {
    expect(content).toContain("document.body.style.overflow = 'hidden'");
  });

  test('should use dynamic viewport height dvh and safe area inset padding', () => {
    expect(content).toContain('dvh');
    expect(content).toContain('safe-area-inset-bottom');
  });

  test('should layout model mapping with mobile top action bar and desktop single-line flow', () => {
    expect(content).toContain('order-1');
    expect(content).toContain('order-2 sm:order-3');
    expect(content).toContain('order-3 sm:order-2');
    expect(content).toContain('basis-full sm:basis-auto');
    expect(content).toContain('h-7 sm:h-8');
  });

  test('should remove bottom action separator in mobile mapping card', () => {
    expect(content).not.toContain('pt-1.5 sm:pt-0 border-t border-white/[0.04]');
  });

  test('should layout node card header with desktop inline switcher and mobile full-width segmented switcher', () => {
    expect(content).toContain('hidden sm:inline-flex rounded p-0.5 bg-slate-900 border border-slate-700/80 ml-1.5 shrink-0');
    expect(content).toContain('grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg mt-2 sm:hidden gap-1');
  });

  test('should layout upstream node input fields in compact mobile grid and desktop single-line grid', () => {
    expect(content).toContain('grid grid-cols-12 gap-2 sm:gap-2.5 text-xs');
    expect(content).toContain('col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5');
    expect(content).toContain('col-span-8 sm:col-span-3 space-y-1');
    expect(content).toContain('col-span-4 sm:col-span-2 space-y-1 sm:order-last');
    expect(content).toContain('col-span-12 sm:col-span-7 space-y-1');
  });

  test('renders minimalist direct mode badge and target endpoint', () => {
    expect(content).toContain("t('config.egressChannelTitle'");
    expect(content).toContain("t('config.targetOfficialEndpoint'");
  });

  test('conditionally hides node URL input when server.type is direct', () => {
    expect(content).toContain("server.type === 'direct' ?");
    expect(content).toContain("e.g. Gemini-Official");
  });

  test('removes noisy upstreamServersDesc paragraph', () => {
    expect(content).not.toContain("{t('config.upstreamServersDesc'");
  });

  test('uses button switch for node enable toggle instead of sr-only checkbox to prevent focus jump and blank space', () => {
    expect(content).toContain('role="switch"');
    expect(content).toContain('aria-checked={server.enabled}');
    expect(content).not.toContain('className="sr-only"');
    expect(content).toContain('const isEnabled = server.enabled !== false');
    expect(content).toContain('enabled: !isEnabled');
    expect(content).toContain('aria-label=');
  });

  test('modal backdrop overlay and content prevent scrolling escape and overscroll bounce', () => {
    expect(content).toContain('fixed inset-0 overflow-hidden overscroll-none');
    expect(content).toContain('overscroll-contain flex-1');
  });

  test('modal card and node card have relative positioning to scope absolute elements', () => {
    expect(content).toContain('relative ui-card');
    expect(content).toContain('relative p-3 rounded-lg border');
  });

  test('normalizes upstream servers enabled state to boolean on fetch', () => {
    expect(content).toContain('enabled: srv.enabled !== false');
  });
});
