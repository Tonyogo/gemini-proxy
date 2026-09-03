import React from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Keyboard,
  Sparkles,
  Check
} from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface TerminalAccessoryBarProps {
  onSendInput: (data: string) => void;
  isCtrlActive: boolean;
  onToggleCtrl: () => void;
  isAltActive: boolean;
  onToggleAlt: () => void;
  onToggleKeyboard: () => void;
  onHideKeyboard?: () => void;
  isKeyboardOpen?: boolean;
  onOpenSnippets: () => void;
}

export const TerminalAccessoryBar: React.FC<TerminalAccessoryBarProps> = ({
  onSendInput,
  isCtrlActive,
  onToggleCtrl,
  isAltActive,
  onToggleAlt,
  onToggleKeyboard,
  onHideKeyboard,
  isKeyboardOpen,
  onOpenSnippets,
}) => {
  const { t } = useTranslation();

  return (
    <div className="bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] px-2 py-1.5 flex items-center justify-between gap-1 select-none overflow-x-auto scrollbar-none z-20">
      {/* Scrollable Accessory Key Row */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* Modifier: ESC */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x1b')}
          className="px-2.5 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] font-mono text-xs font-semibold border border-[var(--border-subtle)] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.esc')}
        </button>

        {/* Modifier: TAB */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\t')}
          className="px-2.5 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] font-mono text-xs font-semibold border border-[var(--border-subtle)] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.tab')}
        </button>

        {/* Sticky Modifier: CTRL */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleCtrl}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isCtrlActive
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
              : 'bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[var(--text-primary)] border-[var(--border-subtle)]'
          }`}
        >
          {t('webTerminal.accessoryKeys.ctrl')}
        </button>

        {/* Sticky Modifier: ALT */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleAlt}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isAltActive
              ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
              : 'bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[var(--text-primary)] border-[var(--border-subtle)]'
          }`}
        >
          {t('webTerminal.accessoryKeys.alt')}
        </button>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)] mx-0.5" />

        {/* Action: Ctrl+C */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x03')}
          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-500 dark:text-rose-400 font-mono text-xs font-semibold border border-rose-500/30 transition-all"
          title="SIGINT (Ctrl+C)"
        >
          ^C
        </button>

        {/* Action: Ctrl+D */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x04')}
          className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-500 dark:text-amber-400 font-mono text-xs font-semibold border border-amber-500/30 transition-all"
          title="EOF (Ctrl+D)"
        >
          ^D
        </button>

        {/* Action: Ctrl+L */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x0c')}
          className="px-2 py-1 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] font-mono text-xs font-semibold border border-[var(--border-subtle)] transition-all"
          title="Clear Screen (Ctrl+L)"
        >
          ^L
        </button>

        {/* Action: Ctrl+B (tmux Prefix) */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x02')}
          className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 text-emerald-500 dark:text-emerald-400 font-mono text-xs font-semibold border border-emerald-500/30 transition-all"
          title="tmux Prefix (Ctrl+B)"
        >
          ^B
        </button>

        <div className="h-4 w-[1px] bg-[var(--border-subtle)] mx-0.5" />

        {/* Quick Enter Key */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\r')}
          className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 active:scale-95 text-indigo-500 dark:text-indigo-300 font-mono text-xs font-semibold border border-indigo-500/30 transition-all shadow-sm"
          title="Enter (Return)"
        >
          ↵
        </button>

        {/* Arrow Keys: Up, Down, Left, Right */}
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x1b[A')}
          className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-subtle)] transition-all"
          title="Up Arrow"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x1b[B')}
          className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-subtle)] transition-all"
          title="Down Arrow"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x1b[D')}
          className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-subtle)] transition-all"
          title="Left Arrow"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSendInput('\x1b[C')}
          className="w-7 h-7 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] flex items-center justify-center border border-[var(--border-subtle)] transition-all"
          title="Right Arrow"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right Fixed Controls: Snippets, Keyboard Toggle & Done/Checkmark Dismiss */}
      <div className="flex items-center space-x-1 pl-1 border-l border-[var(--border-subtle)] shrink-0">
        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenSnippets}
          className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-500 dark:text-indigo-300 border border-indigo-500/30 flex items-center space-x-1 text-xs font-medium transition-all shadow-sm active:scale-95"
          title={t('webTerminal.snippets')}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{t('webTerminal.snippets')}</span>
        </button>

        <button
          type="button"
          onTouchStart={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleKeyboard}
          className={`p-1.5 rounded-lg border transition-all active:scale-95 ${
            isKeyboardOpen
              ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-500/40 shadow-sm'
              : 'bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[var(--text-primary)] border-[var(--border-subtle)]'
          }`}
          title={isKeyboardOpen ? t('webTerminal.hideKeyboard') : t('webTerminal.showKeyboard')}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        {/* Dedicated Dismiss Checkmark Button (打勾收起软键盘 / 完成) */}
        <button
          type="button"
          onClick={onHideKeyboard || onToggleKeyboard}
          className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 flex items-center space-x-1 transition-all shadow-sm cursor-pointer"
          title={t('webTerminal.hideKeyboard')}
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="text-[11px] font-semibold">{t('webTerminal.done')}</span>
        </button>
      </div>
    </div>
  );
};
