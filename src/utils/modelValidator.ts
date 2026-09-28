import config from '../../config/default';

export { parseAllowedModels } from '../../config/default';

/**
 * Checks whether a given model is permitted by the proxy allowedModels whitelist.
 * @param originalModel The raw client-requested model name
 * @param resolvedModel The translated Gemini target base model name
 * @returns true if allowed, false if blocked
 */
export function isModelAllowed(originalModel?: string, resolvedModel?: string): boolean {
  const allowed = config.allowedModels;
  if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
    return true; // Default: all models permitted
  }

  const allowedSet = new Set(
    allowed.map(m => String(m || '').trim().toLowerCase()).filter(Boolean)
  );

  if (allowedSet.size === 0) {
    return true;
  }

  const normOriginal = originalModel ? originalModel.trim().toLowerCase() : '';
  const normResolved = resolvedModel ? resolvedModel.trim().toLowerCase() : '';

  if (normOriginal && allowedSet.has(normOriginal)) return true;
  if (normResolved && allowedSet.has(normResolved)) return true;

  return false;
}
