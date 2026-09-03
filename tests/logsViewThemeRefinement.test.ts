import fs from 'fs';
import path from 'path';

describe('LogsView & Preview Modes Theme Cleanliness Test', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, `../frontend/src/components/${file}`), 'utf-8');

  it('verifies JsonTreeView does not have hardcoded bg-slate-950 container', () => {
    const code = read('JsonTreeView.tsx');
    expect(code).not.toContain('bg-slate-950/90');
    expect(code).toContain('--code-bg');
  });

  it('verifies LogsView list items do not have hardcoded bg-slate-800 on POST method badge', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('bg-slate-800 text-slate-300');
  });

  it('verifies SseStreamPreview does not have hardcoded bg-slate-950', () => {
    const code = read('SseStreamPreview.tsx');
    expect(code).not.toContain('bg-slate-950 p-3.5');
  });

  it('verifies ConversationView and ToolCallCard do not have hardcoded bg-slate-950/80', () => {
    const convCode = read('ConversationView.tsx');
    expect(convCode).not.toContain('bg-slate-950/80');
    expect(convCode).toContain('--code-bg');

    const toolCode = read('chat/ToolCallCard.tsx');
    expect(toolCode).not.toContain('bg-slate-950/80');
    expect(toolCode).toContain('--code-bg');
  });

  it('verifies LogsView has viewport-bounded classes without min-h-600px or h-520px', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('min-h-[600px]');
    expect(code).not.toContain('h-[520px]');
    expect(code).not.toContain('md:h-[calc(100dvh-6.5rem)]');
    expect(code).toContain('w-full flex-1 min-h-0 h-full flex flex-col md:flex-row gap-4 items-stretch overflow-hidden');
  });

  it('verifies LogsView does not have hardcoded dark boxes in metadata and pagination', () => {
    const code = read('LogsView.tsx');
    expect(code).not.toContain('bg-slate-900 border border-slate-800');
    expect(code).not.toContain('bg-slate-950 border border-slate-800');
  });

  it('verifies chat components do not have hardcoded black codeblocks or tables in light mode', () => {
    const mdCode = read('chat/MarkdownContent.tsx');
    expect(mdCode).not.toContain('border border-slate-800 bg-slate-950');
    expect(mdCode).toContain('--code-bg');

    const thinkingCode = read('chat/ThinkingBlock.tsx');
    expect(thinkingCode).not.toContain('bg-slate-950/60 border-t border-amber-500/20 text-slate-300');
  });

  it('verifies JsonTreeView has h-full flex flex-col overflow-hidden layout', () => {
    const code = read('JsonTreeView.tsx');
    expect(code).toContain('h-full flex-1 min-h-0 flex flex-col overflow-hidden');
    expect(code).toContain('flex-1 min-h-0 overflow-auto');
  });

  it('verifies LogsView list area has flex-1 min-h-0 overflow-y-auto', () => {
    const code = read('LogsView.tsx');
    expect(code).toContain('flex-1 min-h-0 overflow-y-auto');
  });

  it('verifies App shell applies dynamic viewport locking for workbench tabs', () => {
    const appCode = fs.readFileSync(path.join(__dirname, '../frontend/src/App.tsx'), 'utf-8');
    expect(appCode).toContain("const isWorkbenchTab = ['playground', 'logs', 'translate', 'terminal'].includes(activeTab);");
    expect(appCode).toContain("isWorkbenchTab ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen'");
    expect(appCode).toContain("isWorkbenchTab ? 'h-full min-h-0 overflow-hidden' : ''");
  });

  it('verifies LogsView detail inspector sections have shrink-0 and tab-appropriate overflow', () => {
    const code = read('LogsView.tsx');
    expect(code).toContain('gap-2.5 shrink-0');
    expect(code).toContain('text-xs font-mono shrink-0');
    expect(code).toContain("activeTab === 'chat' ? 'overflow-y-auto space-y-4' : 'overflow-hidden'");
  });
});
