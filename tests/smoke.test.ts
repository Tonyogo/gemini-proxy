// tests/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('Worker Environment Smoke Test', () => {
  it('should have standard Web APIs available in testing runtime', () => {
    expect(typeof Request).toBe('function');
    expect(typeof Response).toBe('function');
    expect(typeof ReadableStream).toBe('function');
    expect(typeof TransformStream).toBe('function');
  });
});
