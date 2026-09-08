import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Play, Copy, Plus, Trash2, Terminal as TerminalIcon } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface CommandSnippet {
  id: string;
  name: string;
  command: string;
  category: 'pm2' | 'system' | 'git' | 'custom';
}

const DEFAULT_SNIPPETS: CommandSnippet[] = [
  { id: '1', name: 'PM2 Status', command: 'pm2 status', category: 'pm2' },
  { id: '2', name: 'PM2 Logs', command: 'pm2 logs --lines 50', category: 'pm2' },
  { id: '3', name: 'PM2 Reload', command: 'npm run pm2:reload', category: 'pm2' },
  { id: '4', name: 'System Info (top)', command: 'top -b -n 1 | head -n 20', category: 'system' },
  { id: '5', name: 'Disk Usage', command: 'df -h', category: 'system' },
  { id: '6', name: 'Memory Free', command: 'free -m', category: 'system' },
  { id: '7', name: 'Git Status', command: 'git status', category: 'git' },
  { id: '8', name: 'Git Recent Log', command: 'git log -n 5 --oneline', category: 'git' },
];

interface TerminalSnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string, execute: boolean) => void;
}

export const TerminalSnippetsDrawer: React.FC<TerminalSnippetsDrawerProps> = ({
  isOpen,
  onClose,
  onRunCommand,
}) => {
  const { t } = useTranslation();
  const [snippets, setSnippets] = useState<CommandSnippet[]>(() => {
    const saved = localStorage.getItem('terminal_custom_snippets');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_SNIPPETS;
      }
    }
    return DEFAULT_SNIPPETS;
  });

  const [newName, setNewName] = useState('');
  const [newCmd, setNewCmd] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    localStorage.setItem('terminal_custom_snippets', JSON.stringify(snippets));
  }, [snippets]);

  if (!isOpen) return null;

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCmd.trim()) return;

    const newEntry: CommandSnippet = {
      id: Date.now().toString(),
      name: newName.trim(),
      command: newCmd.trim(),
      category: 'custom',
    };

    setSnippets((prev) => [...prev, newEntry]);
    setNewName('');
    setNewCmd('');
    setIsAdding(false);
  };

  const handleDeleteSnippet = (id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return typeof document !== 'undefined' ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0C0E14] border-l border-white/[0.08] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0F1118]">
          <div className="flex items-center space-x-2">
            <TerminalIcon className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-100">{t('webTerminal.snippetsTitle')}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Snippet List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <p className="text-xs text-slate-400 mb-2">{t('webTerminal.snippetsDesc')}</p>

          {snippets.map((item) => (
            <div
              key={item.id}
              className="bg-[#141622] border border-white/[0.06] rounded-xl p-3 flex flex-col space-y-2 hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{item.name}</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => {
                      onRunCommand(item.command, false);
                      onClose();
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[11px] text-slate-300 flex items-center space-x-1 cursor-pointer"
                    title={t('webTerminal.insert')}
                  >
                    <Copy className="w-3 h-3" />
                    <span>{t('webTerminal.insert')}</span>
                  </button>
                  <button
                    onClick={() => {
                      onRunCommand(item.command, true);
                      onClose();
                    }}
                    className="px-2 py-0.5 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-[11px] text-indigo-300 font-medium flex items-center space-x-1 cursor-pointer"
                    title={t('webTerminal.run')}
                  >
                    <Play className="w-3 h-3 text-indigo-400" />
                    <span>{t('webTerminal.run')}</span>
                  </button>
                  {item.category === 'custom' && (
                    <button
                      onClick={() => handleDeleteSnippet(item.id)}
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <code className="text-[11px] font-mono text-cyan-300/80 bg-black/40 px-2 py-1 rounded border border-white/[0.04] break-all">
                {item.command}
              </code>
            </div>
          ))}

          {/* Add Snippet Form */}
          {isAdding ? (
            <form onSubmit={handleAddSnippet} className="bg-[#141622] border border-indigo-500/30 rounded-xl p-3 space-y-2.5">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('webTerminal.snippetName')}
                className="w-full px-2.5 py-1.5 bg-black/40 border border-white/[0.08] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              <textarea
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                placeholder={t('webTerminal.snippetCommand')}
                rows={3}
                className="w-full px-2.5 py-1.5 bg-black/40 border border-white/[0.08] rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1 bg-white/[0.06] hover:bg-white/[0.1] text-xs text-slate-300 rounded-lg cursor-pointer"
                >
                  {t('webTerminal.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white rounded-lg cursor-pointer"
                >
                  {t('webTerminal.saveSnippet')}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full py-2 border border-dashed border-white/[0.1] hover:border-white/[0.2] rounded-xl text-xs text-slate-400 hover:text-white flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('webTerminal.addSnippet')}</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  ) : null;
};
