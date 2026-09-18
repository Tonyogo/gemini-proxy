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

    // 1. 提取 System Prompt (支持 Claude clientReq.system 或 Gemini clientReq.systemInstruction)
    let extractedSystem = '';
    if (clientReq.system) {
      if (typeof clientReq.system === 'string') {
        extractedSystem = clientReq.system;
      } else if (Array.isArray(clientReq.system)) {
        extractedSystem = clientReq.system
          .map((s: any) => (typeof s === 'string' ? s : s.text || ''))
          .join('\n\n');
      }
    } else if (clientReq.systemInstruction) {
      if (typeof clientReq.systemInstruction === 'string') {
        extractedSystem = clientReq.systemInstruction;
      } else if (clientReq.systemInstruction.parts && Array.isArray(clientReq.systemInstruction.parts)) {
        extractedSystem = clientReq.systemInstruction.parts
          .map((p: any) => p.text || '')
          .filter(Boolean)
          .join('\n\n');
      }
    }

    // 2. 解析客户端消息列表 (Claude client_req.messages 或 Gemini client_req.contents)
    const messages: ChatMessage[] = [];
    if (Array.isArray(clientReq.messages)) {
      clientReq.messages.forEach((msg: any) => {
        const role = msg.role === 'assistant' ? 'assistant' : 'user';
        const blocks = parseContentToBlocks(msg.content);
        messages.push({ role, blocks, raw: msg });
      });
    } else if (Array.isArray(clientReq.contents)) {
      clientReq.contents.forEach((contentItem: any) => {
        const role = contentItem.role === 'model' || contentItem.role === 'assistant' ? 'assistant' : 'user';
        const blocks = parseGeminiPartsToBlocks(contentItem.parts);
        messages.push({ role, blocks, raw: contentItem });
      });
    }

    // 3. 解析当前轮次助手的响应 (claude_res / gem_res) 并追加至末尾
    if (claudeRes) {
      const assistantBlocks = parseAssistantResponseToBlocks(claudeRes);
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
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 text-xs space-y-2 font-mono ui-card-sub rounded-2xl border border-[var(--border-subtle)] p-6">
        <AlertCircle className="w-8 h-8 text-amber-500/60" />
        <span className="text-[var(--text-primary)] font-semibold">{t('logs.noMessages', 'No conversation messages in this log.')}</span>
        <span className="text-[11px] text-[var(--text-secondary)] text-center max-w-sm">
          This request might be a token count endpoint, models list, or did not supply standard Claude Messages API structure.
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col space-y-4 pb-8 max-w-5xl mx-auto w-full min-w-0 relative">
      {/* System Prompt Collapsible Card */}
      {systemPrompt && (
        <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-500/25 bg-indigo-50/40 dark:bg-indigo-950/15 overflow-hidden font-mono text-xs transition-all shadow-xs min-w-0">
          <div
            onClick={() => setSystemExpanded(!systemExpanded)}
            className="flex items-center justify-between px-3.5 py-2.5 bg-indigo-100/40 dark:bg-indigo-500/10 cursor-pointer hover:bg-indigo-100/70 dark:hover:bg-indigo-500/15 transition-colors select-none text-indigo-700 dark:text-indigo-300"
          >
            <div className="flex items-center space-x-2 min-w-0">
              {systemExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="font-semibold tracking-wide truncate">{t('logs.systemPrompt', 'System Prompt')}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-200/50 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-200 border border-indigo-300/60 dark:border-indigo-500/30 font-mono shrink-0">
                {systemPrompt.length.toLocaleString()} chars
              </span>
            </div>

            <button
              onClick={handleCopySystem}
              className="flex items-center space-x-1 text-indigo-700/80 dark:text-indigo-300/80 hover:text-indigo-900 dark:hover:text-indigo-100 text-[10px] px-2 py-1 rounded-md bg-indigo-200/50 dark:bg-indigo-500/15 hover:bg-indigo-200/80 dark:hover:bg-indigo-500/25 transition-colors shrink-0 ml-2"
              title="Copy system prompt"
            >
              {copiedSystem ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copiedSystem ? t('logs.messageCopied', 'Copied!') : t('logs.copyMessage', 'Copy')}</span>
            </button>
          </div>

          {systemExpanded && (
            <div className="p-4 bg-[var(--code-bg)] border-t border-[var(--border-subtle)] text-[var(--code-text)] max-h-96 overflow-y-auto leading-relaxed min-w-0">
              <MarkdownContent content={systemPrompt} />
            </div>
          )}
        </div>
      )}

      {/* Messages Timeline */}
      <div className="space-y-4 pb-6 min-w-0 w-full">
        {conversationMessages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}
      </div>

      {/* Floating Scroll Navigation */}
      <div className="sticky bottom-4 self-end flex flex-col space-y-1.5 z-20 bg-[var(--bg-surface)]/85 backdrop-blur-xl p-1.5 rounded-2xl border border-[var(--border-subtle)] shadow-xl">
        <button
          onClick={scrollToTop}
          className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all active:scale-95"
          title={t('logs.scrollToTop', '回到最前')}
        >
          <ChevronsUp className="w-4 h-4" />
        </button>
        <button
          onClick={scrollToBottom}
          className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-all active:scale-95"
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

// 辅助函数：解析 Gemini 原生 parts
function parseGeminiPartsToBlocks(parts: any): ParsedBlock[] {
  if (!Array.isArray(parts)) return [];
  const blocks: ParsedBlock[] = [];

  parts.forEach(part => {
    if (!part || typeof part !== 'object') return;
    if (part.thought) {
      blocks.push({ type: 'thinking', thinking: part.thought });
    } else if (part.text) {
      blocks.push({ type: 'text', text: part.text });
    } else if (part.functionCall) {
      blocks.push({
        type: 'tool_use',
        toolName: part.functionCall.name,
        toolInput: part.functionCall.args
      });
    } else if (part.functionResponse) {
      blocks.push({
        type: 'tool_result',
        toolName: part.functionResponse.name,
        toolResult: part.functionResponse.response
      });
    } else if (part.inlineData) {
      blocks.push({
        type: 'image',
        mediaType: part.inlineData.mimeType,
        data: part.inlineData.data
      });
    }
  });

  return blocks;
}

// 辅助函数：解析助手响应 (支持 Claude 格式或 Gemini 原生格式，流式或非流式)
function parseAssistantResponseToBlocks(resData: any): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];

  // 1. 处理 Claude 非流式响应对象 (type: 'message')
  if (resData && resData.content && Array.isArray(resData.content)) {
    return parseContentToBlocks(resData.content);
  }

  // 2. 处理 Gemini 原生非流式响应对象 (candidates[0].content.parts)
  if (resData && resData.candidates && Array.isArray(resData.candidates) && resData.candidates[0]?.content?.parts) {
    return parseGeminiPartsToBlocks(resData.candidates[0].content.parts);
  }

  // 3. 处理流式数组 (可以是 Claude SSE 事件数组，也可以是 Gemini Stream chunk 数组)
  if (Array.isArray(resData)) {
    // 检查是否为 Gemini 原生 chunk 数组
    const isGeminiChunks = resData.some((chunk: any) => chunk && chunk.candidates);
    if (isGeminiChunks) {
      let accumulatedThinking = '';
      let accumulatedText = '';
      const toolCalls: any[] = [];

      resData.forEach((chunk: any) => {
        if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.thought) {
              accumulatedThinking += part.thought;
            } else if (part.text) {
              accumulatedText += part.text;
            }
            if (part.functionCall) {
              toolCalls.push(part.functionCall);
            }
          }
        }
      });

      if (accumulatedThinking) {
        blocks.push({ type: 'thinking', thinking: accumulatedThinking });
      }
      if (accumulatedText) {
        blocks.push({ type: 'text', text: accumulatedText });
      }
      toolCalls.forEach(tc => {
        blocks.push({
          type: 'tool_use',
          toolName: tc.name,
          toolInput: tc.args
        });
      });

      return blocks;
    }

    // 否则按 Claude SSE 事件流数组处理
    let accumulatedThinking = '';
    let accumulatedText = '';
    const toolUseMap: Record<number, { name: string; id: string; inputJson: string }> = {};

    resData.forEach((event: any) => {
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
