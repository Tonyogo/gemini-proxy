import React from 'react';
import WebTerminalView from './WebTerminalView';

export interface UnifiedTerminalViewProps {
  adminKey: string;
  isStandalone?: boolean;
  onEnterStandalone?: () => void;
  onExitStandalone?: () => void;
}

export type TerminalSubTab = 'interactive' | 'logs';

export default function UnifiedTerminalView({
  adminKey,
  isStandalone,
  onEnterStandalone,
  onExitStandalone,
}: UnifiedTerminalViewProps) {
  return (
    <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col min-h-0 relative">
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
      />
    </div>
  );
}
