import React, { useState } from 'react';
import WebTerminalView from './WebTerminalView';
import TerminalFileManagerView from './terminal/TerminalFileManagerView';
import { TerminalHostSelector } from './terminal/TerminalHostSelector';
import { TerminalSquare, FolderOpen } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  isStandalone?: boolean;
  onEnterStandalone?: () => void;
  onExitStandalone?: () => void;
}

export type TerminalSubTab = 'interactive' | 'files';

export default function UnifiedTerminalView({
  adminKey,
  isStandalone,
  onEnterStandalone,
  onExitStandalone,
}: UnifiedTerminalViewProps) {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<TerminalSubTab>('interactive');
  const [activeHostId, setActiveHostId] = useState<string>(() => {
    return localStorage.getItem('terminal_active_host') || 'local';
  });

  const handleHostChange = (newHostId: string) => {
    setActiveHostId(newHostId);
    localStorage.setItem('terminal_active_host', newHostId);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
      {/* Unified Top Control Bar */}
      <div className="ui-card p-2 sm:p-2.5 flex items-center justify-between gap-2 relative z-30 shrink-0 mb-2">
        <div className="flex items-center space-x-2">
          {/* Host Node Selector */}
          <TerminalHostSelector
            adminKey={adminKey}
            activeHostId={activeHostId}
            onSelectHost={handleHostChange}
          />

          <div className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />

          {/* SubTab Toggle Pills */}
          <div className="flex items-center p-0.5 rounded-xl bg-[var(--bg-surface-sub)] border border-[var(--border-subtle)]">
            <button
              onClick={() => setSubTab('interactive')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                subTab === 'interactive'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TerminalSquare className="w-3.5 h-3.5" />
              <span>{t('terminal.interactiveTab', '命令行终端')}</span>
            </button>
            <button
              onClick={() => setSubTab('files')}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                subTab === 'files'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t('files.title', '文件管理')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="flex-1 min-h-0 flex flex-col">
        {subTab === 'interactive' ? (
          <WebTerminalView
            adminKey={adminKey}
            standalone={Boolean(isStandalone)}
            onExitStandalone={onExitStandalone}
            onToggleStandalone={(val) => {
              if (val && onEnterStandalone) {
                onEnterStandalone();
              } else if (!val && onExitStandalone) {
                onExitStandalone();
              }
            }}
            controlledHostId={activeHostId}
            onControlledHostChange={handleHostChange}
            hideInnerHostSelector={true}
          />
        ) : (
          <TerminalFileManagerView
            adminKey={adminKey}
            activeHostId={activeHostId}
          />
        )}
      </div>
    </div>
  );
}
