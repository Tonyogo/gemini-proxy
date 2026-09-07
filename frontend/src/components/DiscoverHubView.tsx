import React from 'react';
import {
  Terminal,
  Play,
  Languages,
  ChevronRight,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export type DiscoverToolId = 'terminal' | 'playground' | 'translate';

export interface DiscoverHubViewProps {
  adminKey: string;
  onSelectTool: (tool: DiscoverToolId) => void;
}

export const DiscoverHubView: React.FC<DiscoverHubViewProps> = ({ onSelectTool }) => {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* ========================================================================= */}
      {/* 1. Mobile WeChat Style Discover Page (Hidden on desktop md:hidden)        */}
      {/* ========================================================================= */}
      <div className="md:hidden space-y-3.5 pt-1">
        {/* Category 1: System Tools (Web Terminal) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm">
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
        </div>

        {/* Category 2: Developer & Workbench Tools (Playground & Translate) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl overflow-hidden shadow-sm divide-y divide-black/[0.04] dark:divide-white/[0.04]">
          {/* Item 1: API Playground */}
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

          {/* Item 2: Translate Workbench */}
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
      </div>

      {/* ========================================================================= */}
      {/* 2. Desktop APM Discover Hub Grid (Hidden on mobile hidden md:block)       */}
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

        {/* Tools 3-Column Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {t('discover.terminalDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-emerald-500 dark:text-emerald-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 2: API Playground */}
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
                  STREAM & REST
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-orange-400 transition-colors">
                {t('discover.playgroundTitle')}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {t('discover.playgroundDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-orange-500 dark:text-orange-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>

          {/* Card 3: Translate Studio */}
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
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                {t('discover.translateDesc')}
              </p>
            </div>
            <div className="pt-5 mt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-medium text-indigo-500 dark:text-indigo-400">
              <span>{t('discover.launch')}</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscoverHubView;
