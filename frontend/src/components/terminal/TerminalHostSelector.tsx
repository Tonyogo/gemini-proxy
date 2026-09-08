import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  ChevronDown,
  Check,
  Plus,
  Copy,
  X,
  Search,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface ManagedHostItem {
  id: string;
  name: string;
  hostname: string;
  ip: string;
  platform: string;
  status: 'online' | 'offline';
  lastSeen: number;
  type: 'agent';
}

export interface TerminalHostSelectorProps {
  adminKey: string;
  activeHostId: string;
  onSelectHost: (hostId: string) => void;
}

export function TerminalHostSelector({
  adminKey,
  activeHostId,
  onSelectHost,
}: TerminalHostSelectorProps) {
  const { t } = useTranslation();
  const [hosts, setHosts] = useState<ManagedHostItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchHosts = async () => {
    try {
      setIsLoading(true);
      const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
      const res = await fetch('/api/admin/terminal/hosts', {
        headers: effectiveKey ? { 'x-admin-key': effectiveKey } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.hosts)) {
          setHosts(data.hosts);
        }
      }
    } catch {
      // Ignore network fetch error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHosts();
    const interval = setInterval(fetchHosts, 10000);
    return () => clearInterval(interval);
  }, [adminKey]);

  // Auto-switch to first online host if current activeHostId is absent or invalid
  useEffect(() => {
    if (hosts.length === 0) {
      if (activeHostId) {
        onSelectHost('');
      }
      return;
    }

    const currentHost = hosts.find((h) => h.id === activeHostId);
    if (!currentHost || currentHost.status !== 'online') {
      const firstOnline = hosts.find((h) => h.status === 'online');
      if (firstOnline) {
        if (firstOnline.id !== activeHostId) {
          onSelectHost(firstOnline.id);
        }
      } else if (!currentHost && hosts.length > 0) {
        onSelectHost(hosts[0].id);
      }
    }
  }, [hosts, activeHostId, onSelectHost]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  useEffect(() => {
    if (!isAddModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAddModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen]);

  const activeHost = useMemo(() => {
    return hosts.find((h) => h.id === activeHostId) || null;
  }, [hosts, activeHostId]);

  const filteredHosts = useMemo(() => {
    if (!searchQuery.trim()) return hosts;
    const q = searchQuery.toLowerCase();
    return hosts.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.id.toLowerCase().includes(q) ||
        h.ip.toLowerCase().includes(q) ||
        h.platform.toLowerCase().includes(q)
    );
  }, [hosts, searchQuery]);

  const onlineCount = useMemo(() => hosts.filter((h) => h.status === 'online').length, [hosts]);

  const agentCommand = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const effectiveKey = adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
    return `node scripts/terminal-agent.js --server="${origin}" --key="${effectiveKey}" --name="worker-${Math.floor(Math.random() * 900 + 100)}"`;
  }, [adminKey]);

  const handleCopyCommand = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(agentCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Node Trigger Pill Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchHosts();
        }}
        className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg border text-xs font-mono transition-all select-none active:scale-95 ${
          isOpen
            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 shadow-sm'
            : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border-white/[0.08]'
        }`}
        title={t('webTerminal.hostSelector.switchHostPrompt')}
      >
        <Server className={`w-3.5 h-3.5 shrink-0 ${activeHost && activeHost.status === 'online' ? 'text-emerald-400' : 'text-slate-400'}`} />

        <span className="font-medium text-[11px] max-w-[90px] sm:max-w-[130px] truncate">
          {activeHost ? activeHost.name : t('webTerminal.emptyState.noOnlineHosts', '无在线节点')}
        </span>

        {/* Online/Offline Status Dot */}
        <span className="relative flex items-center justify-center w-2 h-2 shrink-0">
          {activeHost && activeHost.status === 'online' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-60" />
            </>
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          )}
        </span>

        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-300' : ''}`} />
      </button>

      {/* Host Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 sm:w-80 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 font-sans">
          {/* Header with Search & Add Node Button */}
          <div className="p-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/50 space-y-2">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-semibold text-[var(--text-secondary)] flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {t('webTerminal.hostSelector.hostsCount', {
                    online: onlineCount.toString(),
                    total: hosts.length.toString(),
                  })
                    .replace('{online}', onlineCount.toString())
                    .replace('{total}', hosts.length.toString())}
                </span>
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsAddModalOpen(true);
                }}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{t('webTerminal.hostSelector.addNode')}</span>
              </button>
            </div>

            {/* Filter Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('webTerminal.hostSelector.filterPlaceholder')}
                className="w-full pl-8 pr-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.06] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Host Item List */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-[var(--border-subtle)]/40">
            {filteredHosts.map((h) => {
              const isSelected = h.id === activeHostId;
              const isOnline = h.status === 'online';

              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    onSelectHost(h.id);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2 rounded-lg flex items-center justify-between text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/15 text-indigo-300 font-medium'
                      : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-indigo-500/20 text-indigo-400'
                          : isOnline
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-500/10 text-slate-400'
                      }`}
                    >
                      <Server className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs truncate font-mono">
                          {h.name}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate font-mono">
                        {h.ip} · {h.platform}
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check className="w-4 h-4 text-indigo-400 shrink-0 ml-2" />}
                </button>
              );
            })}

            {filteredHosts.length === 0 && (
              <div className="p-4 text-center text-xs text-[var(--text-muted)] font-sans">
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-1 text-indigo-400" /> : null}
                <span>{t('webTerminal.hostSelector.noHosts', '未找到匹配的主机节点')}</span>
              </div>
            )}

            {/* Helper tip when no hosts exist */}
            {hosts.length === 0 && !searchQuery.trim() && (
              <div className="p-2.5 bg-indigo-500/5 rounded-lg m-1 border border-indigo-500/10 text-[11px] text-slate-400 font-sans leading-relaxed">
                {t(
                  'webTerminal.hostSelector.onlyLocalTip',
                  '当前暂无在线主机。点击上方「接入内网新节点」即可通过反向隧道将服务器接入此终端。'
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Intranet Node Guide Modal */}
      {isAddModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface-sub)]/60">
              <div className="flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {t('webTerminal.hostSelector.addNodeTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs font-sans">
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {t('webTerminal.hostSelector.addNodeDesc')}
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>Run command on target host:</span>
                  <span className="font-mono text-emerald-400">Node.js 18+ required</span>
                </div>

                <div className="relative group">
                  <pre className="p-3 rounded-xl bg-black/40 border border-white/[0.08] font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap break-all select-all">
                    {agentCommand}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-[11px] flex items-center space-x-1 shadow-md transition-all cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? t('webTerminal.hostSelector.commandCopied') : t('webTerminal.hostSelector.copyCommand')}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-3 text-[11px] text-indigo-300 space-y-1">
                <div className="font-semibold flex items-center space-x-1">
                  <span>💡 Direct Intranet Tunnel</span>
                </div>
                <p className="text-indigo-300/80 leading-normal">
                  The agent establishes an outbound WebSocket connection directly to this proxy. Once connected, it will appear in the node selector above instantly.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-sub)]/40 flex justify-end">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] active:scale-95 text-[var(--text-primary)] text-xs font-medium transition-all cursor-pointer"
              >
                {t('webTerminal.done')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
