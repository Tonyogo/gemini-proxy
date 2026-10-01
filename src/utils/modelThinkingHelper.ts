export interface ModelThinkingInfo {
  baseModel: string;
  isHigh: boolean;
  thinkingLevel?: 'HIGH';
}

/**
 * Parses a model name and detects whether it has a `-high` suffix.
 * Returns the base model name and whether thinking level should be 'HIGH'.
 */
export function parseModelThinkingSuffix(model?: string): ModelThinkingInfo {
  const trimmed = String(model || '').trim();
  if (trimmed.toLowerCase().endsWith('-high')) {
    return {
      baseModel: trimmed.slice(0, -5),
      isHigh: true,
      thinkingLevel: 'HIGH'
    };
  }
  return {
    baseModel: trimmed,
    isHigh: false
  };
}

/**
 * Injects thinkingLevel: 'HIGH' into generationConfig.thinkingConfig while stripping includeThoughts.
 * Preserves other custom thinkingConfig properties.
 */
export function applyThinkingConfigHigh(generationConfig: any = {}): any {
  const existingThinking = generationConfig?.thinkingConfig || {};
  const { includeThoughts, ...cleanThinking } = existingThinking;
  generationConfig.thinkingConfig = {
    ...cleanThinking,
    thinkingLevel: 'HIGH'
  };
  return generationConfig;
}

