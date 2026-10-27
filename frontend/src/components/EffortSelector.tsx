import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, Zap, ArrowRightLeft } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

export type EffortLevel = 'low' | 'medium' | 'high';
export type EffortModelMappings = Record<EffortLevel, Record<string, any>>;

export interface EffortSelectorProps {
  effortLevel: EffortLevel;
  effortModelMappings?: EffortModelMappings;
  disabled?: boolean;
  onSelectEffort: (level: EffortLevel) => Promise<void> | void;
  onOpenMappingsConfig: () => void;
}

function SignalBars({ level, className }: { level: EffortLevel; className?: string }) {
  const litCount = level === 'low' ? 1 : level === 'medium' ? 2 : 3;
  const barColor =
    level === 'low'
      ? 'bg-emerald-500'
      : level === 'medium'
      ? 'bg-indigo-500'
      : 'bg-amber-500';
  const dimColor = 'bg-slate-300 dark:bg-slate-700/60';

  return (
    <div className={`flex items-end space-x-[2px] h-3.5 ${className || ''}`} aria-hidden="true">
      <span className={`w-[2.5px] h-1.5 rounded-full transition-colors ${litCount >= 1 ? barColor : dimColor}`} />
      <span className={`w-[2.5px] h-2.5 rounded-full transition-colors ${litCount >= 2 ? barColor : dimColor}`} />
      <span className={`w-[2.5px] h-3.5 rounded-full transition-colors ${litCount >= 3 ? barColor : dimColor}`} />
    </div>
  );
}

export const EffortSelector: React.FC<EffortSelectorProps> = ({
  effortLevel,
  effortModelMappings,
  disabled = false,
  onSelectEffort,
  onOpenMappingsConfig,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const pillColorStyles: Record<EffortLevel, { badge: string; ring: string }> = {
    low: {
      badge: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      ring: 'focus:ring-emerald-500/30',
    },
    medium: {
      badge: 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
      ring: 'focus:ring-indigo-500/30',
    },
    high: {
      badge: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
      ring: 'focus:ring-amber-500/30',
    },
  };

  const safeEffortLevel = (['low', 'medium', 'high'].includes(effortLevel) ? effortLevel : 'medium') as EffortLevel;

  return (
    <div ref={containerRef} className="relative inline-block text-left shrink-0">
      <button
        type="button"
        disabled={disabled || isSwitching}
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center space-x-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none focus:ring-2 ${pillColorStyles[safeEffortLevel].badge} ${pillColorStyles[safeEffortLevel].ring} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer shadow-sm'}`}
        title={t('effort.title')}
        data-testid="effort-selector-trigger"
      >
        <SignalBars level={safeEffortLevel} />
        {safeEffortLevel === 'high' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500/30 shrink-0" />}
        <span className="hidden sm:inline font-semibold">{t(`effort.${safeEffortLevel}`)}</span>
        <span className="sm:hidden font-semibold">{t(`effort.${safeEffortLevel}Short`)}</span>
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 opacity-60 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute left-0 mt-1.5 w-64 sm:w-72 bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--border-subtle)] rounded-xl shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] flex items-center justify-between select-none">
            <span>{t('effort.title')}</span>
            <span className="text-[9px] font-normal lowercase opacity-75">{t('effort.label')}</span>
          </div>

          {(['low', 'medium', 'high'] as EffortLevel[]).map(lvl => {
            const isActive = safeEffortLevel === lvl;
            const ruleCount = Object.keys(effortModelMappings?.[lvl] || {}).length;
            return (
              <button
                key={lvl}
                type="button"
                role="menuitem"
                onClick={async () => {
                  setIsOpen(false);
                  if (safeEffortLevel !== lvl) {
                    setIsSwitching(true);
                    try {
                      await onSelectEffort(lvl);
                    } finally {
                      setIsSwitching(false);
                    }
                  }
                }}
                className={`flex items-start justify-between p-2 rounded-lg text-left transition-colors cursor-pointer w-full group ${
                  isActive
                    ? 'bg-indigo-500/10 border border-indigo-500/25 dark:bg-indigo-950/40'
                    : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.05] border border-transparent'
                }`}
                data-testid={`effort-option-${lvl}`}
              >
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div className="pt-0.5 shrink-0 flex items-center space-x-1">
                    <SignalBars level={lvl} />
                    {lvl === 'high' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500/30 shrink-0" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-xs font-semibold ${isActive ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-primary)]'}`}>
                        {t(`effort.${lvl}`)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/5 dark:bg-white/10 text-[var(--text-tertiary)]">
                        {t('effort.rulesCount', { count: ruleCount })}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                      {t(`effort.${lvl}Desc`)}
                    </p>
                  </div>
                </div>
                {isActive && <Check className="w-4 h-4 text-emerald-500 shrink-0 ml-2 mt-0.5" />}
              </button>
            );
          })}

          <div className="h-px bg-[var(--border-subtle)] my-1" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onOpenMappingsConfig();
            }}
            className="w-full flex items-center justify-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded-lg transition-colors font-medium"
            data-testid="effort-configure-mappings-btn"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{t('effort.configureMappings')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default EffortSelector;
