import * as fs from 'fs';
import * as path from 'path';

describe('ConfigModal Mobile Enhancements', () => {
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
    // Verifies that the previous pt-1.5 border-t separator inside mapping item actions is eliminated
    expect(content).not.toContain('pt-1.5 sm:pt-0 border-t border-white/[0.04]');
  });

  test('should layout node card header with desktop inline switcher and mobile full-width segmented switcher', () => {
    expect(content).toContain('hidden sm:inline-flex rounded p-0.5 bg-slate-900 border border-slate-700/80 ml-1.5 shrink-0');
    expect(content).toContain('grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-700/80 rounded-lg mt-2 sm:hidden gap-1');
  });

  test('should layout upstream node input fields in compact mobile grid and desktop single-line grid', () => {
    expect(content).toContain('grid grid-cols-12 gap-2 sm:gap-2.5 text-xs');
    expect(content).toContain('col-span-12 grid grid-cols-12 gap-2 sm:gap-2.5');
    expect(content).toContain('col-span-8 sm:col-span-4 space-y-1');
    expect(content).toContain('col-span-4 sm:col-span-3 space-y-1 sm:order-last');
    expect(content).toContain('col-span-12 sm:col-span-5 space-y-1');
  });

  test('should optimize direct mode egress channel radio cards and agent selector for mobile', () => {
    expect(content).toContain('p-2 sm:p-2.5 rounded border cursor-pointer');
    expect(content).toContain('flex-1 min-w-0');
    expect(content).toContain('w-full ui-input p-2 text-xs font-mono bg-slate-950/80 border-cyan-500/30 text-cyan-200 cursor-pointer truncate');
    expect(content).toContain('w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center');
  });
});


