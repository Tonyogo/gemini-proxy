import { isModelAllowed, parseAllowedModels } from '../src/utils/modelValidator';
import config, { updateConfig } from '../config/default';

describe('Model Validator & Allowed Models Parser', () => {
  beforeEach(async () => {
    await updateConfig({ allowedModels: [] });
  });

  it('parses comma-separated strings, json arrays, and sanitizes whitespace', () => {
    expect(parseAllowedModels('gemini-2.5-flash, claude-3-7-sonnet ')).toEqual([
      'gemini-2.5-flash',
      'claude-3-7-sonnet'
    ]);
    expect(parseAllowedModels('["gemini-2.5-pro", "gemini-2.5-flash"]')).toEqual([
      'gemini-2.5-pro',
      'gemini-2.5-flash'
    ]);
    expect(parseAllowedModels('')).toEqual([]);
    expect(parseAllowedModels(null)).toEqual([]);
  });

  it('allows all models when allowedModels is empty or not configured', () => {
    config.allowedModels = [];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);
    expect(isModelAllowed('any-unregistered-model')).toBe(true);
  });

  it('strictly checks exact string match (case-insensitive)', () => {
    config.allowedModels = ['gemini-2.5-flash', 'claude-3-7-sonnet'];

    // Exact matches
    expect(isModelAllowed('gemini-2.5-flash')).toBe(true);
    expect(isModelAllowed('GEMINI-2.5-FLASH')).toBe(true);
    expect(isModelAllowed('Claude-3-7-Sonnet')).toBe(true);

    // Prefix/suffix mismatches
    expect(isModelAllowed('gemini-2.5-flash-preview')).toBe(false);
    expect(isModelAllowed('claude-3-7-sonnet-20250219')).toBe(false);
    expect(isModelAllowed('claude-3-opus')).toBe(false);
  });

  it('supports dual-direction checking (either original or resolved matches)', () => {
    // Only target base model in whitelist
    config.allowedModels = ['gemini-2.5-pro'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);

    // Only client requested model in whitelist
    config.allowedModels = ['claude-3-5-sonnet'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(true);

    // Neither in whitelist
    config.allowedModels = ['gemini-2.5-flash'];
    expect(isModelAllowed('claude-3-5-sonnet', 'gemini-2.5-pro')).toBe(false);
  });
});
