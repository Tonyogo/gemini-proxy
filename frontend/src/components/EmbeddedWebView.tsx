import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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

  return (
    <div
      className={`w-full flex-1 flex flex-col min-h-0 animate-fadeIn ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[var(--bg-canvas)]'
          : 'h-full'
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
    </div>
  );
};

export default EmbeddedWebView;
