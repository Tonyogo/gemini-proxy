import fs from 'fs';
import path from 'path';

describe('AccountsView UI Design System Unification Test', () => {
  const code = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx'), 'utf-8');

  it('verifies server tabs adopt standard .ui-tab-container and .ui-tab-pill classes', () => {
    expect(code).toContain('ui-tab-container');
    expect(code).toContain('ui-tab-pill');
    expect(code).toContain('ui-tab-pill-active');
    expect(code).not.toContain('bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-200/90');
  });

  it('verifies toolbar and buttons adopt standard .ui-btn-primary and .ui-btn-secondary classes', () => {
    expect(code).toContain('ui-btn-primary');
    expect(code).toContain('ui-btn-secondary');
  });

  it('verifies tables remove heavy outer border-collapse and adopt modern borderless hover row styles', () => {
    expect(code).not.toContain('bg-slate-800/50 text-slate-500 mb-3 border border-white/[0.04]');
    expect(code).toContain('tabular-nums');
  });

  it('verifies active models breakdown adopts model family badges, glow dots, copy actions, and unified header', () => {
    const zhCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/i18n/locales/zh.ts'), 'utf-8');
    const enCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/i18n/locales/en.ts'), 'utf-8');

    expect(code).toContain('activeModelsTitle');
    expect(zhCode).toContain('activeModelsTitle');
    expect(enCode).toContain('activeModelsTitle');

    expect(code).toContain('detectModelFamily');
    expect(code).toContain('handleCopyServerModel');
    expect(code).toContain('copiedServerModel');
    expect(code).toContain('boxShadow');
  });
});
