import React, { useState } from 'react';

interface JsonNodeProps {
  name?: string;
  value: any;
  depth?: number;
  initialExpandedDepth?: number;
  isLast?: boolean;
}

export function JsonNode({
  name,
  value,
  depth = 0,
  initialExpandedDepth = 2,
  isLast = true
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState<boolean>(depth < initialExpandedDepth);

  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);

  if (!isObject) {
    let valueColor = 'text-emerald-400'; // string default
    let displayValue = JSON.stringify(value);

    if (typeof value === 'number') {
      valueColor = 'text-blue-400';
    } else if (typeof value === 'boolean') {
      valueColor = 'text-purple-400';
    } else if (value === null || value === undefined) {
      valueColor = 'text-slate-500 italic';
      displayValue = String(value);
    }

    return (
      <div className="font-mono text-[11px] leading-relaxed flex items-start space-x-1 hover:bg-slate-800/40 px-1 rounded">
        {name && <span className="text-amber-200/90 font-semibold">{name}:</span>}
        <span className={`break-all ${valueColor}`}>{displayValue}</span>
        {!isLast && <span className="text-slate-500">,</span>}
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
        onClick={() => setExpanded(!expanded)}
        className="flex items-center space-x-1 cursor-pointer hover:bg-slate-800/60 px-1 rounded select-none group"
      >
        <span className="text-[9px] text-slate-500 group-hover:text-slate-300 w-3 inline-block">
          {expanded ? '▼' : '▶'}
        </span>
        {name && <span className="text-amber-200/90 font-semibold">{name}:</span>}
        <span className="text-slate-400 font-sans text-[10px]">
          {isArray ? `Array(${itemCount})` : `Object`}
        </span>
        {!expanded && (
          <span className="text-slate-500">
            {bracketOpen} ... {bracketClose}
            {!isLast && ','}
          </span>
        )}
      </div>

      {expanded && (
        <div className="pl-4 border-l border-slate-800/80 ml-1.5 my-0.5 space-y-0.5">
          {keys.map((key, index) => (
            <JsonNode
              key={key}
              name={isArray ? undefined : key}
              value={value[key]}
              depth={depth + 1}
              initialExpandedDepth={initialExpandedDepth}
              isLast={index === keys.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonTreeView({ data, initialExpandedDepth = 2 }: { data: any; initialExpandedDepth?: number }) {
  if (data === undefined || data === null) {
    return <div className="text-slate-500 text-xs italic font-mono p-2">null</div>;
  }

  return (
    <div className="bg-slate-950/90 p-3 rounded-xl border border-slate-800/80 overflow-x-auto">
      <JsonNode value={data} depth={0} initialExpandedDepth={initialExpandedDepth} />
    </div>
  );
}
