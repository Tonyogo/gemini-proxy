import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from '../i18n/LanguageContext';

export interface ThemeSwitcherProps {
  variant?: 'sidebar' | 'header' | 'login';
  isCollapsed?: boolean;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ variant = 'header', isCollapsed = false }) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const getLabel = () => {
    if (theme === 'system') return t('nav.themeSystem', '跟随系统');
    if (theme === 'light') return t('nav.themeLight', '浅色模式');
    return t('nav.themeDark', '深色模式');
  };

  const Icon = theme === 'system' ? Laptop : resolvedTheme === 'light' ? Sun : Moon;

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
        className={`w-full flex items-center rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors ${
          isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0 text-amber-500 dark:text-indigo-400 transition-transform duration-200 hover:rotate-12" />
        {!isCollapsed && <span className="truncate">{getLabel()}</span>}
      </button>
    );
  }

  if (variant === 'login') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
        className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center space-x-1.5 py-1 px-2 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
      >
        <Icon className="w-3.5 h-3.5 text-amber-500 dark:text-indigo-400" />
        <span>{getLabel()}</span>
      </button>
    );
  }

  // Header button (mobile & compact desktop)
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`${t('nav.themeToggle', '切换主题')}: ${getLabel()}`}
      className="p-1.5 bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.08] hover:border-black/[0.15] dark:hover:border-white/[0.15] rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all active:scale-95"
    >
      <Icon className="w-3.5 h-3.5 text-amber-500 dark:text-indigo-400 transition-transform duration-200 hover:rotate-12" />
    </button>
  );
};
