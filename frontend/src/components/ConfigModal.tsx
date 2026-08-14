import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminKey: string;
  onSaved?: () => void;
}

interface MappingEntry {
  id: string;
  source: string;
  target: string;
}

export default function ConfigModal({ isOpen, onClose, adminKey, onSaved }: ConfigModalProps) {
  const { t } = useTranslation();
  const [systemRoleToInstruction, setSystemRoleToInstruction] = useState<boolean>(false);
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [logRetentionDays, setLogRetentionDays] = useState<number>(3);
  const [countTokensModel, setCountTokensModel] = useState<string>('');
  const [ephemeralUserMessagesText, setEphemeralUserMessagesText] = useState<string>('');
  const [ephemeralSystemMessagesText, setEphemeralSystemMessagesText] = useState<string>('');

  // KV Editor and Raw JSON Sync States
  const [mappingEntries, setMappingEntries] = useState<MappingEntry[]>([]);
  const [modelMappingsRaw, setModelMappingsRaw] = useState<string>('{}');
  const [showAdvancedJson, setShowAdvancedJson] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    const headers: Record<string, string> = adminKey ? { 'x-admin-key': adminKey } : {};
    fetch('/api/admin/status', { headers })
      .then(r => r.json())
      .then(data => {
        if (data?.config) {
          setSystemRoleToInstruction(Boolean(data.config.systemRoleToInstruction));
          setCustomSystemInstruction(data.config.customSystemInstruction || '');
          setUpstreamTimeoutMs(data.config.upstreamTimeoutMs || 180000);
          setLogLevel(data.config.logLevel || 'info');
          setLogRetentionDays(data.config.logRetentionDays || 3);
          setCountTokensModel(data.config.countTokensModel || '');
          const userMsgs = Array.isArray(data.config.ephemeralUserMessages)
            ? data.config.ephemeralUserMessages.join('\n')
            : '';
          const sysMsgs = Array.isArray(data.config.ephemeralSystemMessages)
            ? data.config.ephemeralSystemMessages.join('\n')
            : '';
          setEphemeralUserMessagesText(userMsgs);
          setEphemeralSystemMessagesText(sysMsgs);

          const mappings = data.config.modelMappings || {};
          setModelMappingsRaw(JSON.stringify(mappings, null, 2));
          const entries: MappingEntry[] = Object.entries(mappings).map(([source, target]) => ({
            id: Math.random().toString(36).substring(2, 9),
            source,
            target: String(target)
          }));
          setMappingEntries(entries);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, adminKey]);

  if (!isOpen) return null;

  const updateRawFromEntries = (entries: MappingEntry[]) => {
    const obj: Record<string, string> = {};
    for (const e of entries) {
      if (e.source.trim()) {
        obj[e.source.trim()] = e.target.trim();
      }
    }
    setModelMappingsRaw(JSON.stringify(obj, null, 2));
  };

  const handleAddMapping = () => {
    const newEntries = [
      ...mappingEntries,
      { id: Math.random().toString(36).substring(2, 9), source: '', target: '' }
    ];
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleRemoveMapping = (id: string) => {
    const newEntries = mappingEntries.filter(e => e.id !== id);
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleEntryChange = (id: string, field: 'source' | 'target', value: string) => {
    const newEntries = mappingEntries.map(e => e.id === id ? { ...e, [field]: value } : e);
    setMappingEntries(newEntries);
    updateRawFromEntries(newEntries);
  };

  const handleToggleHigh = (id: string, target: string) => {
    const trimmed = target.trim();
    const newTarget = trimmed.endsWith('-high') ? trimmed.slice(0, -5) : (trimmed ? `${trimmed}-high` : '');
    handleEntryChange(id, 'target', newTarget);
  };

  const handleRawJsonChange = (val: string) => {
    setModelMappingsRaw(val);
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) {
        const entries: MappingEntry[] = Object.entries(parsed).map(([source, target]) => ({
          id: Math.random().toString(36).substring(2, 9),
          source,
          target: String(target)
        }));
        setMappingEntries(entries);
      }
    } catch {
      // Ignore JSON parse error while user is typing
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    let parsedMappings = {};
    try {
      parsedMappings = JSON.parse(modelMappingsRaw);
    } catch (err: any) {
      alert(`${t('config.alertInvalidJson')}${err.message}`);
      return;
    }

    setSaving(true);
    setToast('');

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(adminKey ? { 'x-admin-key': adminKey } : {})
    };

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          systemRoleToInstruction,
          customSystemInstruction,
          upstreamTimeoutMs,
          logLevel,
          logRetentionDays,
          countTokensModel,
          ephemeralUserMessages: ephemeralUserMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          ephemeralSystemMessages: ephemeralSystemMessagesText.split('\n').map(s => s.trim()).filter(Boolean),
          modelMappings: parsedMappings
        })
      });

      if (res.ok) {
        setToast(t('config.toastSaved'));
        setTimeout(() => {
          setToast('');
          if (onSaved) onSaved();
          onClose();
        }, 1000);
      } else {
        alert(t('config.alertSaveFail'));
      }
    } catch (err: any) {
      alert(`${t('config.alertSaveError')}${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/80">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <span>⚙️</span>
              <span>{t('config.modalTitle')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('config.modalSub')}</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">{t('config.loading')}</div>
        ) : (
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6">
            {toast && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs text-center font-bold">
                {toast}
              </div>
            )}

            {/* Section 1: System & Logs */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-blue-400 tracking-wide uppercase flex items-center space-x-1.5">
                <span>{t('config.sysLogsGroup')}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-200 block">LOG_LEVEL</label>
                  <select
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="error">error</option>
                    <option value="warn">warn</option>
                    <option value="info">info</option>
                    <option value="debug">debug</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-200 block">LOG_RETENTION_DAYS</label>
                  <input
                    type="number"
                    value={logRetentionDays}
                    onChange={(e) => setLogRetentionDays(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-400">{t('config.logRetentionDesc')}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-200 block">UPSTREAM_TIMEOUT_MS</label>
                  <input
                    type="number"
                    value={upstreamTimeoutMs}
                    onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Model Mappings */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-amber-400 tracking-wide uppercase flex items-center space-x-1.5">
                  <span>{t('config.modelMappingsGroup')}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAdvancedJson(!showAdvancedJson)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-amber-300 transition-colors"
                >
                  {showAdvancedJson ? t('config.toggleKv') : t('config.toggleJson')}
                </button>
              </div>

              {showAdvancedJson ? (
                <div className="space-y-1.5">
                  <textarea
                    rows={4}
                    value={modelMappingsRaw}
                    onChange={(e) => handleRawJsonChange(e.target.value)}
                    placeholder={t('config.mappingsPlaceholder')}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-3 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500 leading-relaxed"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {mappingEntries.length === 0 ? (
                    <div className="p-4 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-500">
                      {t('config.emptyMappings')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {mappingEntries.map((entry) => (
                        <div key={entry.id} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={entry.source}
                            onChange={(e) => handleEntryChange(entry.id, 'source', e.target.value)}
                            placeholder={t('config.sourceModel')}
                            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-amber-500"
                          />
                          <span className="text-slate-500 font-bold text-xs">→</span>
                          <input
                            type="text"
                            value={entry.target}
                            onChange={(e) => handleEntryChange(entry.id, 'target', e.target.value)}
                            placeholder={t('config.targetModel')}
                            className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleToggleHigh(entry.id, entry.target)}
                            className={`px-2.5 py-2 text-[10px] font-bold rounded-lg transition-all border shrink-0 ${
                              entry.target.trim().endsWith('-high')
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
                                : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-300 hover:border-slate-600'
                            }`}
                            title={t('config.highToggleTooltip')}
                          >
                            ⚡ HIGH
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveMapping(entry.id)}
                            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors text-xs"
                            title="Remove mapping"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddMapping}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-amber-400/90 rounded-xl text-xs font-semibold transition-all"
                  >
                    {t('config.addMapping')}
                  </button>
                </div>
              )}
            </div>

            {/* Section 3: Translation & Context Rules */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold text-emerald-400 tracking-wide uppercase flex items-center space-x-1.5">
                <span>{t('config.translationGroup')}</span>
              </h3>

              <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">SYSTEM_ROLE_TO_INSTRUCTION</span>
                  <button
                    type="button"
                    onClick={() => setSystemRoleToInstruction(!systemRoleToInstruction)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                      systemRoleToInstruction ? 'bg-emerald-600' : 'bg-slate-950 border border-slate-700'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${systemRoleToInstruction ? 'translate-x-5' : ''}`}></div>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">{t('config.systemRoleDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">COUNT_TOKENS_MODEL</label>
                <input
                  type="text"
                  value={countTokensModel}
                  onChange={(e) => setCountTokensModel(e.target.value)}
                  placeholder="e.g. gemini-2.5-flash (Leave blank to use request model)"
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400">{t('config.countTokensDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_USER_MESSAGES</label>
                <textarea
                  rows={2}
                  value={ephemeralUserMessagesText}
                  onChange={(e) => setEphemeralUserMessagesText(e.target.value)}
                  placeholder={t('config.ephemeralUserMessagesPlaceholder')}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
                />
                <p className="text-[10px] text-slate-400">{t('config.ephemeralUserMessagesDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">EPHEMERAL_SYSTEM_MESSAGES</label>
                <textarea
                  rows={2}
                  value={ephemeralSystemMessagesText}
                  onChange={(e) => setEphemeralSystemMessagesText(e.target.value)}
                  placeholder={t('config.ephemeralSystemMessagesPlaceholder')}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
                />
                <p className="text-[10px] text-slate-400">{t('config.ephemeralSystemMessagesDesc')}</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">CUSTOM_SYSTEM_INSTRUCTION</label>
                <textarea
                  rows={2}
                  value={customSystemInstruction}
                  onChange={(e) => setCustomSystemInstruction(e.target.value)}
                  placeholder={t('config.customInstructionPlaceholder')}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm(t('config.confirmReset'))) {
                    setSaving(true);
                    setToast('');
                    const headers: Record<string, string> = {
                      'content-type': 'application/json',
                      ...(adminKey ? { 'x-admin-key': adminKey } : {})
                    };
                    try {
                      const res = await fetch('/api/admin/config', {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ resetToEnv: true })
                      });
                      if (res.ok) {
                        setToast(t('config.toastReset'));
                        setTimeout(() => {
                          setToast('');
                          if (onSaved) onSaved();
                          onClose();
                        }, 1000);
                      } else {
                        alert(t('config.alertResetFail'));
                      }
                    } catch (err: any) {
                      alert(`${t('config.alertResetError')}${err.message}`);
                    } finally {
                      setSaving(false);
                    }
                  }
                }}
                disabled={saving}
                className="px-4 py-2 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 rounded-xl font-semibold text-xs transition-colors disabled:opacity-50"
              >
                {t('config.resetDefault')}
              </button>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
                >
                  {t('config.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-xl font-bold text-xs text-white transition-colors shadow-md"
                >
                  {saving ? t('config.applying') : t('config.save')}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
