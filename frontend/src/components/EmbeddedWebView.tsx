import React, { useState } from 'react';
import {
  ChevronLeft,
  RefreshCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  Edit3,
  Lock,
  Globe,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { CustomWebAppItem } from '../types/customWebApps';

export interface EmbeddedWebViewProps {
  app: CustomWebAppItem;
  onBack: () => void;
  onEditApp?: (app: CustomWebAppItem) => void;
}

export const EmbeddedWebView: React.FC<EmbeddedWebViewProps> = ({
  app,
  onBack,
  onEditApp,
}) => {
  const { t } = useTranslation();
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getHostname = (rawUrl: string) => {
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setReloadKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    if (typeof window !== 'undefined') {
      window.open(app.url, '_blank');
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const hostname = getHostname(app.url);
  const isHttps = app.url.startsWith('https://');

  return (
    <div
      className={`w-full flex flex-col animate-fadeIn ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[var(--bg-canvas)]'
          : 'space-y-3 pb-8'
      }`}
    >
      {/* Top Navigation & Controls Toolbar */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm">
        {/* Left: Back button & App identity */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <button
            type="button"
            data-testid="embed-back-btn"
            onClick={onBack}
            className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors shrink-0"
            title={t('discover.backToDiscover', '返回发现')}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{t('discover.backToDiscover', '返回发现')}</span>
          </button>

          <div className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block shrink-0" />

          <div className="flex items-center space-x-2.5 min-w-0">
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br ${
                app.color || 'from-orange-500 to-amber-600'
              } flex items-center justify-center text-white shrink-0 shadow-sm`}
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                {app.name}
              </div>
              <div className="flex items-center space-x-1 text-[10px] text-[var(--text-muted)] truncate">
                {isHttps ? (
                  <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                )}
                <span className="font-mono truncate">{hostname}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          <button
            type="button"
            data-testid="embed-refresh-btn"
            onClick={handleRefresh}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
            title={t('discover.refresh', '刷新')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            data-testid="embed-open-external-btn"
            onClick={handleOpenExternal}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
            title={t('discover.openExternal', '在新窗口打开')}
          >
            <ExternalLink className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="embed-fullscreen-btn"
            onClick={toggleFullscreen}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
            title={
              isFullscreen
                ? t('discover.exitFullscreen', '退出全屏')
                : t('discover.fullscreen', '全屏沉浸')
            }
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onEditApp && (
            <button
              type="button"
              data-testid="embed-edit-btn"
              onClick={() => onEditApp(app)}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
              title={t('discover.editCustomApp', '编辑应用')}
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Iframe Viewport Container */}
      <div
        className={`relative w-full overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)] ${
          isFullscreen ? 'flex-1 border-0 rounded-none' : 'rounded-2xl shadow-sm'
        }`}
        style={{
          height: isFullscreen ? '100%' : 'calc(100vh - 170px)',
          minHeight: '480px',
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
        <div className="flex items-center justify-between px-3 py-2 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)]/50 border border-[var(--border-subtle)] rounded-xl">
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
