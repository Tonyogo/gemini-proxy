import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  FileText,
  Terminal,
  Play,
  Settings,
  Globe,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Lock,
  ShieldCheck,
  KeyRound,
  ChevronRight,
  Sparkles,
  Zap,
  Menu,
  X,
  Maximize2
} from 'lucide-react';
import DashboardView from './components/DashboardView';
import AccountsView from './components/AccountsView';
import LogsView from './components/LogsView';
import PlaygroundView from './components/PlaygroundView';
import UnifiedTerminalView from './components/UnifiedTerminalView';
import WebTerminalView from './components/WebTerminalView';
import ConfigModal from './components/ConfigModal';
import { useTranslation } from './i18n/LanguageContext';

type TabType = 'dashboard' | 'accounts' | 'logs' | 'terminal' | 'playground';

interface NavItem {
  id: TabType;
  icon: React.ElementType;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'accounts', icon: Users, shortcut: '⌘2' },
  { id: 'logs', icon: FileText, shortcut: '⌘3' },
  { id: 'terminal', icon: Terminal, shortcut: '⌘4' },
  { id: 'playground', icon: Play, shortcut: '⌘5' },
];

const VALID_TABS: TabType[] = ['dashboard', 'accounts', 'logs', 'terminal', 'playground'];

const isTerminalRoute = (): boolean => {
  return (
    window.location.pathname === '/terminal' ||
    window.location.pathname.startsWith('/terminal/') ||
    window.location.hash === '#/terminal' ||
    window.location.hash === '#terminal'
  );
};

export default function App() {
  const { t, lang, setLang } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const rawSaved = localStorage.getItem('admin_active_tab');
    const saved = rawSaved === 'webTerminal' ? 'terminal' : (rawSaved as TabType);
    return VALID_TABS.includes(saved) ? saved : 'dashboard';
  });
  const [isStandaloneTerminal, setIsStandaloneTerminal] = useState<boolean>(() => isTerminalRoute());
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [inputKey, setInputKey] = useState(localStorage.getItem('adminKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    const handlePopState = () => {
      setIsStandaloneTerminal(isTerminalRoute());
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('hashchange', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('hashchange', handlePopState);
    };
  }, []);

  const handleExitStandalone = () => {
    setIsStandaloneTerminal(false);
    if (window.location.pathname === '/terminal' || window.location.pathname.startsWith('/terminal/')) {
      window.history.pushState(null, '', '/');
    } else if (window.location.hash === '#/terminal' || window.location.hash === '#terminal') {
      window.history.pushState(null, '', window.location.pathname);
    }
  };

  const handleEnterStandalone = () => {
    setIsStandaloneTerminal(true);
    window.history.pushState(null, '', '#/terminal');
  };

  // Sidebar Collapse State (Desktop)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  // Switch tab and persist to localStorage
  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    localStorage.setItem('admin_active_tab', tabId);
  };

  // Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTrigger(prev => prev + 1);
    setTimeout(() => setIsRefreshing(false), 600);
  }, []);

  const verifyAuth = async (keyToTest: string) => {
    setLoading(true);
    setAuthError('');
    try {
      const headers: Record<string, string> = keyToTest ? { 'x-admin-key': keyToTest } : {};
      const res = await fetch('/api/admin/status', { headers });

      if (res.ok) {
        setIsAuthenticated(true);
        setAdminKey(keyToTest);
        localStorage.setItem('adminKey', keyToTest);
      } else if (res.status === 401) {
        setIsAuthenticated(false);
        setAuthError('Invalid Admin Secret Key. Access Denied (401).');
      } else {
        setIsAuthenticated(false);
        setAuthError(`Authentication failed: Server returned ${res.status}`);
      }
    } catch (err: any) {
      setIsAuthenticated(false);
      setAuthError(`Connection error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verifyAuth(adminKey);
  }, []);

  // Keyboard shortcut listeners (Cmd/Ctrl + 1..5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= NAV_ITEMS.length) {
          e.preventDefault();
          handleTabChange(NAV_ITEMS[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    verifyAuth(inputKey);
  };

  const handleLogout = () => {
    setAdminKey('');
    setInputKey('');
    localStorage.removeItem('adminKey');
    setIsAuthenticated(false);
  };

  // Loading Screen
  if (loading && isAuthenticated === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#090A0F] text-slate-300 font-mono text-xs selection:bg-indigo-500 selection:text-white">
        <div className="relative flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Zap className="w-6 h-6 animate-pulse text-indigo-400" />
          </div>
          <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-xl animate-pulse"></div>
        </div>
        <div className="flex items-center space-x-2 text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
          <span>{lang === 'zh' ? '正在验证安全凭据...' : 'Verifying Security Credentials...'}</span>
        </div>
      </div>
    );
  }

  // Modern Linear-style Authentication Screen
  if (!isAuthenticated) {
    return (
      <div className="relative flex items-center justify-center min-h-screen bg-[#090A0F] p-4 overflow-hidden selection:bg-indigo-500 selection:text-white">
        {/* Background ambient lighting */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md bg-[#0F1118]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl space-y-6">
          {/* Header & Lock Badge */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-b from-indigo-500/15 to-purple-500/5 border border-indigo-500/30 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)] mb-1">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center justify-center space-x-2">
                <h1 className="text-xl font-semibold text-slate-100 tracking-tight">
                  {lang === 'zh' ? 'Gemini 代理控制台' : 'Gemini Proxy Console'}
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {lang === 'zh' ? '输入管理员密钥以访问控制台和调试器' : 'Enter Admin Secret Key to access Dashboard & Debugger'}
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('nav.adminKeyPlaceholder')}</span>
                </span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder={t('nav.adminKeyPlaceholder')}
                  autoFocus
                  className="w-full bg-[#090A0F] border border-white/[0.1] hover:border-white/[0.2] focus:border-indigo-500/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-mono transition-all"
                />
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-ping" />
                <span className="truncate">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl font-medium text-xs transition-all shadow-[0_0_20px_rgba(99,102,241,0.25)] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] active:scale-[0.99] flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{lang === 'zh' ? '正在认证...' : 'Authenticating...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('nav.login')}</span>
                </>
              )}
            </button>
          </form>

          {/* Language Switcher in Login */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
            <button
              type="button"
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="text-slate-400 hover:text-slate-200 transition-colors flex items-center space-x-1.5 py-1 px-2 rounded-lg hover:bg-white/[0.04]"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'zh' ? 'Switch to English' : '切换至中文'}</span>
            </button>
            <span className="text-[11px] text-slate-500 font-mono">Gemini Studio Proxy</span>
          </div>

          <p className="text-[11px] text-slate-500 text-center leading-relaxed">
            {lang === 'zh' ? (
              <>
                注意：如果后端 <code className="text-slate-400 font-mono bg-white/[0.04] px-1 py-0.5 rounded border border-white/[0.06]">.env</code> 中未设置 <code className="text-slate-400 font-mono bg-white/[0.04] px-1 py-0.5 rounded border border-white/[0.06]">ADMIN_SECRET_KEY</code>，请留空并直接点击登录。
              </>
            ) : (
              <>
                Note: If <code className="text-slate-400 font-mono bg-white/[0.04] px-1 py-0.5 rounded border border-white/[0.06]">ADMIN_SECRET_KEY</code> is not set in backend .env, leave blank and click Login directly.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  // Standalone Fullscreen Terminal Mode (Zero DOM bleed)
  if (isStandaloneTerminal) {
    return (
      <div className="fixed inset-0 z-50 w-full h-full bg-[#07090E] overflow-hidden">
        <WebTerminalView
          key={refreshTrigger}
          adminKey={adminKey}
          standalone={true}
          onExitStandalone={handleExitStandalone}
        />
      </div>
    );
  }

  // Active view title mapping for breadcrumbs
  const getActiveTabTitle = () => {
    return t(`nav.${activeTab}`);
  };

  return (
    <div className="flex min-h-screen bg-[#090A0F] text-slate-100 font-sans selection:bg-indigo-500 selection:text-white antialiased">
      {/* Collapsible Sidebar (Desktop only) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 hidden md:flex flex-col bg-[#0C0E14] border-r border-white/[0.06] transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Brand Logo Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0 shadow-[0_0_12px_rgba(99,102,241,0.2)]">
              <Zap className="w-4 h-4 text-indigo-400" />
            </div>
            {!isSidebarCollapsed && (
              <div className="flex items-center space-x-2 min-w-0 overflow-hidden">
                <span className="font-semibold text-sm text-slate-100 tracking-tight truncate">
                  Gemini Proxy
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                  PRO
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const title = t(`nav.${item.id}`);

            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                title={isSidebarCollapsed ? `${title} (${item.shortcut})` : undefined}
                className={`relative w-full flex items-center rounded-xl text-xs font-medium transition-all group ${
                  isSidebarCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5 space-x-3'
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-transparent text-white border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                )}

                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />

                {!isSidebarCollapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="truncate">{title}</span>
                    <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                      isActive
                        ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300'
                        : 'bg-white/[0.03] border-white/[0.06] text-slate-500 group-hover:text-slate-400'
                    }`}>
                      {item.shortcut}
                    </kbd>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Controls */}
        <div className="p-2.5 border-t border-white/[0.06] space-y-1 shrink-0 bg-[#0A0C11]/50">
          {/* Live Connection Status */}
          <div
            className={`flex items-center px-3 py-2 rounded-xl text-xs text-slate-400 transition-colors ${
              isSidebarCollapsed ? 'justify-center px-0' : 'space-x-2.5'
            }`}
            title={lang === 'zh' ? '系统运行正常' : 'System Online'}
          >
            <div className="relative flex items-center justify-center shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </div>
            {!isSidebarCollapsed && (
              <span className="text-[11px] font-mono text-emerald-400 truncate">
                {lang === 'zh' ? '服务运行中' : 'Proxy Active'}
              </span>
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setIsConfigModalOpen(true)}
            title={isSidebarCollapsed ? t('nav.configTitle') : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors ${
              isSidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">{t('nav.configTitle')}</span>}
          </button>

          {/* Language Switcher */}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            title={isSidebarCollapsed ? (lang === 'zh' ? 'Switch to English' : '切换至中文') : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition-colors ${
              isSidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
            }`}
          >
            <Globe className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && (
              <span className="truncate">{lang === 'zh' ? 'English (EN)' : '中文 (ZH)'}</span>
            )}
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title={isSidebarCollapsed ? t('nav.logout') : undefined}
            className={`w-full flex items-center rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ${
              isSidebarCollapsed ? 'justify-center p-2.5' : 'px-3 py-2 space-x-2.5'
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">{t('nav.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'md:pl-16' : 'md:pl-60'
        } pl-0`}
      >
        {/* Minimal Glass Top Bar */}
        <header className="h-12 sm:h-14 backdrop-blur-md bg-[#090A0F]/80 border-b border-white/[0.06] px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30">
          {/* Left Breadcrumbs & Brand / Sidebar Toggle */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
            {/* Mobile Brand Logo Icon */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0 md:hidden shadow-[0_0_10px_rgba(99,102,241,0.2)]">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
            </div>

            {/* Desktop Sidebar Toggle */}
            <button
              onClick={toggleSidebar}
              title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              className="hidden md:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/[0.06]"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>

            <div className="h-4 w-px bg-white/[0.08] hidden sm:block shrink-0" />

            <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs font-medium min-w-0">
              <span className="hidden sm:inline text-slate-500 shrink-0">Gemini Proxy</span>
              <ChevronRight className="hidden sm:inline w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="text-slate-200 font-semibold truncate max-w-[130px] sm:max-w-none">{getActiveTabTitle()}</span>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
            {/* Mobile Terminal Fullscreen Trigger */}
            {activeTab === 'terminal' && (
              <button
                onClick={handleEnterStandalone}
                title={t('webTerminal.fullscreen')}
                className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 hover:text-white transition-all md:hidden active:scale-95"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              title={lang === 'zh' ? '刷新当前视图' : 'Refresh Active View'}
              className="px-2 sm:px-2.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-xs text-slate-300 hover:text-white transition-all flex items-center space-x-1.5 shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline text-[11px]">{lang === 'zh' ? '刷新' : 'Refresh'}</span>
            </button>

            {/* Mobile Settings Button */}
            <button
              onClick={() => setIsConfigModalOpen(true)}
              title={t('nav.configTitle')}
              className="p-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-xs text-slate-300 hover:text-white transition-all md:hidden active:scale-95"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Mobile Language Switcher */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              title={lang === 'zh' ? 'Switch to English' : '切换至中文'}
              className="p-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.15] rounded-lg text-xs text-slate-300 hover:text-white transition-all md:hidden active:scale-95 font-mono text-[10px]"
            >
              <Globe className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Mobile Logout Button */}
            <button
              onClick={handleLogout}
              title={t('nav.logout')}
              className="p-1.5 bg-white/[0.03] hover:bg-rose-500/20 border border-white/[0.08] hover:border-rose-500/30 rounded-lg text-xs text-slate-400 hover:text-rose-300 transition-all md:hidden active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

            {/* Status Online Badge (Desktop) */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{lang === 'zh' ? '在线' : 'Online'}</span>
            </div>
          </div>
        </header>

        {/* Main View Workspace */}
        <main className={`flex-1 overflow-x-hidden ${
          activeTab === 'terminal'
            ? 'p-0 md:p-6 pb-0 md:pb-6 flex flex-col min-h-0 h-[calc(100dvh-3rem-3.5rem)] max-h-[calc(100dvh-3rem-3.5rem)] md:h-auto md:max-h-none overflow-hidden'
            : 'p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6'
        }`}>
          {activeTab === 'dashboard' && (
            <DashboardView
              key={refreshTrigger}
              adminKey={adminKey}
            />
          )}
          {activeTab === 'accounts' && (
            <AccountsView
              key={refreshTrigger}
              adminKey={adminKey}
            />
          )}
          {activeTab === 'logs' && (
            <LogsView
              key={refreshTrigger}
              adminKey={adminKey}
            />
          )}
          {activeTab === 'terminal' && (
            <UnifiedTerminalView
              key={refreshTrigger}
              adminKey={adminKey}
              onEnterStandalone={handleEnterStandalone}
            />
          )}
          {activeTab === 'playground' && (
            <PlaygroundView
              key={refreshTrigger}
            />
          )}
        </main>

        {/* Fixed Mobile Bottom Navigation Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0C0E14]/95 backdrop-blur-xl border-t border-white/[0.08] px-2 py-1 flex items-center justify-around md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.6)]">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const title = t(`nav.${item.id}`);

            return (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all ${
                  isActive
                    ? 'text-indigo-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-lg transition-transform ${
                  isActive ? 'bg-indigo-500/15 scale-110 shadow-[0_0_12px_rgba(99,102,241,0.3)]' : ''
                }`}>
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[56px]">
                  {title}
                </span>
                {isActive && (
                  <span className="w-1 h-1 rounded-full bg-indigo-500 mt-0.5 shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global Config Modal */}
      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        adminKey={adminKey}
        onSaved={() => setRefreshTrigger(prev => prev + 1)}
      />
    </div>
  );
}
