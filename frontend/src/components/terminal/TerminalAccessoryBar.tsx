import React from 'react';
import {
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Keyboard,
  Sparkles
} from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface TerminalAccessoryBarProps {
  onSendInput: (data: string) => void;
  isCtrlActive: boolean;
  onToggleCtrl: () => void;
  isAltActive: boolean;
  onToggleAlt: () => void;
  onToggleKeyboard: () => void;
  onOpenSnippets: () => void;
}

export const TerminalAccessoryBar: React.FC<TerminalAccessoryBarProps> = ({
  onSendInput,
  isCtrlActive,
  onToggleCtrl,
  isAltActive,
  onToggleAlt,
  onToggleKeyboard,
  onOpenSnippets,
}) => {
  const { t } = useTranslation();

  const handleKeyClick = (key: string, rawCode: string) => {
    if (isCtrlActive) {
      onToggleCtrl();
      // Handle Ctrl + key
      const charCode = key.toUpperCase().charCodeAt(0);
      if (charCode >= 64 && charCode <= 95) {
        onSendInput(String.fromCharCode(charCode - 64));
        return;
      }
    }
    if (isAltActive) {
      onToggleAlt();
      onSendInput(`\x1b${key}`);
      return;
    }
    onSendInput(rawCode);
  };

  return (
    <div className="bg-[#0C0E14] border-t border-white/[0.08] px-2 py-1.5 flex items-center justify-between gap-1 select-none overflow-x-auto scrollbar-none z-20">
      {/* Scrollable Accessory Key Row */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
        {/* Modifier: ESC */}
        <button
          type="button"
          onClick={() => onSendInput('\x1b')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 hover:text-white font-mono text-xs font-semibold border border-white/[0.08] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.esc')}
        </button>

        {/* Modifier: TAB */}
        <button
          type="button"
          onClick={() => onSendInput('\t')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 hover:text-white font-mono text-xs font-semibold border border-white/[0.08] transition-all shadow-sm"
        >
          {t('webTerminal.accessoryKeys.tab')}
        </button>

        {/* Sticky Modifier: CTRL */}
        <button
          type="button"
          onClick={onToggleCtrl}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isCtrlActive
              ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]'
              : 'bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white border-white/[0.08]'
          }`}
        >
          {t('webTerminal.accessoryKeys.ctrl')}
        </button>

        {/* Sticky Modifier: ALT */}
        <button
          type="button"
          onClick={onToggleAlt}
          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all shadow-sm active:scale-95 ${
            isAltActive
              ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.5)]'
              : 'bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 hover:text-white border-white/[0.08]'
          }`}
        >
          {t('webTerminal.accessoryKeys.alt')}
        </button>

        {/* Action: Ctrl+C */}
        <button
          type="button"
          onClick={() => onSendInput('\x03')}
          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 font-mono text-xs font-semibold border border-rose-500/30 transition-all"
          title="SIGINT (Ctrl+C)"
        >
          ^C
        </button>

        {/* Action: Ctrl+D */}
        <button
          type="button"
          onClick={() => onSendInput('\x04')}
          className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 text-amber-400 font-mono text-xs font-semibold border border-amber-500/30 transition-all"
          title="EOF (Ctrl+D)"
        >
          ^D
        </button>

        {/* Action: Ctrl+L */}
        <button
          type="button"
          onClick={() => onSendInput('\x0c')}
          className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 font-mono text-xs font-semibold border border-white/[0.08] transition-all"
          title="Clear Screen (Ctrl+L)"
        >
          ^L
        </button>

        {/* Quick Characters: |, /, -, ~, $, \\ */}
        {['|', '/', '-', '~', '$', '\\'].map((char) => (
          <button
            key={char}
            type="button"
            onClick={() => handleKeyClick(char, char)}
            className="w-7 h-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] active:scale-95 text-slate-300 font-mono text-xs flex items-center justify-center border border-white/[0.06] transition-all"
          >
            {char}
          </button>
        ))}

        {/* Arrow Keys: Up, Down, Left, Right */}
        <button
          type="button"
          onClick={() => onSendInput('\x1b[A')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Up Arrow"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[B')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Down Arrow"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[D')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Left Arrow"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onSendInput('\x1b[C')}
          className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] active:scale-95 text-slate-300 flex items-center justify-center border border-white/[0.08] transition-all"
          title="Right Arrow"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right Fixed Controls: Snippets & Keyboard Toggle */}
      <div className="flex items-center space-x-1 pl-1 border-l border-white/[0.08] shrink-0">
        <button
          type="button"
          onClick={onOpenSnippets}
          className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-500/20 to-purple-500/20 hover:from-indigo-500/30 hover:to-purple-500/30 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1 text-xs font-medium transition-all shadow-sm active:scale-95"
          title={t('webTerminal.snippets')}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">{t('webTerminal.snippets')}</span>
        </button>

        <button
          type="button"
          onClick={onToggleKeyboard}
          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 border border-white/[0.08] transition-all active:scale-95"
          title="Toggle Keyboard Focus"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
