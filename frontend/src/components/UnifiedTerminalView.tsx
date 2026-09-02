import React, { useState, useEffect } from 'react';
import { TerminalSquare, FileText, Maximize2 } from 'lucide-react';
import WebTerminalView from './WebTerminalView';
import TerminalLogsView from './TerminalLogsView';
import { useTranslation } from '../i18n/LanguageContext';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  onEnterStandalone?: () => void;
}

export type TerminalSubTab = 'interactive' | 'logs';

export default function UnifiedTerminalView({
  adminKey,
  onEnterStandalone,
}: UnifiedTerminalViewProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<TerminalSubTab>(() => {
    const saved = localStorage.getItem('terminal_sub_tab');
    return saved === 'logs' ? 'logs' : 'interactive';
  });

  const handleSubTabChange = (tab: TerminalSubTab) => {
    setSubTab(tab);
    localStorage.setItem('terminal_sub_tab', tab);
    if (tab === 'interactive') {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 50);
      });
    }
  };

  useEffect(() => {
    if (subTab === 'interactive') {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [subTab]);

  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 space-y-2 sm:space-y-3">
      {/* Sub-tab Navigation Pill Switcher */}
      <div className="flex items-center justify-between px-2 sm:px-0 shrink-0">
        <div className="flex items-center p-0.5 sm:p-1 bg-[#10121A] rounded-xl border border-white/[0.08] shadow-sm">
          <button
            type="button"
            onClick={() => handleSubTabChange('interactive')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
              subTab === 'interactive'
                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <TerminalSquare className="w-3.5 h-3.5" />
            <span>{t('terminal.interactiveTab')}</span>
          </button>
          <button
            type="button"
            onClick={() => handleSubTabChange('logs')}
            className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
              subTab === 'logs'
                ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(99,102,241,0.35)]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('terminal.logsTab')}</span>
          </button>
        </div>

        {/* Standalone Fullscreen Action (Desktop, when interactive) */}
        {onEnterStandalone && subTab === 'interactive' && (
          <button
            type="button"
            onClick={onEnterStandalone}
            title={t('webTerminal.fullscreen')}
            className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] text-xs transition-all active:scale-95"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px]">{t('webTerminal.fullscreen')}</span>
          </button>
        )}
      </div>

      {/* Keep-Alive Managed Views Container */}
      <div className="w-full flex-1 flex flex-col min-h-0 relative">
        {/* Interactive Web Terminal View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'interactive' ? '' : 'hidden'}`}>
          <WebTerminalView
            adminKey={adminKey}
            standalone={false}
            onToggleStandalone={(val) => {
              if (val && onEnterStandalone) {
                onEnterStandalone();
              }
            }}
          />
        </div>

        {/* Terminal Logs SSE Stream View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'logs' ? '' : 'hidden'}`}>
          <TerminalLogsView adminKey={adminKey} />
        </div>
      </div>
    </div>
  );
}
