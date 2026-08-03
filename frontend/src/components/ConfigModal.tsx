import React, { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/LanguageContext';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminKey: string;
  onSaved?: () => void;
}

export default function ConfigModal({ isOpen, onClose, adminKey, onSaved }: ConfigModalProps) {
  const { t } = useTranslation();
  const [systemRoleToInstruction, setSystemRoleToInstruction] = useState<boolean>(false);
  const [runtimeContextTag, setRuntimeContextTag] = useState<string>('runtime-context');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');
  const [logRetentionDays, setLogRetentionDays] = useState<number>(3);
  const [countTokensModel, setCountTokensModel] = useState<string>('');
  const [modelMappingsRaw, setModelMappingsRaw] = useState<string>('{}');

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
          setRuntimeContextTag(data.config.runtimeContextTag || 'runtime-context');
          setCustomSystemInstruction(data.config.customSystemInstruction || '');
          setUpstreamTimeoutMs(data.config.upstreamTimeoutMs || 180000);
          setLogLevel(data.config.logLevel || 'info');
          setLogRetentionDays(data.config.logRetentionDays || 3);
          setCountTokensModel(data.config.countTokensModel || '');
          setModelMappingsRaw(JSON.stringify(data.config.modelMappings || {}, null, 2));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, adminKey]);

  if (!isOpen) return null;

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
          runtimeContextTag,
          customSystemInstruction,
          upstreamTimeoutMs,
          logLevel,
          logRetentionDays,
          countTokensModel,
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
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
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5">
            {toast && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs text-center font-bold">
                {toast}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Boolean Switch */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">SYSTEM_ROLE_TO_INSTRUCTION</span>
                  <button
                    type="button"
                    onClick={() => setSystemRoleToInstruction(!systemRoleToInstruction)}
                    className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                      systemRoleToInstruction ? 'bg-emerald-600' : 'bg-slate-900 border border-slate-700'
                    }`}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${systemRoleToInstruction ? 'translate-x-6' : ''}`}></div>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">{t('config.systemRoleDesc')}</p>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">RUNTIME_CONTEXT_TAG</label>
                <input
                  type="text"
                  value={runtimeContextTag}
                  onChange={(e) => setRuntimeContextTag(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">UPSTREAM_TIMEOUT_MS</label>
                <input
                  type="number"
                  value={upstreamTimeoutMs}
                  onChange={(e) => setUpstreamTimeoutMs(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
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

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-semibold text-slate-200 block">LOG_RETENTION_DAYS</label>
                <input
                  type="number"
                  value={logRetentionDays}
                  onChange={(e) => setLogRetentionDays(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500"
                />
                <p className="text-[10px] text-slate-400">{t('config.logRetentionDesc')}</p>
              </div>
            </div>

            {/* Custom System Instruction */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
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

            {/* Custom System Instruction */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">CUSTOM_SYSTEM_INSTRUCTION</label>
              <textarea
                rows={3}
                value={customSystemInstruction}
                onChange={(e) => setCustomSystemInstruction(e.target.value)}
                placeholder={t('config.customInstructionPlaceholder')}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            {/* Model Mappings Editor */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">MODEL_MAPPINGS (JSON Dictionary)</label>
              <textarea
                rows={3}
                value={modelMappingsRaw}
                onChange={(e) => setModelMappingsRaw(e.target.value)}
                placeholder={t('config.mappingsPlaceholder')}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
              />
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
