import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Trash2,
  Edit3,
  Plus,
  RotateCcw,
  Check,
  FileText,
  Play,
  Languages,
  Globe,
  Settings2,
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { DiscoverAppItem } from '../types/discoverApps';
import {
  DEFAULT_DISCOVER_APPS,
  moveAppInList,
  toggleAppVisibilityInList,
  deleteCustomAppInList,
  saveRemoteDiscoverApps,
  fetchRemoteDiscoverApps,
  loadDiscoverApps,
  moveDiscoverApp,
  toggleDiscoverAppVisibility,
  resetDiscoverAppsToDefault,
} from '../utils/discoverAppsStorage';

export interface DiscoverConfigModalProps {
  isOpen: boolean;
  apps?: DiscoverAppItem[];
  adminKey?: string;
  onClose: () => void;
  onAppsUpdated: () => void;
  onSaveApps?: (newApps: DiscoverAppItem[]) => Promise<void> | void;
  onOpenAddCustomApp: () => void;
  onOpenEditCustomApp: (app: DiscoverAppItem) => void;
}

export const DiscoverConfigModal: React.FC<DiscoverConfigModalProps> = ({
  isOpen,
  apps: initialApps,
  adminKey,
  onClose,
  onAppsUpdated,
  onOpenAddCustomApp,
  onOpenEditCustomApp,
  onSaveApps,
}) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<DiscoverAppItem[]>(() => initialApps || DEFAULT_DISCOVER_APPS);

  useEffect(() => {
    if (initialApps && initialApps.length > 0) {
      setApps(initialApps);
    }
  }, [initialApps]);

  useEffect(() => {
    if (isOpen) {
      if (!initialApps || initialApps.length === 0) {
        fetchRemoteDiscoverApps(adminKey).then((remote) => {
          if (remote && remote.length > 0) {
            setApps(remote);
          }
        });
      }
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialApps, adminKey]);

  if (!isOpen) return null;

  const handleMove = async (id: string, direction: 'up' | 'down') => {
    const updated = moveAppInList(apps, id, direction);
    setApps(updated);
    if (onSaveApps) {
      await onSaveApps(updated);
    } else {
      await saveRemoteDiscoverApps(updated, adminKey);
    }
    onAppsUpdated();
  };

  const handleToggle = async (id: string) => {
    const updated = toggleAppVisibilityInList(apps, id);
    setApps(updated);
    if (onSaveApps) {
      await onSaveApps(updated);
    } else {
      await saveRemoteDiscoverApps(updated, adminKey);
    }
    onAppsUpdated();
  };

  const handleDelete = async (app: DiscoverAppItem) => {
    const confirmed =
      typeof window !== 'undefined' && window.confirm
        ? window.confirm(t('discover.confirmDeleteApp', '确定要删除该应用吗？'))
        : true;
    if (confirmed) {
      const updated = deleteCustomAppInList(apps, app.id);
      setApps(updated);
      if (onSaveApps) {
        await onSaveApps(updated);
      } else {
        await saveRemoteDiscoverApps(updated, adminKey);
      }
      onAppsUpdated();
    }
  };

  const handleReset = async () => {
    const confirmed =
      typeof window !== 'undefined' && window.confirm
        ? window.confirm(t('discover.resetConfirm', '确定恢复默认应用布局吗？'))
        : true;
    if (confirmed) {
      const updated = [...DEFAULT_DISCOVER_APPS];
      setApps(updated);
      if (onSaveApps) {
        await onSaveApps(updated);
      } else {
        await saveRemoteDiscoverApps(updated, adminKey);
      }
      onAppsUpdated();
    }
  };

  const renderAppIcon = (app: DiscoverAppItem) => {
    const iconClass = 'w-5 h-5 text-white';
    if (app.id === 'systemLogs' || app.icon === 'FileText') {
      return <FileText className={iconClass} />;
    }
    if (app.id === 'playground' || app.icon === 'Play') {
      return <Play className={`${iconClass} ml-0.5 fill-white`} />;
    }
    if (app.id === 'translate' || app.icon === 'Languages') {
      return <Languages className={iconClass} />;
    }
    return <Globe className={iconClass} />;
  };

  const getHostname = (rawUrl?: string) => {
    if (!rawUrl) return '';
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shadow-sm">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                {t('discover.manageTitle', '发现页管理')}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('discover.manageDesc', '自定义卡片排序与显示隐藏')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onOpenAddCustomApp}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-colors flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('discover.addCustomApp', '添加应用')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable App List */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 flex-1 divide-y divide-transparent">
          {apps.map((app, index) => {
            const isFirst = index === 0;
            const isLast = index === apps.length - 1;

            return (
              <div
                key={app.id}
                className={`flex items-center justify-between p-3 sm:p-3.5 rounded-xl border transition-all ${
                  app.enabled
                    ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)] shadow-sm'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] border-dashed border-[var(--border-subtle)] opacity-60'
                }`}
              >
                {/* Left: Reorder buttons */}
                <div className="flex items-center space-x-1 mr-3 shrink-0">
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => handleMove(app.id, 'up')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    title={t('discover.moveUp', '上移')}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => handleMove(app.id, 'down')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    title={t('discover.moveDown', '下移')}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Center: App Icon & Details */}
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${
                      app.color || 'from-indigo-500 to-purple-600'
                    } flex items-center justify-center text-white shrink-0 shadow-sm`}
                  >
                    {renderAppIcon(app)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
                        {app.name}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-medium shrink-0 ${
                          app.type === 'builtin'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        }`}
                      >
                        {app.type === 'builtin'
                          ? t('discover.builtinType', '内置功能')
                          : t('discover.customType', '外部应用')}
                      </span>
                      {app.useGateway && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                          GW
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {app.type === 'custom' && app.url
                        ? getHostname(app.url)
                        : app.description || ''}
                    </p>
                  </div>
                </div>

                {/* Right: Visibility Toggle & Custom App Controls */}
                <div className="flex items-center space-x-1.5 ml-3 shrink-0">
                  {/* Visibility Button */}
                  <button
                    type="button"
                    onClick={() => handleToggle(app.id)}
                    className={`p-1.5 rounded-lg transition-colors flex items-center space-x-1 text-xs ${
                      app.enabled
                        ? 'text-indigo-500 hover:bg-indigo-500/10'
                        : 'text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                    title={app.enabled ? t('discover.hide', '隐藏') : t('discover.show', '显示')}
                  >
                    {app.enabled ? (
                      <Eye className="w-4 h-4" />
                    ) : (
                      <EyeOff className="w-4 h-4" />
                    )}
                  </button>

                  {/* Custom App Specific Actions: Edit & Delete */}
                  {app.type === 'custom' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenEditCustomApp(app)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        title={t('discover.editCustomApp', '编辑应用')}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(app)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        title={t('discover.deleteCustomApp', '删除应用')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]/50">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('discover.resetDefault', '恢复默认')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('terminal.done', '完成')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiscoverConfigModal;
