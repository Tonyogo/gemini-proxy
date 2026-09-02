import React, { useState } from 'react';
import { User, Sparkles, Copy, Check, FileText, Image as ImageIcon } from 'lucide-react';
import MarkdownContent from './MarkdownContent';
import ThinkingBlock from './ThinkingBlock';
import ToolCallCard from './ToolCallCard';
import { useTranslation } from '../../i18n/LanguageContext';

export interface ParsedBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image' | 'document' | 'unknown';
  text?: string;
  thinking?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: any;
  toolResult?: any;
  isError?: boolean;
  mediaType?: string;
  data?: string;
  url?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  blocks: ParsedBlock[];
  raw?: any;
}

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const extractPlainText = () => {
    return message.blocks
      .map(b => {
        if (b.type === 'text') return b.text;
        if (b.type === 'thinking') return `[Thinking: ${b.thinking}]`;
        if (b.type === 'tool_use') return `[Tool Use: ${b.toolName} - ${JSON.stringify(b.toolInput)}]`;
        if (b.type === 'tool_result') return `[Tool Result: ${b.toolName || b.toolId} - ${JSON.stringify(b.toolResult)}]`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  };

  const handleCopyMessage = () => {
    const text = extractPlainText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col mb-5 w-full group ${isUser ? 'items-end' : 'items-start'}`}>
      {/* Role Header */}
      <div className={`flex items-center space-x-2 mb-1.5 text-[11px] font-mono select-none ${
        isUser ? 'flex-row-reverse space-x-reverse' : ''
      }`}>
        <div className={`w-6 h-6 rounded-xl flex items-center justify-center border shadow-sm ${
          isUser
            ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
            : 'bg-gradient-to-br from-purple-500/25 via-indigo-500/20 to-purple-500/10 border-purple-400/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
        }`}>
          {isUser ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
        </div>
        <span className={`font-semibold ${isUser ? 'text-indigo-200' : 'text-purple-200'}`}>
          {isUser ? t('logs.user', 'User') : t('logs.assistant', 'Claude Assistant')}
        </span>

        <button
          onClick={handleCopyMessage}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800"
          title={t('logs.copyMessage', 'Copy message')}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>

      {/* Bubble Container */}
      <div className={`rounded-2xl p-4 sm:p-5 border shadow-xl transition-all ${
        isUser
          ? 'w-fit max-w-[85%] bg-gradient-to-br from-indigo-950/60 via-[#0F1322] to-[#0A0C14] border-indigo-500/35 rounded-tr-xs text-slate-100 selection:bg-indigo-500 selection:text-white'
          : 'w-full max-w-[92%] bg-[#0A0C13]/95 border-purple-500/25 border-l-purple-500/70 border-l-[3px] rounded-tl-xs text-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.7)]'
      }`}>
        <div className="space-y-3">
          {message.blocks.map((block, idx) => {
            switch (block.type) {
              case 'thinking':
                return <ThinkingBlock key={idx} thinking={block.thinking || ''} />;

              case 'text':
                return <MarkdownContent key={idx} content={block.text || ''} />;

              case 'tool_use':
                return (
                  <ToolCallCard
                    key={idx}
                    type="call"
                    name={block.toolName || 'tool'}
                    id={block.toolId}
                    content={block.toolInput}
                  />
                );

              case 'tool_result':
                return (
                  <ToolCallCard
                    key={idx}
                    type="result"
                    name={block.toolName || block.toolId || 'tool_result'}
                    id={block.toolId}
                    content={block.toolResult}
                    isError={block.isError}
                  />
                );

              case 'image':
                return (
                  <div key={idx} className="my-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2 inline-block">
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 font-mono mb-1.5">
                      <ImageIcon className="w-3 h-3 text-indigo-400" />
                      <span>Image ({block.mediaType || 'image'})</span>
                    </div>
                    {block.url ? (
                      <img src={block.url} alt="Attachment" className="max-w-md max-h-80 rounded-lg object-contain" />
                    ) : block.data ? (
                      <img src={`data:${block.mediaType || 'image/jpeg'};base64,${block.data}`} alt="Attachment" className="max-w-md max-h-80 rounded-lg object-contain" />
                    ) : null}
                  </div>
                );

              case 'document':
                return (
                  <div key={idx} className="my-2 p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 flex items-center space-x-2 text-xs font-mono text-slate-300">
                    <FileText className="w-4 h-4 text-purple-400" />
                    <span>Document Attachment ({block.mediaType || 'application/pdf'})</span>
                  </div>
                );

              default:
                return (
                  <div key={idx} className="text-xs font-mono text-slate-400 bg-slate-950 p-2 rounded-lg">
                    <pre className="overflow-x-auto">{JSON.stringify(block, null, 2)}</pre>
                  </div>
                );
            }
          })}
        </div>
      </div>
    </div>
  );
}
