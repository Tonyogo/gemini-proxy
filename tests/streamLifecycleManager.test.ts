import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { StreamLifecycleManager } from '../src/utils/streamLifecycleManager';

describe('StreamLifecycleManager', () => {
  let mockReq: EventEmitter & Partial<Request>;
  let mockRes: EventEmitter & Partial<Response>;

  beforeEach(() => {
    mockReq = new EventEmitter() as any;
    mockRes = new EventEmitter() as any;
  });

  it('should initialize with an un-aborted AbortSignal', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_1'
    });

    expect(manager.signal.aborted).toBe(false);
    expect(manager.isAborted).toBe(false);
  });

  it('should abort AbortSignal when req emits close event', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_2'
    });

    mockReq.emit('close');

    expect(manager.signal.aborted).toBe(true);
    expect(manager.isAborted).toBe(true);
  });

  it('should remove listeners when markFinished is called', () => {
    const manager = new StreamLifecycleManager({
      req: mockReq as Request,
      res: mockRes as Response,
      transactionId: 'test_tx_3'
    });

    expect(mockReq.listenerCount('close')).toBe(1);
    expect(mockRes.listenerCount('close')).toBe(1);

    manager.markFinished();

    expect(mockReq.listenerCount('close')).toBe(0);
    expect(mockRes.listenerCount('close')).toBe(0);
  });
});
