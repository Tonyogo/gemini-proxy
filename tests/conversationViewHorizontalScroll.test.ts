import fs from 'fs';
import path from 'path';

describe('ConversationView Horizontal Scroll & Stability Test', () => {
  const logsViewCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/LogsView.tsx'), 'utf-8');
  const conversationViewCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/ConversationView.tsx'), 'utf-8');
  const messageBubbleCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/chat/MessageBubble.tsx'), 'utf-8');
  const markdownContentCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/chat/MarkdownContent.tsx'), 'utf-8');
  const toolCallCardCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/chat/ToolCallCard.tsx'), 'utf-8');
  const thinkingBlockCode = fs.readFileSync(path.resolve(__dirname, '../frontend/src/components/chat/ThinkingBlock.tsx'), 'utf-8');

  it('verifies chat container in LogsView locks horizontal overflow', () => {
    expect(logsViewCode).toContain("activeTab === 'chat' ? 'overflow-y-auto overflow-x-hidden space-y-4' : 'overflow-hidden'");
  });

  it('verifies ConversationView root and timeline containers have min-w-0 constraints', () => {
    expect(conversationViewCode).toContain('max-w-5xl mx-auto w-full min-w-0 relative');
    expect(conversationViewCode).toContain('space-y-4 pb-6 min-w-0 w-full');
  });

  it('verifies MessageBubble has full-width assistant bubbles and min-w-0 constraints', () => {
    expect(messageBubbleCode).toContain('flex flex-col mb-5 w-full min-w-0 group');
    expect(messageBubbleCode).toContain('w-full bg-[var(--bg-surface)]');
  });

  it('verifies MarkdownContent wraps words and confines code blocks with overscroll-x-contain', () => {
    expect(markdownContentCode).toContain('break-words min-w-0 [overflow-wrap:anywhere]');
    expect(markdownContentCode).toContain('overflow-x-auto overscroll-x-contain');
    expect(markdownContentCode).toContain('break-all');
  });

  it('verifies ToolCallCard and ThinkingBlock have min-w-0 and contained scrolling', () => {
    expect(toolCallCardCode).toContain('w-full min-w-0');
    expect(toolCallCardCode).toContain('overflow-x-auto overscroll-x-contain');
    expect(thinkingBlockCode).toContain('w-full min-w-0');
    expect(thinkingBlockCode).toContain('break-words [overflow-wrap:anywhere]');
  });
});
