import React, { useState } from 'react';
import { Wrench, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface ToolCallCardProps {
  type: 'call' | 'result';
  name: string;
  id?: string;
  content: any;
  isError?: boolean;
}

export default function ToolCallCard({ type, name, id, content, isError = false }: ToolCallCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const isCall = type === 'call';
  const headerTitle = isCall
    ? t('logs.toolCall', `Tool Call: ${name}`).replace('{name}', name)
    : t('logs.toolResult', `Tool Result: ${name}`).replace('{name}', name);

  const formattedContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(formattedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`my-2 rounded-xl border overflow-hidden font-mono text-xs transition-all ${
      isCall
        ? 'border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/20'
        : isError
        ? 'border-rose-200 dark:border-rose-500/40 bg-rose-50/50 dark:bg-rose-950/20'
        : 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20'
    }`}>
      <div
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors select-none ${
          isCall
            ? 'bg-indigo-100/60 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200/60 dark:hover:bg-indigo-500/15'
            : isError
            ? 'bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-200/60 dark:hover:bg-rose-500/20'
            : 'bg-emerald-100/60 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/60 dark:hover:bg-emerald-500/15'
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          {isCall ? (
            <Wrench className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          ) : isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold truncate">{headerTitle}</span>
          {id && <span className="text-[9px] text-slate-500 truncate max-w-[120px]">{id}</span>}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-[10px] px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-slate-800/50 transition-colors shrink-0 ml-2"
          title="Copy content"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? t('logs.messageCopied', 'Copied!') : t('logs.copyMessage', 'Copy')}</span>
        </button>
      </div>

      {expanded && (
        <div className="p-3 bg-[var(--code-bg)] border-t border-[var(--border-subtle)] max-h-80 overflow-y-auto">
          <pre className="text-[11px] leading-relaxed text-[var(--code-text)] font-mono whitespace-pre-wrap m-0">
            <code>{formattedContent}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
