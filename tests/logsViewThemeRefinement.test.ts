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
    expect(code).toContain('md:h-[calc(100dvh-6.5rem)]');
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
});
