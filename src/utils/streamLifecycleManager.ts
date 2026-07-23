import { Request, Response } from 'express';
import { Readable } from 'stream';
import logger from './logger';

export interface StreamLifecycleOptions {
  req: Request;
  res: Response;
  transactionId: string;
  timeoutMs?: number;
}

export type AbortReason = 'client_disconnect' | 'timeout' | null;

export class StreamLifecycleManager {
  private controller: AbortController;
  private req: Request;
  private res: Response;
  private transactionId: string;
  private finished: boolean = false;
  private aborted: boolean = false;
  private abortReason: AbortReason = null;
  private timer: NodeJS.Timeout | null = null;
  private upstreamStream: Readable | null = null;

  private handleClose = () => {
    if (this.finished) return;
    this.aborted = true;
    this.abortReason = 'client_disconnect';
    this.clearTimer();
    logger.info(`[Client Disconnect] [Transaction: ${this.transactionId}] Client socket closed before stream completed. Aborting upstream request.`);
    this.controller.abort();
    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === 'function') {
      (this.upstreamStream as any).destroy();
    }
  };

  private handleTimeout = (timeoutMs: number) => {
    if (this.finished) return;
    this.aborted = true;
    this.abortReason = 'timeout';
    logger.warn(`[Timeout] [Transaction: ${this.transactionId}] Request timed out after ${timeoutMs}ms. Aborting upstream request.`);
    this.controller.abort();
    if (this.upstreamStream && typeof (this.upstreamStream as any).destroy === 'function') {
      (this.upstreamStream as any).destroy();
    }
  };

  constructor(options: StreamLifecycleOptions) {
    this.controller = new AbortController();
    this.req = options.req;
    this.res = options.res;
    this.transactionId = options.transactionId;

    this.res.on('close', this.handleClose);

    if (options.timeoutMs && options.timeoutMs > 0) {
      this.timer = setTimeout(() => {
        this.handleTimeout(options.timeoutMs!);
      }, options.timeoutMs);
    }
  }

  public get reason(): AbortReason {
    return this.abortReason;
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get isAborted(): boolean {
    return this.aborted;
  }

  public attachStream(stream: any): void {
    this.upstreamStream = stream;
  }

  public markFinished(): void {
    this.finished = true;
    this.cleanup();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  public cleanup(): void {
    this.clearTimer();
    this.res.off('close', this.handleClose);
  }
}
