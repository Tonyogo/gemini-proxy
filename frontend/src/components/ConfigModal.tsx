import React, { useEffect, useState } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminKey: string;
  onSaved?: () => void;
}

export default function ConfigModal({ isOpen, onClose, adminKey, onSaved }: ConfigModalProps) {
  const [systemRoleToInstruction, setSystemRoleToInstruction] = useState<boolean>(false);
  const [runtimeContextTag, setRuntimeContextTag] = useState<string>('runtime-context');
  const [customSystemInstruction, setCustomSystemInstruction] = useState<string>('');
  const [upstreamTimeoutMs, setUpstreamTimeoutMs] = useState<number>(180000);
  const [logLevel, setLogLevel] = useState<string>('info');

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
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, adminKey]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
          logLevel
        })
      });

      if (res.ok) {
        setToast('✓ Configuration updated live!');
        setTimeout(() => {
          setToast('');
          if (onSaved) onSaved();
          onClose();
        }, 1000);
      } else {
        alert('Failed to update configuration');
      }
    } catch (err: any) {
      alert(`Error updating configuration: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center space-x-2">
              <span>⚙️</span>
              <span>Proxy Runtime Configuration</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Tweak transformation rules and timeouts on the fly without server restart</p>
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
          <div className="p-12 text-center text-slate-400 text-xs">Loading current settings...</div>
        ) : (
          <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-5">
            {toast && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs text-center font-bold">
                {toast}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-slate-200">SYSTEM_ROLE_TO_INSTRUCTION</span>
                  <input
                    type="checkbox"
                    checked={systemRoleToInstruction}
                    onChange={(e) => setSystemRoleToInstruction(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-500 bg-slate-900"
                  />
                </label>
                <p className="text-[10px] text-slate-400">Convert inline system messages into systemInstruction.</p>
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
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 block">CUSTOM_SYSTEM_INSTRUCTION</label>
              <textarea
                rows={3}
                value={customSystemInstruction}
                onChange={(e) => setCustomSystemInstruction(e.target.value)}
                placeholder="Supplementary instructions injected into all upstream calls..."
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 rounded-xl font-bold text-xs text-white transition-colors shadow-md"
              >
                {saving ? 'Applying...' : 'Save & Apply Live'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
