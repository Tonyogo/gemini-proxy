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

/**
 * Injects thinkingLevel: 'MEDIUM' into generationConfig.thinkingConfig while stripping includeThoughts.
 * Preserves other custom thinkingConfig properties.
 */
export function applyThinkingConfigMedium(generationConfig: any = {}): any {
  const existingThinking = generationConfig?.thinkingConfig || {};
  const { includeThoughts, ...cleanThinking } = existingThinking;
  generationConfig.thinkingConfig = {
    ...cleanThinking,
    thinkingLevel: 'MEDIUM'
  };
  return generationConfig;
}

/**
 * Checks whether the client explicitly configured thinking in Gemini generationConfig.
 * Returns true if thinkingConfig is explicitly present on generationConfig.
 */
export function hasGeminiExplicitThinking(generationConfig?: any): boolean {
  if (!generationConfig || typeof generationConfig !== 'object') return false;
  return 'thinkingConfig' in generationConfig && generationConfig.thinkingConfig !== undefined;
}

/**
 * Checks whether the client explicitly configured thinking or effort in a Claude request body.
 * Returns true if claudeBody.thinking or claudeBody.output_config?.effort is explicitly defined.
 */
export function hasClaudeExplicitThinking(claudeBody?: any): boolean {
  if (!claudeBody || typeof claudeBody !== 'object') return false;
  if (claudeBody.thinking !== undefined) return true;
  if (claudeBody.output_config && typeof claudeBody.output_config === 'object' && claudeBody.output_config.effort !== undefined) {
    return true;
  }
  return false;
}

