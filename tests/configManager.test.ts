// tests/configManager.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getConfig, updateConfig, clearConfigCache } from '../src/config/configManager';
import { WorkerEnv } from '../src/env';

describe('ConfigManager', () => {
  let mockEnv: WorkerEnv;
  let kvStore: Record<string, string>;

  beforeEach(() => {
    clearConfigCache();
    kvStore = {};
    mockEnv = {
      GEMINI_BASE_URL: 'https://default.googleapis.com',
      ADMIN_SECRET_KEY: 'secret-123',
      CONFIG_KV: {
        get: vi.fn(async (key: string, type?: string) => {
          const val = kvStore[key];
          if (!val) return null;
          if (type === 'json') return JSON.parse(val);
          return val;
        }),
        put: vi.fn(async (key: string, val: string) => {
          kvStore[key] = val;
        }),
      } as any,
    };
  });

  it('should return env defaults when KV is empty', async () => {
    const config = await getConfig(mockEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://default.googleapis.com');
    expect(config.ADMIN_SECRET_KEY).toBe('secret-123');
  });

  it('should override defaults with KV values and invalidate on update', async () => {
    await updateConfig(mockEnv, { GEMINI_BASE_URL: 'https://custom.googleapis.com' });
    const config = await getConfig(mockEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://custom.googleapis.com');
  });

  it('should fall back gracefully to env when CONFIG_KV is not provided', async () => {
    const noKvEnv: WorkerEnv = { GEMINI_BASE_URL: 'https://fallback.com' };
    const config = await getConfig(noKvEnv);
    expect(config.GEMINI_BASE_URL).toBe('https://fallback.com');
  });
});
