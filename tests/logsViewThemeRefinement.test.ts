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
});
