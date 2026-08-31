import React, { useState, useMemo, useRef } from 'react';
import { Shield, ChevronDown, ChevronRight, Copy, Check, MessageSquare, AlertCircle, ChevronsUp, ChevronsDown } from 'lucide-react';
import MessageBubble, { ChatMessage, ParsedBlock } from './chat/MessageBubble';
import MarkdownContent from './chat/MarkdownContent';
import { useTranslation } from '../i18n/LanguageContext';

interface ConversationViewProps {
  log: any;
}

export default function ConversationView({ log }: ConversationViewProps) {
  const { t } = useTranslation();
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [copiedSystem, setCopiedSystem] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const scrollToBottom = () => {
    const scrollContainer = containerRef.current?.closest('.overflow-y-auto');
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // 解析并构建完整的对话消息流
  const { systemPrompt, conversationMessages } = useMemo(() => {
    if (!log) return { systemPrompt: '', conversationMessages: [] };

    const clientReq = log.client_req || {};
    const claudeRes = log.claude_res;

    // 1. 提取 System Prompt
    let extractedSystem = '';
    if (clientReq.system) {
      if (typeof clientReq.system === 'string') {
        extractedSystem = clientReq.system;
      } else if (Array.isArray(clientReq.system)) {
        extractedSystem = clientReq.system
          .map((s: any) => (typeof s === 'string' ? s : s.text || ''))
          .join('\n\n');
      }
    }

    // 2. 解析客户端消息列表 (client_req.messages)
    const messages: ChatMessage[] = [];
    if (Array.isArray(clientReq.messages)) {
      clientReq.messages.forEach((msg: any) => {
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        const blocks = parseContentToBlocks(msg.content);
        messages.push({ role, blocks, raw: msg });
      });
    }

    // 3. 解析当前轮次助手的响应 (claude_res) 并追加至末尾
    if (claudeRes) {
      const assistantBlocks = parseClaudeResponseToBlocks(claudeRes);
      if (assistantBlocks.length > 0) {
        messages.push({
          role: 'assistant',
          blocks: assistantBlocks,
          raw: claudeRes
        });
      }
    }

    return { systemPrompt: extractedSystem, conversationMessages: messages };
  }, [log]);

  const handleCopySystem = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!systemPrompt) return;
    navigator.clipboard.writeText(systemPrompt);
    setCopiedSystem(true);
    setTimeout(() => setCopiedSystem(false), 2000);
  };

  if (!log) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 text-xs space-y-2 font-mono">
        <MessageSquare className="w-8 h-8 text-slate-600" />
        <span>{t('logs.selectPrompt', 'Select a log entry on the left to inspect conversation.')}</span>
      </div>
    );
  }

  if (conversationMessages.length === 0 && !systemPrompt) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 text-xs space-y-2 font-mono bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6">
        <AlertCircle className="w-8 h-8 text-amber-500/60" />
        <span className="text-slate-300 font-semibold">{t('logs.noMessages', 'No conversation messages in this log.')}</span>
        <span className="text-[11px] text-slate-500 text-center max-w-sm">
          This request might be a token count endpoint, models list, or did not supply standard Claude Messages API structure.
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col space-y-4 pb-8 max-w-4xl mx-auto w-full relative">
      {/* System Prompt Collapsible Card */}
      {systemPrompt && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 overflow-hidden font-mono text-xs transition-all shadow-md">
          <div
            onClick={() => setSystemExpanded(!systemExpanded)}
            className="flex items-center justify-between px-4 py-2.5 bg-indigo-500/10 cursor-pointer hover:bg-indigo-500/15 transition-colors select-none text-indigo-300"
          >
            <div className="flex items-center space-x-2">
              {systemExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold tracking-wide">{t('logs.systemPrompt', 'System Prompt')}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                {systemPrompt.length.toLocaleString()} chars
              </span>
            </div>

            <button
              onClick={handleCopySystem}
              className="flex items-center space-x-1 text-indigo-300/80 hover:text-indigo-100 text-[10px] px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/25 transition-colors"
              title="Copy system prompt"
            >
              {copiedSystem ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedSystem ? t('logs.messageCopied', 'Copied!') : t('logs.copyMessage', 'Copy')}</span>
            </button>
          </div>

          {systemExpanded && (
            <div className="p-4 bg-slate-950/80 border-t border-indigo-500/20 text-slate-300 max-h-96 overflow-y-auto leading-relaxed">
              <MarkdownContent content={systemPrompt} />
            </div>
          )}
        </div>
      )}

      {/* Messages Timeline */}
      <div className="space-y-4">
        {conversationMessages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}
      </div>

      {/* Floating Scroll Navigation */}
      <div className="sticky bottom-4 self-end flex flex-col space-y-1.5 z-20 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/60 shadow-2xl">
        <button
          onClick={scrollToTop}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 active:bg-slate-700/80 transition-colors"
          title={t('logs.scrollToTop', '回到最前')}
        >
          <ChevronsUp className="w-4 h-4" />
        </button>
        <button
          onClick={scrollToBottom}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 active:bg-slate-700/80 transition-colors"
          title={t('logs.scrollToBottom', '跳到最后')}
        >
          <ChevronsDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// 辅助函数：解析消息 content
function parseContentToBlocks(content: any): ParsedBlock[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  if (Array.isArray(content)) {
    return content.map(item => {
      if (typeof item === 'string') {
        return { type: 'text', text: item };
      }
      if (!item || typeof item !== 'object') {
        return { type: 'unknown' };
      }

      if (item.type === 'text') {
        return { type: 'text', text: item.text || '' };
      }

      if (item.type === 'thinking') {
        return { type: 'thinking', thinking: item.thinking || '' };
      }

      if (item.type === 'tool_use') {
        return {
          type: 'tool_use',
          toolName: item.name,
          toolId: item.id,
          toolInput: item.input
        };
      }

      if (item.type === 'tool_result') {
        let resultData = item.content;
        return {
          type: 'tool_result',
          toolId: item.tool_use_id,
          toolResult: resultData,
          isError: Boolean(item.is_error)
        };
      }

      if (item.type === 'image') {
        const source = item.source || {};
        return {
          type: 'image',
          mediaType: source.media_type,
          data: source.data,
          url: source.url
        };
      }

      if (item.type === 'document') {
        const source = item.source || {};
        return {
          type: 'document',
          mediaType: source.media_type,
          data: source.data,
          url: source.url
        };
      }

      return { type: 'unknown', ...item };
    });
  }

  return [];
}

// 辅助函数：解析 Claude 响应 (支持非流式 JSON 或流式 SSE 数组)
function parseClaudeResponseToBlocks(claudeRes: any): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // 1. 处理非流式响应对象 (type: 'message')
  if (claudeRes && claudeRes.content && Array.isArray(claudeRes.content)) {
    return parseContentToBlocks(claudeRes.content);
  }

  // 2. 处理流式 SSE 事件流数组
  if (Array.isArray(claudeRes)) {
    let accumulatedThinking = '';
    let accumulatedText = '';
    const toolUseMap: Record<number, { name: string; id: string; inputJson: string }> = {};

    claudeRes.forEach((event: any) => {
      if (!event || !event.type) return;

      if (event.type === 'content_block_start') {
        const cb = event.content_block || {};
        const idx = event.index ?? 0;
        if (cb.type === 'thinking') {
          accumulatedThinking += cb.thinking || '';
        } else if (cb.type === 'text') {
          accumulatedText += cb.text || '';
        } else if (cb.type === 'tool_use') {
          toolUseMap[idx] = {
            name: cb.name || '',
            id: cb.id || '',
            inputJson: ''
          };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta || {};
        const idx = event.index ?? 0;
        if (delta.type === 'thinking_delta') {
          accumulatedThinking += delta.thinking || '';
        } else if (delta.type === 'text_delta') {
          accumulatedText += delta.text || '';
        } else if (delta.type === 'input_json_delta') {
          if (!toolUseMap[idx]) {
            toolUseMap[idx] = { name: '', id: '', inputJson: '' };
          }
          toolUseMap[idx].inputJson += delta.partial_json || '';
        }
      }
    });

    if (accumulatedThinking) {
      blocks.push({ type: 'thinking', thinking: accumulatedThinking });
    }

    if (accumulatedText) {
      blocks.push({ type: 'text', text: accumulatedText });
    }

    Object.values(toolUseMap).forEach(tool => {
      let parsedInput: any = tool.inputJson;
      try {
        parsedInput = JSON.parse(tool.inputJson);
      } catch {
        // keep string
      }
      blocks.push({
        type: 'tool_use',
        toolName: tool.name,
        toolId: tool.id,
        toolInput: parsedInput
      });
    });

    return blocks;
  }

  return blocks;
}
