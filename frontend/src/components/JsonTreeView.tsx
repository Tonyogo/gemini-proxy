import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, ChevronsUpDown } from 'lucide-react';

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
  const [copiedValue, setCopiedValue] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const isExpanded = expandedKeys.has(path);

  const handleCopyValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const textToCopy = typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value);
      navigator.clipboard.writeText(textToCopy);
      setCopiedValue(true);
      setTimeout(() => setCopiedValue(false), 1500);
    } catch {
      // fallback
    }
  };

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!path) return;
    try {
      navigator.clipboard.writeText(path);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      // fallback
    }
  };

  if (!isObject) {
    let valueColor = 'text-emerald-300'; // string default
    let displayValue = JSON.stringify(value);

    if (typeof value === 'number') {
      valueColor = 'text-purple-300';
    } else if (typeof value === 'boolean') {
      valueColor = 'text-amber-400 font-semibold';
    } else if (value === null) {
      valueColor = 'text-slate-500 italic';
      displayValue = 'null';
    } else if (value === undefined) {
      valueColor = 'text-slate-500 italic';
      displayValue = 'undefined';
    }

    return (
      <div className="font-mono text-[11px] leading-relaxed flex items-center justify-between group/line hover:bg-slate-800/50 px-1.5 py-0.5 rounded transition-colors">
        <div className="flex items-start space-x-1.5 min-w-0 pr-2">
          {name && (
            <span className="text-indigo-300 font-semibold shrink-0 select-none">
              "{name}":
            </span>
          )}
          <span className={`break-all ${valueColor}`}>{displayValue}</span>
          {!isLast && <span className="text-slate-600 select-none">,</span>}
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="opacity-0 group-hover/line:opacity-100 transition-opacity flex items-center space-x-1 shrink-0 select-none pl-2">
          {path && (
            <button
              onClick={handleCopyPath}
              title={`Copy path: ${path}`}
              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 flex items-center space-x-1 transition-colors"
            >
              {copiedPath ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400">Path</span>
                </>
              ) : (
                <span>Path</span>
              )}
            </button>
          )}
          <button
            onClick={handleCopyValue}
            title="Copy value"
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 flex items-center space-x-1 transition-colors"
          >
            {copiedValue ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>Value</span>
              </>
            )}
          </button>
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
        className="flex items-center justify-between cursor-pointer hover:bg-slate-800/50 px-1.5 py-0.5 rounded select-none group/line transition-colors"
      >
        <div className="flex items-center space-x-1.5 min-w-0 pr-2">
          <span className="text-slate-500 group-hover/line:text-slate-300 w-3.5 h-3.5 flex items-center justify-center shrink-0 transition-transform">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-indigo-400/80" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover/line:text-slate-300" />
            )}
          </span>
          {name && (
            <span className="text-indigo-300 font-semibold shrink-0">
              "{name}":
            </span>
          )}
          <span className="text-slate-500 text-[10px]">
            {isArray ? `Array(${itemCount})` : `Object`}
          </span>
          {!isExpanded && (
            <span className="text-slate-500 font-mono">
              {bracketOpen} ... {bracketClose}
              {!isLast && <span className="text-slate-600">,</span>}
            </span>
          )}
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="opacity-0 group-hover/line:opacity-100 transition-opacity flex items-center space-x-1 shrink-0 select-none pl-2">
          {path && (
            <button
              onClick={handleCopyPath}
              title={`Copy path: ${path}`}
              className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 flex items-center space-x-1 transition-colors"
            >
              {copiedPath ? (
                <>
                  <Check className="w-2.5 h-2.5 text-emerald-400" />
                  <span className="text-emerald-400">Path</span>
                </>
              ) : (
                <span>Path</span>
              )}
            </button>
          )}
          <button
            onClick={handleCopyValue}
            title="Copy JSON object"
            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/60 flex items-center space-x-1 transition-colors"
          >
            {copiedValue ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>JSON</span>
              </>
            )}
          </button>
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
    <div className="bg-slate-950/90 rounded-xl border border-slate-800/80 overflow-hidden flex flex-col">
      {/* Action Toolbar Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-slate-800/80 select-none text-[11px]">
        <div className="flex items-center space-x-1.5 text-slate-400">
          <ChevronsUpDown className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-mono text-[10px] text-slate-300 font-semibold">JSON Inspector</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={handleExpandAll}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 text-[10px] transition-colors"
            title="Expand all nodes"
          >
            Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 text-[10px] transition-colors"
            title="Collapse all nodes"
          >
            Collapse All
          </button>
          <button
            onClick={handleCopyAll}
            className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 hover:text-indigo-200 border border-indigo-500/30 text-[10px] flex items-center space-x-1 transition-colors ml-1"
            title="Copy full JSON"
          >
            {copiedAll ? (
              <>
                <Check className="w-2.5 h-2.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-2.5 h-2.5" />
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* JSON Tree Viewport */}
      <div className="p-3 overflow-x-auto">
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
