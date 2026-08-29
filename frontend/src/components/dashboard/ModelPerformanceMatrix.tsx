import React from 'react';
import { Layers } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

export interface ModelStatItem {
  model: string;
  requests: number;
  percentage: number;
  avgLatency: number;
}

export interface ModelPerformanceMatrixProps {
  modelStats: {
    totalRequests: number;
    list: ModelStatItem[];
  };
  getModelColor: (modelName: string, index: number) => string;
}

export const ModelPerformanceMatrix: React.FC<ModelPerformanceMatrixProps> = ({
  modelStats,
  getModelColor,
}) => {
  const { t } = useTranslation();

  const count = modelStats?.list?.length || 0;

  return (
    <div className="bg-[#0F1118]/90 border border-white/[0.08] rounded-xl p-5 shadow-lg flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h3 className="text-xs font-semibold text-slate-200 tracking-wider uppercase">
            {t('dashboard.modelPerformanceTitle')}
          </h3>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full font-mono border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-medium">
          {count} {t('dashboard.modelsTracked')}
        </span>
      </div>

      {!modelStats?.list || count === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[160px] text-slate-500 text-xs font-mono">
          {t('dashboard.noData')}
        </div>
      ) : (
        <div className="max-h-[380px] overflow-y-auto pr-1 space-y-3.5">
          {modelStats.list.map((item, index) => {
            const color = getModelColor(item.model, index);
            return (
              <div key={item.model} className="space-y-1.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 sm:gap-0">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="font-mono font-medium text-slate-200 truncate max-w-[150px] xs:max-w-[180px] sm:max-w-[220px]"
                      title={item.model}
                    >
                      {item.model}
                    </span>
                    <span className="text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0">
                      ~{item.avgLatency}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2 shrink-0 font-mono text-[11px] sm:text-xs pl-4 sm:pl-0 text-slate-400">
                    <span>{item.requests} reqs</span>
                    <span className="text-slate-200 font-semibold w-9 text-right">
                      {item.percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-white/[0.04] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.max(item.percentage, 2)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ModelPerformanceMatrix;
