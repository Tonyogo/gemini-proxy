// tests/upstreamService.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getUpstreamKey,
  recordKeyFailure,
  recordKeySuccess,
  resetKeyPool,
} from '../src/proxy/services/upstreamService';
import { WorkerEnv } from '../src/env';

describe('upstreamService', () => {
  beforeEach(() => {
    resetKeyPool();
  });

  it('should rotate keys in round-robin order', () => {
    const env: WorkerEnv = {
      GEMINI_API_KEYS: 'key1,key2,key3',
    };
    expect(getUpstreamKey(env)).toBe('key1');
    expect(getUpstreamKey(env)).toBe('key2');
    expect(getUpstreamKey(env)).toBe('key3');
    expect(getUpstreamKey(env)).toBe('key1');
  });

  it('should cool down failing key on 429 and skip to healthy key', () => {
    const env: WorkerEnv = {
      GEMINI_API_KEYS: 'key1,key2',
    };
    expect(getUpstreamKey(env)).toBe('key1');
    recordKeyFailure('key1', 429);
    // key1 is in cooldown, should return key2
    expect(getUpstreamKey(env)).toBe('key2');
    expect(getUpstreamKey(env)).toBe('key2');
  });
});
