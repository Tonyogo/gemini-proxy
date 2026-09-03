import React, { useState, useEffect } from 'react';
import WebTerminalView from './WebTerminalView';
import TerminalLogsView from './TerminalLogsView';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  onEnterStandalone?: () => void;
}

export type TerminalSubTab = 'interactive' | 'logs';

export default function UnifiedTerminalView({
  adminKey,
  onEnterStandalone,
}: UnifiedTerminalViewProps) {
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
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
      {/* Keep-Alive Managed Views Container */}
      <div className="w-full flex-1 flex flex-col min-h-0 relative">
        {/* Interactive Web Terminal View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'interactive' ? '' : 'hidden'}`}>
          <WebTerminalView
            adminKey={adminKey}
            standalone={false}
            subTab={subTab}
            onSubTabChange={handleSubTabChange}
            onToggleStandalone={(val) => {
              if (val && onEnterStandalone) {
                onEnterStandalone();
              }
            }}
          />
        </div>

        {/* Terminal Logs SSE Stream View */}
        <div className={`w-full flex-1 flex flex-col min-h-0 ${subTab === 'logs' ? '' : 'hidden'}`}>
          <TerminalLogsView
            adminKey={adminKey}
            subTab={subTab}
            onSubTabChange={handleSubTabChange}
          />
        </div>
      </div>
    </div>
  );
}
