import React, { useState } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface ThinkingBlockProps {
  thinking: string;
  defaultExpanded?: boolean;
}

export default function ThinkingBlock({ thinking, defaultExpanded = false }: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  if (!thinking || !thinking.trim()) return null;

  const charCount = thinking.length;
  const formattedCount = t('logs.thinkingChars', `${charCount} chars`).replace('{count}', charCount.toLocaleString());

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thinking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden transition-all text-xs font-mono">
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-2 bg-amber-500/10 cursor-pointer hover:bg-amber-500/15 transition-colors select-none text-amber-300"
      >
        <div className="flex items-center space-x-2">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-semibold">{t('logs.thinking', 'Thinking Process')}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
            {formattedCount}
          </span>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-amber-300/70 hover:text-amber-200 text-[10px] px-1.5 py-0.5 rounded hover:bg-amber-500/20 transition-colors"
          title="Copy thinking"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? t('logs.messageCopied', 'Copied!') : t('logs.copyMessage', 'Copy')}</span>
        </button>
      </div>

      {expanded && (
        <div className="p-3 bg-slate-950/60 border-t border-amber-500/20 text-slate-300 text-[11px] font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}
