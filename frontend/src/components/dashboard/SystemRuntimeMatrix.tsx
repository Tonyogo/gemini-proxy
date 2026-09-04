import React from 'react';
import { Cpu } from 'lucide-react';
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

  return (
    <div className="space-y-5">
      {/* System Runtime Configuration Matrix */}
      <div className="ui-card p-5 relative flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-[var(--text-primary)] tracking-wider uppercase">
              {t('dashboard.systemRuntimeMatrix')}
            </h3>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>ACTIVE</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1 font-mono text-xs">
          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              LOG_LEVEL
            </span>
            <span className="text-indigo-400 font-bold text-xs mt-1 truncate">
              {logLevel}
            </span>
          </div>

          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              UPSTREAM_TIMEOUT
            </span>
            <span className="text-purple-400 font-bold text-xs mt-1 truncate">
              {upstreamTimeoutMs}ms
            </span>
          </div>

          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              SYSTEM_ROLE_TO_INSTRUCTION
            </span>
            <span className={`font-bold text-xs mt-1 truncate ${systemRoleToInstruction ? 'text-emerald-400' : 'text-slate-400'}`}>
              {systemRoleToInstruction ? 'TRUE (INJECT)' : 'FALSE (INLINE)'}
            </span>
          </div>

          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              LOG_RETENTION_DAYS
            </span>
            <span className="text-sky-400 font-bold text-xs mt-1 truncate">
              {logRetentionDays} Days
            </span>
          </div>

          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              TIME_ZONE
            </span>
            <span className="text-[var(--text-primary)] font-bold text-xs mt-1 truncate" title={timeZone}>
              {timeZone}
            </span>
          </div>

          <div className="ui-card-sub p-3 flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              COUNT_TOKENS_MODEL
            </span>
            <span className="text-amber-400 font-bold text-xs mt-1 truncate" title={countTokensModel}>
              {countTokensModel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemRuntimeMatrix;
