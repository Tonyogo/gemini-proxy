import { Request, Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import config from '../../../config/default';
import logService from '../services/logService';

class AdminController {
  public async getStatus(req: Request, res: Response): Promise<void> {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      config: {
        logLevel: config.logLevel,
        systemRoleToInstruction: config.systemRoleToInstruction,
        runtimeContextTag: config.runtimeContextTag,
        upstreamTimeoutMs: config.upstreamTimeoutMs,
        enableUi: config.enableUi,
        timeZone: config.timeZone
      }
    });
  }

  public async getModels(req: Request, res: Response): Promise<void> {
    try {
      const modelsPath = path.join(process.cwd(), 'config', 'models.json');
      const data = await fs.readFile(modelsPath, 'utf8');
      const modelsJson = JSON.parse(data);
      res.json({
        models: modelsJson,
        mappings: config.modelMappings
      });
    } catch (err) {
      res.json({
        models: {},
        mappings: config.modelMappings
      });
    }
  }

  public async getLogs(req: Request, res: Response): Promise<void> {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '20', 10);
    const result = await logService.listLogs(page, limit);
    res.json(result);
  }

  public async getLogDetail(req: Request, res: Response): Promise<void> {
    const date = Array.isArray(req.params.date) ? req.params.date[0] : req.params.date;
    const hour = Array.isArray(req.params.hour) ? req.params.hour[0] : req.params.hour;
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;

    try {
      const detail = await logService.getLogDetail(date, hour, filename);
      res.json(detail);
    } catch (err) {
      res.status(404).json({ error: 'Log file not found' });
    }
  }

  public async getStats(req: Request, res: Response): Promise<void> {
    const stats = await logService.getStats();
    res.json(stats);
  }
}

export default new AdminController();
