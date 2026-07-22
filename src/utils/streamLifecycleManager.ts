import { Request, Response } from 'express';
import { Readable } from 'stream';
import logger from './logger';

export interface StreamLifecycleOptions {
  req: Request;
  res: Response;
  transactionId: string;
}

export class StreamLifecycleManager {
  private controller: AbortController;
  private req: Request;
  private res: Response;
  private transactionId: string;
  private finished: boolean = false;
  private aborted: boolean = false;
  private upstreamStream: Readable | null = null;

  private handleClose = () => {
    if (this.finished) return;
    this.aborted = true;
    logger.info(`[Client Disconnect] [Transaction: ${this.transactionId}] Client socket closed before stream completed. Aborting upstream request.`);
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

    this.req.on('close', this.handleClose);
    this.res.on('close', this.handleClose);
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

  public cleanup(): void {
    this.req.off('close', this.handleClose);
    this.res.off('close', this.handleClose);
  }
}
