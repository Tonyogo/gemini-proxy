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

  it('should use 60000ms as default heartbeat interval and only send : ping before first data packet arrives', () => {
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
      enableSseHeartbeat: true
    });

    // Upon construction: headers are NOT sent yet, ensuring res.headersSent remains false for fast-failing upstreams
    expect(setHeaderSpy).not.toHaveBeenCalled();
    expect(flushHeadersSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();

    // Advance 15s: 60s default timer has NOT fired yet
    jest.advanceTimersByTime(15000);
    expect(writeSpy).not.toHaveBeenCalled();

    // Advance another 45s (total 60s): heartbeat timer fires while still waiting for first packet
    jest.advanceTimersByTime(45000);
    expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(setHeaderSpy).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(setHeaderSpy).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(flushHeadersSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(': ping\n\n');

    // Simulate headersSent becoming true after initial flush/write
    (mockRes as any).headersSent = true;

    // Advance another 60s with still no data: second pre-first-packet heartbeat writes : ping
    jest.advanceTimersByTime(60000);
    expect(writeSpy).toHaveBeenCalledTimes(2);
    expect(writeSpy).toHaveBeenLastCalledWith(': ping\n\n');

    manager.markFinished();
  });

  it('should not emit : ping on attachStream and should permanently stop heartbeats once first data packet arrives', () => {
    const writeSpy = jest.fn();
    const setHeaderSpy = jest.fn();
    const flushHeadersSpy = jest.fn();
    mockRes.setHeader = setHeaderSpy;
    mockRes.flushHeaders = flushHeadersSpy;
    mockRes.write = writeSpy;
    (mockRes as any).headersSent = false;
    (mockRes as any).writableEnded = false;

    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_stop_heartbeat_on_data',
      timeoutMs: 180000,
      enableSseHeartbeat: true,
      heartbeatIntervalMs: 60000
    });

    const mockUpstreamStream = new EventEmitter();
    // Upstream responds with 200 headers at t=10s, before 60s heartbeat
    jest.advanceTimersByTime(10000);
    manager.attachStream(mockUpstreamStream);

    // attachStream ensures SSE headers but does NOT write : ping
    expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(flushHeadersSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).not.toHaveBeenCalled();

    // First data chunk arrives at t=20s
    jest.advanceTimersByTime(10000);
    mockUpstreamStream.emit('data', Buffer.from('data: {"text":"first packet"}\n\n'));
    expect(writeSpy).not.toHaveBeenCalled();

    // Advance 60s, 120s — since data already arrived, heartbeat timer is stopped and never writes : ping
    jest.advanceTimersByTime(60000);
    mockUpstreamStream.emit('data', Buffer.from('data: {"text":"second packet"}\n\n'));
    jest.advanceTimersByTime(60000);
    expect(writeSpy).not.toHaveBeenCalled();

    manager.markFinished();
  });

  it('should still emit : ping at 60s if attachStream was called but upstream has not emitted any data packet yet', () => {
    const writeSpy = jest.fn();
    mockRes.setHeader = jest.fn();
    mockRes.flushHeaders = jest.fn();
    mockRes.write = writeSpy;
    (mockRes as any).headersSent = false;
    (mockRes as any).writableEnded = false;

    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_attached_but_no_data',
      timeoutMs: 180000,
      enableSseHeartbeat: true
    });

    const mockUpstreamStream = new EventEmitter();
    // Upstream headers arrive at t=5s, but stream is silent (thinking)
    jest.advanceTimersByTime(5000);
    manager.attachStream(mockUpstreamStream);
    expect(writeSpy).not.toHaveBeenCalled();

    // At t=60s, still no data packet -> heartbeat fires once
    jest.advanceTimersByTime(55000);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenLastCalledWith(': ping\n\n');

    // At t=70s, first data packet arrives -> stops any future heartbeats
    jest.advanceTimersByTime(10000);
    mockUpstreamStream.emit('data', Buffer.from('data: {"text":"finally"}\n\n'));

    // Advance another 120s -> no more : ping
    jest.advanceTimersByTime(60000);
    mockUpstreamStream.emit('data', Buffer.from('data: {"text":"more"}\n\n'));
    jest.advanceTimersByTime(60000);
    expect(writeSpy).toHaveBeenCalledTimes(1);

    manager.markFinished();
  });

  it('should reset the timeout timer whenever attached stream emits data and only timeout after full idle period', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_idle_reset',
      timeoutMs: 5000
    });

    const mockUpstreamStream = new EventEmitter();

    // Advance 3s before response headers arrive
    jest.advanceTimersByTime(3000);
    expect(manager.isAborted).toBe(false);

    // Attach stream at t=3s -> resets 5s timer
    manager.attachStream(mockUpstreamStream);

    // Emit data chunks every 3s (t=6s, t=9s, t=12s) — total elapsed 12s > 5s initial timeoutMs
    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 1'));
    expect(manager.isAborted).toBe(false);

    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 2'));
    expect(manager.isAborted).toBe(false);

    jest.advanceTimersByTime(3000);
    mockUpstreamStream.emit('data', Buffer.from('chunk 3'));
    expect(manager.isAborted).toBe(false);

    // Now go idle for 4.9s -> still not aborted
    jest.advanceTimersByTime(4900);
    expect(manager.isAborted).toBe(false);

    // Advance remaining 0.1s (total 5s idle since last data) -> aborts with timeout
    jest.advanceTimersByTime(100);
    expect(manager.isAborted).toBe(true);
    expect(manager.signal.aborted).toBe(true);
    expect(manager.reason).toBe('timeout');
  });
});
