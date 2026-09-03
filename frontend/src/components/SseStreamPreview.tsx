import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Zap,
  Clock,
  Copy,
  Check,
  Play,
  Pause,
  RotateCcw,
  Layers,
  FileText,
  Activity,
  ArrowDown,
  Code
} from 'lucide-react';
import JsonTreeView from './JsonTreeView';

export default function SseStreamPreview({ streamData }: { streamData: any }) {
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [isPlayingTypewriter, setIsPlayingTypewriter] = useState<boolean>(false);
  const [typewriterText, setTypewriterText] = useState<string>('');
  const [typewriterProgress, setTypewriterProgress] = useState<number>(0);
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const typewriterTimerRef = useRef<any>(null);

  if (!streamData) {
    return <div className="text-slate-500 text-xs italic font-mono p-3">No stream data available</div>;
  }

  // Parse raw SSE text string into array of chunk objects if needed
  let chunks: any[] = [];
  if (Array.isArray(streamData)) {
    chunks = streamData;
  } else if (typeof streamData === 'string') {
    const lines = streamData.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const rawJson = line.replace('data: ', '').trim();
        if (rawJson === '[DONE]') continue;
        try {
          chunks.push(JSON.parse(rawJson));
        } catch {
          // ignore non-json line
        }
      }
    }
  } else {
    chunks = [streamData];
  }

  // Re-assemble full text, thinking chain, and usage tokens
  let fullText = '';
  let fullThinking = '';
  let usage: any = null;

  for (const chunk of chunks) {
    // Claude Stream format
    if (chunk.type === 'content_block_delta') {
      if (chunk.delta?.type === 'text_delta') {
        fullText += chunk.delta.text || '';
      } else if (chunk.delta?.type === 'thinking_delta') {
        fullThinking += chunk.delta.thinking || '';
      }
    } else if (chunk.type === 'message_delta') {
      if (chunk.usage) usage = chunk.usage;
    }

    // Gemini Stream format
    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
      for (const part of chunk.candidates[0].content.parts) {
        if (part.text) {
          fullText += part.text;
        } else if (part.thought) {
          fullThinking += part.thought;
        }
      }
    }
    if (chunk.usageMetadata) {
      usage = chunk.usageMetadata;
    }
  }

  // Calculate rough token count estimation (or usage output tokens)
  const outputTokens = usage?.output_tokens || usage?.candidatesTokenCount || Math.ceil(fullText.length / 4);

  // Helper to extract clean type and preview for each event chunk
  const getChunkAbstract = (chunk: any, idx: number) => {
    // Claude format classification
    if (chunk.type) {
      switch (chunk.type) {
        case 'message_start':
          return {
            type: 'message_start',
            badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            summary: `Model: ${chunk.message?.model || 'unknown'} (starts message)`,
            tokenDelta: chunk.message?.usage?.input_tokens ? `in: ${chunk.message.usage.input_tokens}` : null
          };
        case 'content_block_start':
          return {
            type: 'content_block_start',
            badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
            summary: `Block Start (type: ${chunk.content_block?.type || 'text'})`,
            tokenDelta: null
          };
        case 'content_block_delta':
          if (chunk.delta?.type === 'text_delta') {
            const text = chunk.delta.text || '';
            return {
              type: 'text_delta',
              badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
              summary: text.length > 60 ? `"${text.substring(0, 60)}..."` : `"${text}"`,
              tokenDelta: text.length > 0 ? `+${Math.max(1, Math.round(text.length / 3))}t` : null
            };
          }
          if (chunk.delta?.type === 'thinking_delta') {
            const thinking = chunk.delta.thinking || '';
            return {
              type: 'thinking_delta',
              badgeColor: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
              summary: thinking.length > 60 ? `"${thinking.substring(0, 60)}..."` : `"${thinking}"`,
              tokenDelta: '+thought'
            };
          }
          return {
            type: 'content_block_delta',
            badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
            summary: 'Block Delta update',
            tokenDelta: null
          };
        case 'content_block_stop':
          return {
            type: 'content_block_stop',
            badgeColor: 'bg-slate-700/30 text-slate-400 border-slate-700/40',
            summary: 'Block End',
            tokenDelta: null
          };
        case 'message_delta':
          return {
            type: 'message_delta',
            badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            summary: `Stop Reason: ${chunk.delta?.stop_reason || 'none'} | Output: ${chunk.usage?.output_tokens || 0} tokens`,
            tokenDelta: chunk.usage?.output_tokens ? `${chunk.usage.output_tokens} total` : null
          };
        case 'message_stop':
          return {
            type: 'message_stop',
            badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            summary: 'Stream Ended',
            tokenDelta: 'done'
          };
        default:
          return {
            type: chunk.type,
            badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
            summary: JSON.stringify(chunk).substring(0, 70),
            tokenDelta: null
          };
      }
    }

    // Gemini format classification
    if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
      const part = chunk.candidates[0].content.parts[0];
      if (part.text) {
        return {
          type: 'text_chunk',
          badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          summary: part.text.length > 60 ? `"${part.text.substring(0, 60)}..."` : `"${part.text}"`,
          tokenDelta: `+${Math.max(1, Math.round(part.text.length / 3))}t`
        };
      }
      if (part.thought) {
        return {
          type: 'thinking_chunk',
          badgeColor: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
          summary: part.thought.length > 60 ? `"${part.thought.substring(0, 60)}..."` : `"${part.thought}"`,
          tokenDelta: '+thought'
        };
      }
      if (part.functionCall) {
        return {
          type: 'function_call',
          badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          summary: `Call: ${part.functionCall.name}`,
          tokenDelta: 'tool'
        };
      }
    }

    // Fallback classification
    return {
      type: 'stream_chunk',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      summary: JSON.stringify(chunk).substring(0, 70),
      tokenDelta: null
    };
  };

  const handleCopyFullText = () => {
    try {
      navigator.clipboard.writeText(fullText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch {
      // fallback
    }
  };

  // Typewriter playback simulation
  const handleTogglePlayTypewriter = () => {
    if (isPlayingTypewriter) {
      clearInterval(typewriterTimerRef.current);
      setIsPlayingTypewriter(false);
    } else {
      setIsPlayingTypewriter(true);
      setTypewriterText('');
      setTypewriterProgress(0);

      // Collect all incremental texts
      const textPieces: string[] = [];
      for (const chunk of chunks) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
          textPieces.push(chunk.delta.text || '');
        } else if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.text) textPieces.push(part.text);
          }
        }
      }

      if (textPieces.length === 0) {
        setTypewriterText(fullText);
        setIsPlayingTypewriter(false);
        return;
      }

      let currentIdx = 0;
      let accumulated = '';
      typewriterTimerRef.current = setInterval(() => {
        if (currentIdx < textPieces.length) {
          accumulated += textPieces[currentIdx];
          setTypewriterText(accumulated);
          currentIdx++;
          setTypewriterProgress(Math.round((currentIdx / textPieces.length) * 100));
        } else {
          clearInterval(typewriterTimerRef.current);
          setIsPlayingTypewriter(false);
          setTypewriterProgress(100);
        }
      }, 45);
    }
  };

  const handleResetTypewriter = () => {
    if (typewriterTimerRef.current) {
      clearInterval(typewriterTimerRef.current);
    }
    setIsPlayingTypewriter(false);
    setTypewriterText('');
    setTypewriterProgress(0);
  };

  useEffect(() => {
    return () => {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Top Stream Metric Ribbon Header */}
      <div className="ui-card p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-[var(--text-primary)] text-xs">SSE Stream Assembly</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  {chunks.length} chunks
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Live EventSource timeline with multi-block stream reconstruction
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <div className="px-2.5 py-1 rounded-lg ui-card-sub text-[var(--text-secondary)] flex items-center space-x-1.5">
              <Sparkles className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
              <span>{outputTokens} tokens</span>
            </div>

            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors flex items-center space-x-1.5 ${
                autoScroll
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                  : 'ui-btn-secondary'
              }`}
              title="Auto-scroll to latest chunk"
            >
              <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-blue-400' : 'text-slate-500'}`} />
              <span>Auto-scroll</span>
            </button>
          </div>
        </div>
      </div>

      {/* Assembled Response Card */}
      <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-4 space-y-3 shadow-inner">
        <div className="flex items-center justify-between pb-2 border-b border-emerald-200 dark:border-emerald-800/30">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold text-emerald-700 dark:text-emerald-300 text-xs uppercase tracking-wide">
              Assembled Full Output
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Typewriter Playback Button */}
            <button
              onClick={handleTogglePlayTypewriter}
              className="px-2 py-1 rounded ui-btn-secondary text-[10px] flex items-center space-x-1 transition-colors"
              title={isPlayingTypewriter ? "Pause typewriter" : "Play typewriter simulation"}
            >
              {isPlayingTypewriter ? (
                <>
                  <Pause className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                  <span>{typewriterProgress}%</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Play Replay</span>
                </>
              )}
            </button>

            {typewriterText && !isPlayingTypewriter && (
              <button
                onClick={handleResetTypewriter}
                className="p-1 rounded ui-btn-secondary text-[10px] transition-colors"
                title="Reset simulation view"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}

            {/* Quick Full Text Copy */}
            <button
              onClick={handleCopyFullText}
              className="px-2 py-1 rounded ui-btn-secondary text-[10px] flex items-center space-x-1 transition-colors text-emerald-700 dark:text-emerald-300"
              title="Copy assembled output text"
            >
              {copiedText ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Text</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Thinking Chain (if present) */}
        {fullThinking && (
          <details className="bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 rounded-xl p-3 text-purple-900 dark:text-purple-200 transition-all">
            <summary className="font-bold text-[11px] uppercase cursor-pointer text-purple-700 dark:text-purple-300 flex items-center space-x-1.5 select-none">
              <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
              <span>Thinking Chain ({fullThinking.length} chars)</span>
            </summary>
            <div className="mt-2 font-mono text-[11px] text-purple-950 dark:text-purple-200 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto bg-purple-100/50 dark:bg-purple-950/60 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800/50">
              {fullThinking}
            </div>
          </details>
        )}

        {/* Final Text Message or Typewriter Simulator */}
        {isPlayingTypewriter || typewriterText ? (
          <div className="font-mono text-xs text-[var(--code-text)] leading-relaxed whitespace-pre-wrap bg-[var(--code-bg)] p-3.5 rounded-xl border border-[var(--border-subtle)] relative">
            <div className="text-[10px] font-sans font-semibold text-emerald-600 dark:text-emerald-400 mb-1 flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Simulated Stream Playback ({typewriterProgress}%):</span>
            </div>
            {typewriterText}
            {isPlayingTypewriter && <span className="inline-block w-1.5 h-3.5 bg-emerald-500 dark:bg-emerald-400 ml-0.5 animate-pulse" />}
          </div>
        ) : fullText ? (
          <div className="font-mono text-xs text-[var(--code-text)] leading-relaxed whitespace-pre-wrap bg-[var(--code-bg)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
            {fullText}
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic p-2">No text content in stream</div>
        )}
      </div>

      {/* Chrome DevTools EventSource Style Timeline */}
      <div className="ui-card-sub p-3.5 space-y-2.5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-1.5 text-[var(--text-primary)]">
            <Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>EventSource Timeline ({chunks.length} Events)</span>
          </div>
          <span className="text-[var(--text-muted)] text-[10px] font-mono lowercase">click row to inspect raw payload</span>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {chunks.map((chunk, idx) => {
            const isSelected = selectedChunkIndex === idx;
            const abstract = getChunkAbstract(chunk, idx);
            // Rough simulated delta time for visual flair
            const timeDelta = idx === 0 ? '0ms' : `+${idx * 16}ms`;

            return (
              <div key={idx} className="space-y-1">
                <div
                  onClick={() => setSelectedChunkIndex(isSelected ? null : idx)}
                  className={`p-2 rounded-lg cursor-pointer transition-all font-mono text-[11px] flex items-center justify-between border ${
                    isSelected
                      ? 'bg-indigo-600/20 border-indigo-500/80 text-indigo-200 shadow'
                      : 'ui-card-sub hover:bg-[var(--bg-surface-hover)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <span className="text-slate-500 font-normal w-6 shrink-0 text-[10px]">#{idx + 1}</span>
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold tracking-wide uppercase shrink-0 ${abstract.badgeColor}`}>
                      {abstract.type}
                    </span>
                    <span className="truncate text-slate-400 font-sans text-xs">
                      {abstract.summary}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 text-[10px]">
                    {abstract.tokenDelta && (
                      <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40 text-[9px]">
                        {abstract.tokenDelta}
                      </span>
                    )}
                    <span className="text-slate-500 font-mono text-[9px]">{timeDelta}</span>
                    <span className="text-slate-500 text-[9px] w-3 text-center">{isSelected ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="pl-3 py-1">
                    <JsonTreeView data={chunk} initialExpandedDepth={1} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={timelineEndRef} />
        </div>
      </div>
    </div>
  );
}
