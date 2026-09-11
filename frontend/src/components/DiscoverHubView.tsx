import React, { useState } from 'react';
import {
  Terminal,
  FileText,
  Play,
  Languages,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
  Radio,
  Globe,
  Plus,
  Edit3
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { CustomWebAppItem } from '../types/customWebApps';
import { loadCustomWebApps } from '../utils/customWebAppsStorage';
import CustomWebAppModal from './CustomWebAppModal';

export type DiscoverToolId = 'terminal' | 'systemLogs' | 'playground' | 'translate' | 'mihomo';

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
  const [customApps, setCustomApps] = useState<CustomWebAppItem[]>(() => loadCustomWebApps());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [appToEdit, setAppToEdit] = useState<CustomWebAppItem | null>(null);

  const refreshApps = () => {
    setCustomApps(loadCustomWebApps());
  };

  const handleOpenAddModal = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAppToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: CustomWebAppItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAppToEdit(app);
    setIsModalOpen(true);
  };

  const getHostname = (rawUrl: string) => {
    try {
      return new URL(rawUrl).hostname;
    } catch {
      return rawUrl;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. Mobile WeChat Style Discover Page                                      */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-3.5 pt-1">
        {/* Category 1: System & Operations (Terminal + System Logs + Mihomo) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 1: Web Terminal */}
          <button
            type="button"
            onClick={() => onSelectTool('terminal')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-emerald-500/20 group-active:scale-95 transition-transform">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.terminalTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.terminalDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>

          {/* Item 2: System Logs */}
          <button
            type="button"
            onClick={() => onSelectTool('systemLogs')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-blue-500/20 group-active:scale-95 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.systemLogsTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.systemLogsDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>

          {/* Item 3: Mihomo Dashboard */}
          <button
            type="button"
            onClick={() => onSelectTool('mihomo')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-purple-500/20 group-active:scale-95 transition-transform">
                <Radio className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.mihomoTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.mihomoDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Category 2: Developer Tools (Playground + Translate) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 4: API Playground */}
          <button
            type="button"
            onClick={() => onSelectTool('playground')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-orange-500/20 group-active:scale-95 transition-transform">
                <Play className="w-5 h-5 ml-0.5 fill-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.playgroundTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.playgroundDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>

          {/* Item 5: Translate Studio */}
          <button
            type="button"
            onClick={() => onSelectTool('translate')}
            className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group"
          >
            <div className="flex items-center space-x-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-indigo-500/20 group-active:scale-95 transition-transform">
                <Languages className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                  <span>{t('discover.translateTitle')}</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {t('discover.translateDesc')}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 ml-2 group-active:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Category 3: Custom Web Apps (Mobile) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between p-3.5 border-b border-black/[0.04] dark:border-white/[0.04]">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-md bg-orange-500/10 text-orange-400 flex items-center justify-center">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {t('discover.customAppsTitle', '自定义应用')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="text-[11px] text-indigo-500 hover:text-indigo-400 font-medium flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('discover.addCustomApp', '添加应用')}</span>
            </button>
          </div>

          {customApps.length > 0 ? (
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {customApps.map((app) => (
                <div
                  key={app.id}
                  data-testid={`custom-app-card-${app.name}`}
                  onClick={() =>
                    onSelectCustomApp ? onSelectCustomApp(app) : window.open(app.url, '_blank')
                  }
                  className="w-full flex items-center justify-between p-3.5 text-left active:bg-black/[0.04] dark:active:bg-white/[0.05] transition-colors group cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl bg-gradient-to-br ${
                        app.color || 'from-orange-500 to-amber-600'
                      } flex items-center justify-center text-white shrink-0 shadow-sm shadow-orange-500/20 group-active:scale-95 transition-transform`}
                    >
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                        <span className="truncate">{app.name}</span>
                        {app.useGateway && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                            GW
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-[var(--text-muted)] truncate mt-0.5">
                        {getHostname(app.url)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0 ml-2">
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditModal(app, e)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 group-active:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={handleOpenAddModal}
              className="p-5 text-center cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
            >
              <p className="text-xs text-[var(--text-muted)]">
                {t('discover.customAppsSubtitle', '快捷访问内网或外部 Web 页面')}
              </p>
              <span className="text-xs text-indigo-500 font-medium mt-1 inline-block">
                + {t('discover.addCustomApp', '添加 Web 应用')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. Desktop APM Discover Hub 5-Column Grid                                */}
      {/* ========================================================================= */}
      <div className="hidden md:block space-y-6">
        {/* Hub Header */}
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

        {/* Tools Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {/* Card 1: Web Terminal */}
          <div
            onClick={() => onSelectTool('terminal')}
            className="ui-card p-5 flex flex-col justify-between hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                  <Terminal className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
                  SYSTEM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-emerald-400 transition-colors">
                {t('discover.terminalTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.terminalDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-emerald-500 dark:text-emerald-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: System Logs */}
          <div
            onClick={() => onSelectTool('systemLogs')}
            className="ui-card p-5 flex flex-col justify-between hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                  SSE STREAM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-blue-400 transition-colors">
                {t('discover.systemLogsTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.systemLogsDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-blue-500 dark:text-blue-400">
              <span>{t('discover.viewLogs', '查看日志')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 3: API Playground */}
          <div
            onClick={() => onSelectTool('playground')}
            className="ui-card p-5 flex flex-col justify-between hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform">
                  <Play className="w-6 h-6 ml-0.5 fill-white" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 font-medium">
                  REST & STREAM
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                {t('discover.playgroundTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.playgroundDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-orange-500 dark:text-orange-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 4: Translate Studio */}
          <div
            onClick={() => onSelectTool('translate')}
            className="ui-card p-5 flex flex-col justify-between hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                  <Languages className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium">
                  BILINGUAL
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors">
                {t('discover.translateTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.translateDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-indigo-500 dark:text-indigo-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 5: Mihomo Dashboard */}
          <div
            onClick={() => onSelectTool('mihomo')}
            className="ui-card p-5 flex flex-col justify-between hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/5 transition-all group cursor-pointer"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20 group-hover:scale-105 transition-transform">
                  <Radio className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 font-medium">
                  CORE PROXY
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-purple-400 transition-colors">
                {t('discover.mihomoTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed line-clamp-2">
                {t('discover.mihomoDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-purple-500 dark:text-purple-400">
              <span>{t('discover.openMihomo', '打开控制台')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>
        </div>

        {/* Section 2: Custom Web Apps Section */}
        <div className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <Globe className="w-4 h-4" />
                </span>
                <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                  {t('discover.customAppsTitle', '自定义应用')}
                </h2>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                {t('discover.customAppsSubtitle', '快捷访问内网或外部 Web 页面')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('discover.addCustomApp', '添加 Web 应用')}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {customApps.map((app) => (
              <div
                key={app.id}
                data-testid={`custom-app-card-${app.name}`}
                onClick={() =>
                  onSelectCustomApp ? onSelectCustomApp(app) : window.open(app.url, '_blank')
                }
                className="ui-card p-5 flex flex-col justify-between hover:border-orange-500/40 hover:shadow-lg hover:shadow-orange-500/5 transition-all group cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${
                        app.color || 'from-orange-500 to-amber-600'
                      } flex items-center justify-center text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition-transform`}
                    >
                      <Globe className="w-6 h-6" />
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {app.useGateway && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-medium">
                          GW PROXY
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditModal(app, e)}
                        className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
                        title={t('discover.editCustomApp', '编辑应用')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-indigo-400 transition-colors truncate">
                    {app.name}
                  </h3>
                  <p className="text-xs font-mono text-[var(--text-muted)] mt-1.5 truncate">
                    {getHostname(app.url)}
                  </p>
                </div>
                <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-indigo-500 dark:text-indigo-400">
                  <span>{t('discover.launch', '立即启动')}</span>
                  <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            ))}

            {/* Dashed Add Card */}
            <div
              onClick={handleOpenAddModal}
              className="ui-card p-5 border-dashed border-2 border-[var(--border-subtle)] hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all flex flex-col items-center justify-center text-center group cursor-pointer min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform mb-2">
                <Plus className="w-5 h-5" />
              </div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {t('discover.addCustomApp', '添加 Web 应用')}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {t('discover.customAppsSubtitle', '快捷访问内网或外部 Web 页面')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Web App Modal */}
      <CustomWebAppModal
        isOpen={isModalOpen}
        appToEdit={appToEdit}
        adminKey={adminKey}
        onClose={() => setIsModalOpen(false)}
        onSave={() => refreshApps()}
        onDelete={() => refreshApps()}
      />
    </div>
  );
};

export default DiscoverHubView;
