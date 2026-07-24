import React, { useState } from 'react';
import JsonTreeView from './JsonTreeView';

export default function SseStreamPreview({ streamData }: { streamData: any }) {
  const [selectedChunkIndex, setSelectedChunkIndex] = useState<number | null>(null);

  if (!streamData) {
    return <div className="text-slate-500 text-xs italic font-mono p-2">No stream data available</div>;
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

  // Helper to extract clean type and preview for each event chunk
  const getChunkAbstract = (chunk: any) => {
    // Claude format classification
    if (chunk.type) {
      switch (chunk.type) {
        case 'message_start':
          return {
            type: 'message_start',
            badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            summary: `Model: ${chunk.message?.model || 'unknown'} (starts message)`
          };
        case 'content_block_start':
          return {
            type: 'content_block_start',
            badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
            summary: `Block Start (type: ${chunk.content_block?.type || 'text'})`
          };
        case 'content_block_delta':
          if (chunk.delta?.type === 'text_delta') {
            return {
              type: 'text_delta',
              badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
              summary: `Text: "${chunk.delta.text}"`
            };
          }
          if (chunk.delta?.type === 'thinking_delta') {
            return {
              type: 'thinking_delta',
              badgeColor: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
              summary: `Thinking: "${chunk.delta.thinking}"`
            };
          }
          return {
            type: 'content_block_delta',
            badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
            summary: 'Block Delta update'
          };
        case 'content_block_stop':
          return {
            type: 'content_block_stop',
            badgeColor: 'bg-slate-700/30 text-slate-400 border-slate-700/40',
            summary: 'Block End'
          };
        case 'message_delta':
          return {
            type: 'message_delta',
            badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            summary: `Stop Reason: ${chunk.delta?.stop_reason || 'none'} | Output: ${chunk.usage?.output_tokens || 0} tokens`
          };
        case 'message_stop':
          return {
            type: 'message_stop',
            badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            summary: 'Stream Ended'
          };
        default:
          return {
            type: chunk.type,
            badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
            summary: JSON.stringify(chunk)
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
          summary: `Text: "${part.text}"`
        };
      }
      if (part.thought) {
        return {
          type: 'thinking_chunk',
          badgeColor: 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30',
          summary: `Thought: "${part.thought}"`
        };
      }
      if (part.functionCall) {
        return {
          type: 'function_call',
          badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          summary: `Call: ${part.functionCall.name}`
        };
      }
    }

    // Fallback classification
    return {
      type: 'stream_chunk',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      summary: JSON.stringify(chunk)
    };
  };

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Assembled Response Summary Card */}
      <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-emerald-800/40">
          <span className="font-bold text-emerald-400 text-xs uppercase flex items-center space-x-1.5">
            <span>✨</span>
            <span>Assembled Full Stream Response</span>
          </span>
          {usage && (
            <span className="font-mono text-[10px] text-emerald-300/80 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/50">
              {usage.output_tokens ? `Out Tokens: ${usage.output_tokens}` : `Candidates Tokens: ${usage.candidatesTokenCount || 'N/A'}`}
            </span>
          )}
        </div>

        {/* Thinking Chain (if present) */}
        {fullThinking && (
          <details className="bg-purple-950/40 border border-purple-800/50 rounded-xl p-3 text-purple-200">
            <summary className="font-bold text-[11px] uppercase cursor-pointer text-purple-400">
              💭 Complete Thinking Process ({fullThinking.length} chars)
            </summary>
            <div className="mt-2 font-mono text-[11px] text-purple-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
              {fullThinking}
            </div>
          </details>
        )}

        {/* Final Text Message */}
        {fullText ? (
          <div className="font-mono text-xs text-slate-100 leading-relaxed whitespace-pre-wrap bg-slate-950/80 p-3 rounded-lg border border-slate-800">
            {fullText}
          </div>
        ) : (
          <div className="text-slate-500 text-xs italic">No text content streamed</div>
        )}
      </div>

      {/* Chrome DevTools EventSource Style Timeline */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>EventSource Chunks Stream ({chunks.length} events)</span>
          <span className="text-slate-500 text-[9px] font-normal">Click a chunk to inspect payload</span>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {chunks.map((chunk, idx) => {
            const isSelected = selectedChunkIndex === idx;
            const abstract = getChunkAbstract(chunk);

            return (
              <div key={idx} className="space-y-1">
                <div
                  onClick={() => setSelectedChunkIndex(isSelected ? null : idx)}
                  className={`p-2 rounded-lg cursor-pointer transition-colors font-mono text-[10px] flex items-center justify-between border ${
                    isSelected
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200 font-bold'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <span className="flex items-center space-x-2 truncate">
                    <span className="text-slate-500 font-normal">#{idx + 1}</span>
                    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold tracking-wide uppercase ${abstract.badgeColor}`}>
                      {abstract.type}
                    </span>
                    <span className="truncate text-slate-400 font-sans font-medium">
                      {abstract.summary}
                    </span>
                  </span>
                  <span className="text-slate-500 text-[9px]">{isSelected ? '▲' : '▼'}</span>
                </div>

                {isSelected && (
                  <div className="pl-3 py-1">
                    <JsonTreeView data={chunk} initialExpandedDepth={2} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
