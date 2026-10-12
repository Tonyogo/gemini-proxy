import React, { useState } from 'react';
import {
  FileText,
  Play,
  Languages,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Globe,
  Plus,
  Settings2,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { DiscoverAppItem } from '../types/discoverApps';
import { CustomWebAppItem } from '../types/customWebApps';
import {
  loadDiscoverApps,
  saveOrUpdateCustomApp,
  deleteCustomApp,
} from '../utils/discoverAppsStorage';
import DiscoverConfigModal from './DiscoverConfigModal';
import CustomWebAppModal from './CustomWebAppModal';

export type DiscoverToolId = 'systemLogs' | 'playground' | 'translate';

export interface DiscoverHubViewProps {
  adminKey: string;
  onSelectTool: (tool: DiscoverToolId) => void;
  onSelectCustomApp?: (app: CustomWebAppItem) => void;
}

export const DiscoverHubView: React.FC<DiscoverHubViewProps> = ({
  adminKey,
  onSelectTool,
  onSelectCustomApp,
}) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<DiscoverAppItem[]>(() => loadDiscoverApps());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isCustomAppModalOpen, setIsCustomAppModalOpen] = useState(false);
  const [customAppToEdit, setCustomAppToEdit] = useState<CustomWebAppItem | null>(null);

  const refreshApps = () => {
    setApps(loadDiscoverApps());
  };

  const visibleApps = apps.filter((app) => app.enabled).sort((a, b) => a.order - b.order);

  const handleLaunchApp = (app: DiscoverAppItem) => {
    if (app.type === 'builtin') {
      onSelectTool(app.id as DiscoverToolId);
    } else {
      if (onSelectCustomApp) {
        onSelectCustomApp({
          id: app.id,
          name: app.name,
          url: app.url || '',
          icon: app.icon,
          color: app.color,
          useGateway: app.useGateway,
          createdAt: app.createdAt || Date.now(),
        });
      } else if (app.url) {
        window.open(app.url, '_blank');
      }
    }
  };

  const handleOpenAddCustomApp = () => {
    setCustomAppToEdit(null);
    setIsCustomAppModalOpen(true);
  };

  const handleOpenEditCustomApp = (app: DiscoverAppItem) => {
    setCustomAppToEdit({
      id: app.id,
      name: app.name,
      url: app.url || '',
      icon: app.icon,
      color: app.color,
      useGateway: app.useGateway,
      createdAt: app.createdAt || Date.now(),
    });
    setIsCustomAppModalOpen(true);
  };

  const handleSaveCustomApp = (savedApp: CustomWebAppItem) => {
    saveOrUpdateCustomApp(
      {
        id: savedApp.id,
        type: 'custom',
        name: savedApp.name,
        url: savedApp.url,
        icon: savedApp.icon || 'Globe',
        color: savedApp.color || 'from-orange-500 to-amber-600',
        badge: savedApp.useGateway ? 'GW PROXY' : undefined,
        enabled: true,
        useGateway: savedApp.useGateway,
        createdAt: savedApp.createdAt,
      },
      adminKey
    );
    refreshApps();
  };

  const handleDeleteCustomApp = (appId: string) => {
    deleteCustomApp(appId, adminKey);
    refreshApps();
  };

  const getHostname = (rawUrl?: string) => {
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  };

  const renderAppIcon = (app: DiscoverAppItem, sizeClass = 'w-6 h-6') => {
    if (app.id === 'systemLogs' || app.icon === 'FileText') {
      return <FileText className={sizeClass} />;
    }
    if (app.id === 'playground' || app.icon === 'Play') {
      return <Play className={`${sizeClass} ml-0.5 fill-white`} />;
    }
    if (app.id === 'translate' || app.icon === 'Languages') {
      return <Languages className={sizeClass} />;
    }
    return <Globe className={sizeClass} />;
  };

  const getAppTitle = (app: DiscoverAppItem) => {
    if (app.id === 'systemLogs') return t('discover.systemLogsTitle');
    if (app.id === 'playground') return t('discover.playgroundTitle');
    if (app.id === 'translate') return t('discover.translateTitle');
    return app.name;
  };

  const getAppDesc = (app: DiscoverAppItem) => {
    if (app.id === 'systemLogs') return t('discover.systemLogsDesc');
    if (app.id === 'playground') return t('discover.playgroundDesc');
    if (app.id === 'translate') return t('discover.translateDesc');
    if (app.type === 'custom' && app.url) return getHostname(app.url);
    return app.description || '';
  };

  const getAppBadge = (app: DiscoverAppItem) => {
    if (app.badge) return app.badge;
    if (app.useGateway) return 'GW PROXY';
    if (app.id === 'systemLogs') return 'SSE STREAM';
    if (app.id === 'playground') return 'REST & STREAM';
    if (app.id === 'translate') return 'BILINGUAL';
    return undefined;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. Mobile WeChat Style Discover Page (Strictly Read-Only Launcher)         */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-3.5 pt-1">
        {visibleApps.length > 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {visibleApps.map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => handleLaunchApp(app)}
                className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${
                      app.color || 'from-indigo-500 to-purple-600'
                    } flex items-center justify-center text-white shrink-0 shadow-sm group-active:scale-95 transition-transform`}
                  >
                    {renderAppIcon(app, 'w-5 h-5')}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                      <span className="truncate">{getAppTitle(app)}</span>
                      {getAppBadge(app) && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                          {getAppBadge(app)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {getAppDesc(app)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-8 text-center space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              {t('discover.allHiddenPrompt', '当前所有应用均已隐藏')}
            </p>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. Desktop Unified Discover Hub Grid                                     */}
      {/* ========================================================================= */}
      <div className="hidden md:block space-y-6">
        {/* Hub Header with Manage Page Button */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Sparkles className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {t('discover.title')}
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {t('discover.subtitle')}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{t('discover.managePage', '页面配置')}</span>
          </button>
        </div>

        {/* Unified Card Grid or Empty State */}
        {visibleApps.length === 0 ? (
          <div className="ui-card p-12 text-center flex flex-col items-center justify-center space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              {t('discover.allHiddenPrompt', '当前所有应用均已隐藏')}
            </p>
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors"
            >
              {t('discover.openSettings', '打开配置')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {visibleApps.map((app) => (
              <div
                key={app.id}
                data-testid={`discover-app-card-${app.id}`}
                onClick={() => handleLaunchApp(app)}
                className="ui-card p-5 flex flex-col justify-between hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${
                        app.color || 'from-indigo-500 to-purple-600'
                      } flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform`}
                    >
                      {renderAppIcon(app, 'w-6 h-6')}
                    </div>
                    {getAppBadge(app) && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium">
                        {getAppBadge(app)}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                    {getAppTitle(app)}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                    {getAppDesc(app)}
                  </p>
                </div>
                <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-indigo-500 dark:text-indigo-400">
                  <span>
                    {app.id === 'systemLogs'
                      ? t('discover.viewLogs', '查看日志')
                      : t('discover.launch', '立即启动')}
                  </span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            ))}

            {/* Dashed Add / Config Card */}
            <div
              onClick={() => setIsConfigModalOpen(true)}
              className="ui-card p-5 border-dashed border-2 border-[var(--border-subtle)] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all flex flex-col items-center justify-center text-center group cursor-pointer min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                <Plus className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {t('discover.addCustomApp', '添加应用')} / {t('discover.managePage', '页面配置')}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {t('discover.manageDesc', '自定义卡片排序与显示隐藏')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discover Hub Config Modal */}
      <DiscoverConfigModal
        isOpen={isConfigModalOpen}
        adminKey={adminKey}
        onClose={() => setIsConfigModalOpen(false)}
        onAppsUpdated={refreshApps}
        onOpenAddCustomApp={handleOpenAddCustomApp}
        onOpenEditCustomApp={handleOpenEditCustomApp}
      />

      {/* Custom Web App Modal */}
      <CustomWebAppModal
        isOpen={isCustomAppModalOpen}
        appToEdit={customAppToEdit}
        adminKey={adminKey}
        onClose={() => setIsCustomAppModalOpen(false)}
        onSave={handleSaveCustomApp}
        onDelete={handleDeleteCustomApp}
      />
    </div>
  );
};

export default DiscoverHubView;
