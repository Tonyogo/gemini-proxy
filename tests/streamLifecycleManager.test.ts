import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { StreamLifecycleManager } from '../src/utils/streamLifecycleManager';

describe('StreamLifecycleManager', () => {
  let mockReq: EventEmitter & Partial<Request>;
  let mockRes: EventEmitter & Partial<Response>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReq = new EventEmitter() as any;
    mockRes = new EventEmitter() as any;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should initialize with an un-aborted AbortSignal and null reason', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_1'
    });

    expect(manager.signal.aborted).toBe(false);
    expect(manager.isAborted).toBe(false);
    expect(manager.reason).toBeNull();
  });

  it('should abort AbortSignal with client_disconnect reason when res emits close event', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_2'
    });

    mockRes.emit('close');

    expect(manager.signal.aborted).toBe(true);
    expect(manager.isAborted).toBe(true);
    expect(manager.reason).toBe('client_disconnect');
  });

  it('should abort with timeout reason when timeout timer fires', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_timeout',
      timeoutMs: 5000
    });

    expect(manager.signal.aborted).toBe(false);

    jest.advanceTimersByTime(5000);

    expect(manager.signal.aborted).toBe(true);
    expect(manager.isAborted).toBe(true);
    expect(manager.reason).toBe('timeout');
  });

  it('should clear timer and remove listeners when markFinished is called', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_finished',
      timeoutMs: 5000
    });

    expect(mockRes.listenerCount('close')).toBe(1);

    manager.markFinished();

    expect(mockRes.listenerCount('close')).toBe(0);

    // Advancing time after markFinished should not trigger abort or change state
    jest.advanceTimersByTime(5000);
    expect(manager.isAborted).toBe(false);
    expect(manager.reason).toBeNull();
  });
});
