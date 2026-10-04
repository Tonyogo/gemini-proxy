// tests/r2LoggerService.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  saveTransactionAuditLog,
  listAuditLogs,
  getAuditLog,
  deleteAuditLog,
} from '../src/admin/services/r2LoggerService';
import { WorkerEnv } from '../src/env';

describe('r2LoggerService', () => {
  it('should gracefully no-op when LOGS_BUCKET is not bound', async () => {
    const env: WorkerEnv = {};
    const ctx = { waitUntil: vi.fn() } as any;
    saveTransactionAuditLog(env, ctx, {
      transactionId: 't1',
      timestamp: Date.now(),
      durationMs: 100,
      client_req: {},
      claude_res: {},
    });
    expect(ctx.waitUntil).not.toHaveBeenCalled();
    const list = await listAuditLogs(env);
    expect(list).toEqual([]);
  });

  it('should call bucket.put via ctx.waitUntil when LOGS_BUCKET is bound', async () => {
    const mockBucket = {
      put: vi.fn(async () => {}),
      list: vi.fn(async () => ({ objects: [{ key: 'logs/2026-10-04/13/1234_t1.json' }] })),
      get: vi.fn(async () => ({ json: async () => ({ transactionId: 't1' }) })),
      delete: vi.fn(async () => {}),
    };
    const env: WorkerEnv = { LOGS_BUCKET: mockBucket as any };
    const ctx = { waitUntil: vi.fn((promise) => promise) } as any;

    saveTransactionAuditLog(env, ctx, {
      transactionId: 't1',
      timestamp: new Date('2026-10-04T13:00:00Z').getTime(),
      durationMs: 120,
      client_req: {},
      claude_res: {},
    });

    expect(ctx.waitUntil).toHaveBeenCalled();
    const list = await listAuditLogs(env, '2026-10-04', '13');
    expect(list).toContain('logs/2026-10-04/13/1234_t1.json');

    const log = await getAuditLog(env, 'logs/2026-10-04/13/1234_t1.json');
    expect(log.transactionId).toBe('t1');

    const deleted = await deleteAuditLog(env, 'logs/2026-10-04/13/1234_t1.json');
    expect(deleted).toBe(true);
    expect(mockBucket.delete).toHaveBeenCalledWith('logs/2026-10-04/13/1234_t1.json');
  });
});
