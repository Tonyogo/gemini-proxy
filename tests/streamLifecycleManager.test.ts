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

  it('should immediately flush SSE headers with initial : ping and periodically send heartbeats when enableSseHeartbeat is true', () => {
    const setHeaderSpy = jest.fn();
    const flushHeadersSpy = jest.fn();
    const writeSpy = jest.fn();
    mockRes.setHeader = setHeaderSpy;
    mockRes.flushHeaders = flushHeadersSpy;
    mockRes.write = writeSpy;
    (mockRes as any).headersSent = false;
    (mockRes as any).writableEnded = false;

    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_heartbeat',
      enableSseHeartbeat: true,
      heartbeatIntervalMs: 15000
    });

    // Immediately upon construction: headers set, flushed, and initial : ping sent
    expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(setHeaderSpy).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(setHeaderSpy).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(flushHeadersSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(': ping\n\n');

    // Simulate headersSent becoming true after initial flush/write
    (mockRes as any).headersSent = true;

    // Advance 15s: periodic heartbeat writes : ping
    jest.advanceTimersByTime(15000);
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenLastCalledWith(': ping\n\n');

    // Advance another 15s: third : ping written
    jest.advanceTimersByTime(15000);
    expect(writeSpy).toHaveBeenCalledTimes(3);

    // Once finished, no more heartbeats are emitted
    manager.markFinished();
    jest.advanceTimersByTime(30000);
    expect(writeSpy).toHaveBeenCalledTimes(3);
  });
});
