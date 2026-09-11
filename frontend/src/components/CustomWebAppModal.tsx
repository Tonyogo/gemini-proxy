import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Trash2,
  Check,
  AlertCircle,
  Palette,
  Sparkles,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { CustomWebAppItem } from '../types/customWebApps';
import {
  normalizeWebAppUrl,
  saveCustomWebApp,
  deleteCustomWebApp
} from '../utils/customWebAppsStorage';

export interface CustomWebAppModalProps {
  isOpen: boolean;
  appToEdit?: CustomWebAppItem | null;
  onClose: () => void;
  onSave: (savedApp: CustomWebAppItem) => void;
  onDelete?: (appId: string) => void;
}

const THEME_COLORS = [
  { label: 'Orange / Amber', value: 'from-orange-500 to-amber-600', dot: 'bg-orange-500' },
  { label: 'Blue / Cyan', value: 'from-blue-500 to-cyan-600', dot: 'bg-blue-500' },
  { label: 'Emerald / Teal', value: 'from-emerald-500 to-teal-600', dot: 'bg-emerald-500' },
  { label: 'Violet / Purple', value: 'from-violet-500 to-purple-600', dot: 'bg-purple-500' },
  { label: 'Rose / Pink', value: 'from-rose-500 to-pink-600', dot: 'bg-rose-500' },
  { label: 'Indigo / Purple', value: 'from-indigo-500 to-purple-600', dot: 'bg-indigo-500' },
];

export const CustomWebAppModal: React.FC<CustomWebAppModalProps> = ({
  isOpen,
  appToEdit,
  onClose,
  onSave,
  onDelete,
}) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('from-orange-500 to-amber-600');
  const [useGateway, setUseGateway] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (appToEdit) {
        setName(appToEdit.name);
        setUrl(appToEdit.url);
        setColor(appToEdit.color || 'from-orange-500 to-amber-600');
        setUseGateway(!!appToEdit.useGateway);
      } else {
        setName('');
        setUrl('');
        setColor('from-orange-500 to-amber-600');
        setUseGateway(false);
      }
      setError(null);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, appToEdit]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('discover.appName', '应用名称') + ' 不能为空');
      return;
    }

    let normalizedUrl = '';
    try {
      normalizedUrl = normalizeWebAppUrl(url);
    } catch (err: any) {
      setError(err.message || '无效的 URL 地址');
      return;
    }

    try {
      const saved = saveCustomWebApp({
        id: appToEdit ? appToEdit.id : undefined,
        name: trimmedName,
        url: normalizedUrl,
        icon: appToEdit?.icon || 'Globe',
        color,
        useGateway,
        createdAt: appToEdit?.createdAt,
      });

      onSave(saved);
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    }
  };

  const handleDelete = () => {
    if (!appToEdit) return;
    const confirmed = typeof window !== 'undefined' && window.confirm
      ? window.confirm(t('discover.confirmDeleteApp', '确定要删除该应用吗？'))
      : true;

    if (confirmed) {
      deleteCustomWebApp(appToEdit.id);
      if (onDelete) {
        onDelete(appToEdit.id);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-2.5">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm`}>
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                {appToEdit ? t('discover.editCustomApp', '编辑应用') : t('discover.addCustomApp', '添加 Web 应用')}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('discover.customAppsSubtitle', '快捷访问内网或外部 Web 页面')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center space-x-2 p-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* App Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)] flex items-center justify-between">
              <span>{t('discover.appName', '应用名称')} *</span>
            </label>
            <input
              type="text"
              data-testid="app-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('discover.appNamePlaceholder', '如 Ubuntu Web UI')}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
              autoFocus
            />
          </div>

          {/* Target URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)] flex items-center justify-between">
              <span>{t('discover.appUrl', '目标链接 (URL)')} *</span>
              <span className="text-[10px] text-[var(--text-muted)]">支持 http / https，自动补全协议</span>
            </label>
            <input
              type="text"
              data-testid="app-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('discover.appUrlPlaceholder', '如 https://ubuntu.yatao.cc.cd/ui/')}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Theme Color Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--text-primary)]">
              {t('discover.colorTheme', '主题配色')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {THEME_COLORS.map((item) => {
                const isSelected = color === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setColor(item.value)}
                    className={`h-9 rounded-xl bg-gradient-to-br ${item.value} flex items-center justify-center text-white transition-all ${
                      isSelected ? 'ring-2 ring-offset-2 ring-indigo-500 scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
                    }`}
                    title={item.label}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Use Gateway Reverse Proxy Toggle */}
          <div className="pt-2">
            <label className="flex items-start space-x-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-indigo-500/30 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={useGateway}
                onChange={(e) => setUseGateway(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-400 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  {t('discover.useGatewayProxy', '启用网关反向代理 (处理跨域/防嵌入)')}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {t('discover.mixedContentWarn', '如果无法内嵌显示，请尝试在新窗口打开或启用网关代理。')}
                </p>
              </div>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-2">
            {appToEdit && onDelete ? (
              <button
                type="button"
                data-testid="app-delete-btn"
                onClick={handleDelete}
                className="px-3 py-2 text-xs font-medium text-rose-500 hover:bg-rose-500/10 rounded-xl flex items-center space-x-1.5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('discover.deleteCustomApp', '删除应用')}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                data-testid="app-submit-btn"
                className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition-colors flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>保存</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CustomWebAppModal;
