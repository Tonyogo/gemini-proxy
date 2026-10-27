export interface MappingEntry {
  id: string;
  source: string;
  target: string;
  strategy?: string;
}

export function parseMappingsObjectToEntries(mappings: Record<string, any>): MappingEntry[] {
  if (!mappings || typeof mappings !== 'object') return [];
  return Object.entries(mappings).map(([source, val]) => {
    if (Array.isArray(val)) {
      return {
        id: Math.random().toString(36).substring(2, 9),
        source,
        target: val.join(', '),
        strategy: ''
      };
    }
    if (val && typeof val === 'object') {
      if ('targets' in val && Array.isArray((val as any).targets)) {
        const targetObj = val as { targets: string[]; strategy?: string };
        return {
          id: Math.random().toString(36).substring(2, 9),
          source,
          target: targetObj.targets.join(', '),
          strategy: targetObj.strategy || ''
        };
      }
      if ('target' in val) {
        const targetObj = val as { target: string; strategy?: string };
        return {
          id: Math.random().toString(36).substring(2, 9),
          source,
          target: String(targetObj.target || ''),
          strategy: targetObj.strategy || ''
        };
      }
    }
    return {
      id: Math.random().toString(36).substring(2, 9),
      source,
      target: String(val || ''),
      strategy: ''
    };
  });
}

export function serializeEntriesToMappingsObject(entries: MappingEntry[]): Record<string, any> {
  const obj: Record<string, any> = {};
  for (const e of entries) {
    if (e.source.trim()) {
      const targetTrimmed = e.target.trim();
      const strategyTrimmed = e.strategy?.trim();

      if (targetTrimmed.includes(',')) {
        const parts = targetTrimmed.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length > 1) {
          if (strategyTrimmed) {
            obj[e.source.trim()] = {
              targets: parts,
              strategy: strategyTrimmed
            };
          } else {
            obj[e.source.trim()] = parts;
          }
        } else if (parts.length === 1) {
          if (strategyTrimmed) {
            obj[e.source.trim()] = {
              target: parts[0],
              strategy: strategyTrimmed
            };
          } else {
            obj[e.source.trim()] = parts[0];
          }
        }
      } else {
        if (strategyTrimmed) {
          obj[e.source.trim()] = {
            target: targetTrimmed,
            strategy: strategyTrimmed
          };
        } else {
          obj[e.source.trim()] = targetTrimmed;
        }
      }
    }
  }
  return obj;
}
