import { Request, Response } from 'express';
import systemLogService from '../services/systemLogService';

class SystemLogController {
  public async getLogs(req: Request, res: Response): Promise<void> {
    const isStream = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const logs = systemLogService.getHistory();
      res.write('data: ' + JSON.stringify({ type: 'history', logs }) + '\n\n');

      const onLog = (log: any) => {
        res.write('data: ' + JSON.stringify({ type: 'log', log }) + '\n\n');
      };

      systemLogService.on('log', onLog);

      req.on('close', () => {
        systemLogService.off('log', onLog);
      });
    } else {
      res.json({ logs: systemLogService.getHistory() });
    }
  }
}

export const systemLogController = new SystemLogController();
export default systemLogController;
