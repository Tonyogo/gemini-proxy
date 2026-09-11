import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { CustomWebAppItem } from '../types/customWebApps';

export interface EmbeddedWebViewProps {
  app: CustomWebAppItem;
  reloadKey?: number;
  isFullscreen?: boolean;
  onBack?: () => void;
  onEditApp?: (app: CustomWebAppItem) => void;
}

export const EmbeddedWebView: React.FC<EmbeddedWebViewProps> = ({
  app,
  reloadKey = 0,
  isFullscreen = false,
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
  }, [reloadKey, app.url]);

  const handleOpenExternal = () => {
    if (typeof window !== 'undefined') {
      window.open(app.url, '_blank');
    }
  };

  return (
    <div
      className={`w-full flex-1 flex flex-col min-h-0 animate-fadeIn ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[var(--bg-canvas)]'
          : 'h-full space-y-2'
      }`}
    >
      {/* Iframe Viewport Container */}
      <div
        className={`relative w-full flex-1 min-h-0 overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)] ${
          isFullscreen ? 'border-0 rounded-none h-full' : 'rounded-2xl shadow-sm h-full'
        }`}
        style={{
          height: '100%',
          minHeight: isFullscreen ? '100%' : '480px',
        }}
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[var(--bg-surface)]/90 backdrop-blur-sm space-y-3 animate-fadeIn">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            <div className="text-xs text-[var(--text-secondary)] font-medium">
              {t('discover.loadingApp', '正在加载应用...')}
            </div>
          </div>
        )}

        {/* Embedded Iframe */}
        <iframe
          key={reloadKey}
          data-testid="embedded-iframe"
          src={app.url}
          title={app.name}
          onLoad={() => setIsLoading(false)}
          className="w-full h-full border-0 bg-white"
          allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; display-capture"
        />
      </div>

      {/* Helper Footer Hint */}
      {!isFullscreen && (
        <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)] rounded-xl shrink-0">
          <div className="flex items-center space-x-1.5 truncate">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">
              {t('discover.mixedContentWarn', '如果无法内嵌显示，请尝试在新窗口打开或启用网关代理。')}
            </span>
          </div>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="text-indigo-500 hover:text-indigo-400 font-medium shrink-0 ml-2"
          >
            {t('discover.openExternal', '在新窗口打开')} &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

export default EmbeddedWebView;
