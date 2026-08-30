import React from 'react';
import { Cpu, ArrowRightLeft } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface SystemRuntimeMatrixProps {
  config: Record<string, any>;
}

export const SystemRuntimeMatrix: React.FC<SystemRuntimeMatrixProps> = ({ config }) => {
  const { t } = useTranslation();

  const logLevel = config?.logLevel || 'info';
  const upstreamTimeoutMs = config?.upstreamTimeoutMs || 180000;
  const systemRoleToInstruction = config?.systemRoleToInstruction !== false;
  const logRetentionDays = config?.logRetentionDays ?? 3;
  const timeZone = config?.timeZone || 'Asia/Shanghai';
  const countTokensModel = config?.countTokensModel || 'Default Model';
  const modelMappings = config?.modelMappings || {};
  const mappingKeys = Object.keys(modelMappings);

  return (
    <div className="space-y-5">
      {/* System Runtime Configuration Matrix */}
      <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 shadow-lg relative flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">
              {t('dashboard.systemRuntimeMatrix')}
            </h3>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>ACTIVE</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 font-mono text-xs">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              LOG_LEVEL
            </span>
            <span className="text-indigo-400 font-bold text-xs mt-1 truncate">
              {logLevel}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              UPSTREAM_TIMEOUT
            </span>
            <span className="text-purple-400 font-bold text-xs mt-1 truncate">
              {upstreamTimeoutMs}ms
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              SYSTEM_ROLE_TO_INSTRUCTION
            </span>
            <span className={`font-bold text-xs mt-1 truncate ${systemRoleToInstruction ? 'text-emerald-400' : 'text-slate-400'}`}>
              {systemRoleToInstruction ? 'TRUE (INJECT)' : 'FALSE (INLINE)'}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              LOG_RETENTION_DAYS
            </span>
            <span className="text-sky-400 font-bold text-xs mt-1 truncate">
              {logRetentionDays} Days
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              TIME_ZONE
            </span>
            <span className="text-slate-300 font-bold text-xs mt-1 truncate" title={timeZone}>
              {timeZone}
            </span>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              COUNT_TOKENS_MODEL
            </span>
            <span className="text-amber-400 font-bold text-xs mt-1 truncate" title={countTokensModel}>
              {countTokensModel}
            </span>
          </div>
        </div>
      </div>

      {/* Prominent Active Model Routing & Aliases Section */}
      <div className="bg-[#0F1118]/90 border border-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.04)] rounded-xl p-5 relative flex flex-col">
        {/* Section Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">
                  {t('dashboard.modelMappingsTitle', 'Active Model Mappings')}
                </h3>
                <span className="px-2 py-0.5 text-[10px] rounded-full font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                  ({mappingKeys.length} rules)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('dashboard.modelMappingsSub', 'Declarative model aliasing rules that transparently redirect requests to target models')}
              </p>
            </div>
          </div>
        </div>

        {/* Visual Routing Cards List */}
        {mappingKeys.length > 0 ? (
          <div className="space-y-2.5">
            {mappingKeys.map((src) => {
              const val = modelMappings[src];
              let targets: string[] = [];
              let strategy = '';

              if (Array.isArray(val)) {
                targets = val.map(String);
                strategy = 'round-robin';
              } else if (val && typeof val === 'object') {
                if ('targets' in val && Array.isArray((val as any).targets)) {
                  targets = (val as any).targets.map(String);
                  strategy = (val as any).strategy || 'round-robin';
                } else if ('target' in val) {
                  const tVal = (val as any).target;
                  if (Array.isArray(tVal)) {
                    targets = tVal.map(String);
                  } else if (typeof tVal === 'string') {
                    targets = tVal.split(',').map((s: string) => s.trim()).filter(Boolean);
                  } else if (tVal) {
                    targets = [String(tVal)];
                  }
                  strategy = (val as any).strategy || (targets.length > 1 ? 'round-robin' : '');
                }
              } else if (typeof val === 'string') {
                targets = val.split(',').map((s: string) => s.trim()).filter(Boolean);
                if (targets.length > 1) {
                  strategy = 'round-robin';
                }
              } else if (val) {
                targets = [String(val)];
              }

              const numBadges = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

              const formatStrategy = (strat: string) => {
                if (!strat) return '';
                const s = strat.toLowerCase();
                if (s === 'round-robin') return '⚡ 轮询分发 (Round-Robin)';
                if (s === 'least-used') return '⚡ 最少使用 (Least-Used)';
                if (s === 'weighted') return '⚡ 加权 (Weighted)';
                return `⚡ ${strat}`;
              };

              return (
                <div
                  key={src}
                  className="bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/30 transition-all rounded-xl p-3.5 flex flex-col space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {/* Source Box (Left) */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="font-mono font-bold text-slate-100 bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/[0.08] truncate max-w-[200px]" title={src}>
                        {src}
                      </span>
                    </div>

                    {/* Flow Arrow & Strategy (Center) */}
                    <div className="flex items-center space-x-2 shrink-0 my-0.5 sm:my-0">
                      <span className="text-amber-400/80 font-bold text-sm">→</span>
                      {strategy && (
                        <span className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                          {formatStrategy(strategy)}
                        </span>
                      )}
                    </div>

                    {/* Target Cluster (Right) */}
                    <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end items-center">
                      {targets.length > 1 ? (
                        targets.map((tgt, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          >
                            {numBadges[idx] || `${idx + 1}.`} {tgt}
                          </span>
                        ))
                      ) : targets.length === 1 ? (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {targets[0]}
                        </span>
                      ) : (
                        <span className="text-slate-500 text-xs italic">No target</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-6 text-center text-slate-500 text-xs italic">
            {t('config.emptyMappings', 'No model mapping rules configured.')}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemRuntimeMatrix;
