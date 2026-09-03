import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';

interface JsonNodeProps {
  name?: string;
  value: any;
  depth?: number;
  isLast?: boolean;
  path?: string;
  expandedKeys: Set<string>;
  toggleKey: (path: string) => void;
}

export function JsonNode({
  name,
  value,
  depth = 0,
  isLast = true,
  path = '',
  expandedKeys,
  toggleKey,
}: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const isExpanded = expandedKeys.has(path);

  if (!isObject) {
    let valueColor = 'text-emerald-700 dark:text-emerald-300'; // string default
    let displayValue = JSON.stringify(value);

    if (typeof value === 'number') {
      valueColor = 'text-blue-600 dark:text-blue-300 font-semibold';
    } else if (typeof value === 'boolean') {
      valueColor = 'text-amber-700 dark:text-amber-400 font-semibold';
    } else if (value === null) {
      valueColor = 'text-slate-400 dark:text-slate-500 italic';
      displayValue = 'null';
    } else if (value === undefined) {
      valueColor = 'text-slate-400 dark:text-slate-500 italic';
      displayValue = 'undefined';
    }

    return (
      <div className="font-mono text-[11px] leading-relaxed flex items-center justify-between hover:bg-black/[0.04] dark:hover:bg-slate-800/50 px-1.5 py-0.5 rounded transition-colors">
        <div className="flex items-start space-x-1.5 min-w-0 pr-2">
          {name && (
            <span className="text-indigo-600 dark:text-indigo-300 font-semibold shrink-0 select-none">
              "{name}":
            </span>
          )}
          <span className={`break-all ${valueColor}`}>{displayValue}</span>
          {!isLast && <span className="text-slate-400 dark:text-slate-600 select-none">,</span>}
        </div>
      </div>
    );
  }

  const keys = Object.keys(value);
  const itemCount = keys.length;
  const bracketOpen = isArray ? '[' : '{';
  const bracketClose = isArray ? ']' : '}';

  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <div
        onClick={() => toggleKey(path)}
        className="flex items-center justify-between cursor-pointer hover:bg-black/[0.04] dark:hover:bg-slate-800/50 px-1.5 py-0.5 rounded select-none transition-colors"
      >
        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          <span className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 w-3.5 h-3.5 flex items-center justify-center shrink-0 transition-transform">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400/80" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300" />
            )}
          </span>
          {name && (
            <span className="text-indigo-600 dark:text-indigo-300 font-semibold shrink-0">
              "{name}":
            </span>
          )}
          <span className="text-slate-500 text-[10px]">
            {isArray ? `Array(${itemCount})` : `Object`}
          </span>
          {!isExpanded && (
            <span className="text-slate-500 font-mono">
              {bracketOpen} ... {bracketClose}
              {!isLast && <span className="text-slate-400 dark:text-slate-600">,</span>}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="pl-3.5 border-l border-indigo-500/20 ml-2 my-0.5 space-y-0.5">
          {keys.map((key, index) => {
            const childPath = path ? (isArray ? `${path}[${key}]` : `${path}.${key}`) : key;
            return (
              <JsonNode
                key={key}
                name={isArray ? undefined : key}
                value={value[key]}
                depth={depth + 1}
                isLast={index === keys.length - 1}
                path={childPath}
                expandedKeys={expandedKeys}
                toggleKey={toggleKey}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// Collect all expandable object / array paths up to a given max depth
function collectPaths(obj: any, maxDepth: number, currentDepth = 0, currentPath = ''): string[] {
  if (obj === null || typeof obj !== 'object' || currentDepth >= maxDepth) {
    return [];
  }
  const paths: string[] = [];
  if (currentPath !== '') {
    paths.push(currentPath);
  } else {
    paths.push('root');
  }

  const isArray = Array.isArray(obj);
  for (const key of Object.keys(obj)) {
    const nextPath = currentPath === '' ? (isArray ? `[${key}]` : key) : (isArray ? `${currentPath}[${key}]` : `${currentPath}.${key}`);
    paths.push(...collectPaths(obj[key], maxDepth, currentDepth + 1, nextPath));
  }
  return paths;
}

export default function JsonTreeView({
  data,
  initialExpandedDepth = 1
}: {
  data: any;
  initialExpandedDepth?: number;
}) {
  const { t } = useTranslation();
  // Compute initial paths based on initialExpandedDepth
  const defaultExpanded = useMemo(() => {
    const paths = collectPaths(data, initialExpandedDepth);
    return new Set(paths);
  }, [data, initialExpandedDepth]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(defaultExpanded);
  const [copiedAll, setCopiedAll] = useState(false);

  // Sync state if data changes
  React.useEffect(() => {
    setExpandedKeys(new Set(collectPaths(data, initialExpandedDepth)));
  }, [data, initialExpandedDepth]);

  if (data === undefined || data === null) {
    return <div className="text-slate-500 text-xs italic font-mono p-3">null</div>;
  }

  const toggleKey = (path: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    const allPaths = collectPaths(data, 50);
    setExpandedKeys(new Set(allPaths));
  };

  const handleCollapseAll = () => {
    setExpandedKeys(new Set());
  };

  const handleCopyAll = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--code-bg)] rounded-xl border border-[var(--border-subtle)]">
      {/* Action Toolbar Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] select-none text-[11px] shrink-0">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span className="font-mono text-[10px] text-[var(--text-primary)] font-semibold">{t('logs.jsonInspector', 'JSON 检查器')}</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleExpandAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] transition-colors"
            title="Expand all nodes"
          >
            {t('logs.expandAll', '全部展开')}
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] transition-colors"
            title="Collapse all nodes"
          >
            {t('logs.collapseAll', '全部折叠')}
          </button>
          <button
            onClick={handleCopyAll}
            className="px-2 py-0.5 rounded ui-btn-secondary text-[10px] flex items-center space-x-1 transition-colors ml-1"
            title="Copy full JSON"
          >
            {copiedAll ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-500 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">{t('logs.copied', '已复制')}</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>{t('logs.copy', '复制 JSON')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* JSON Tree Viewport */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        <JsonNode
          value={data}
          depth={0}
          path="root"
          expandedKeys={expandedKeys}
          toggleKey={toggleKey}
        />
      </div>
    </div>
  );
}
