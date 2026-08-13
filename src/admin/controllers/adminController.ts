import { Request, Response } from 'express';
import * as path from 'path';
import { promises as fs } from 'fs';
import config, { updateConfig } from '../../../config/default';
import logService from '../services/logService';
import terminalLogService from '../services/terminalLogService';

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
        customSystemInstruction: config.customSystemInstruction,
        modelMappings: config.modelMappings,
        enableUi: config.enableUi,
        timeZone: config.timeZone,
        logRetentionDays: config.logRetentionDays,
        countTokensModel: config.countTokensModel,
        ephemeralUserMessages: config.ephemeralUserMessages,
        ephemeralSystemMessages: config.ephemeralSystemMessages
      }
    });
  }

  public async getModels(req: Request, res: Response): Promise<void> {
    res.json({
      mappings: config.modelMappings
    });
  }

  public async getLogs(req: Request, res: Response): Promise<void> {
    const page = parseInt((req.query.page as string) || '1', 10);
    const limit = parseInt((req.query.limit as string) || '50', 10);
    const filterDate = req.query.date as string | undefined;
    const filterHour = req.query.hour as string | undefined;

    const result = await logService.listLogs(page, limit, filterDate, filterHour);
    res.json(result);
  }

  public async getLogDetail(req: Request, res: Response): Promise<void> {
    const date = Array.isArray(req.params.date) ? req.params.date[0] : req.params.date;
    const hour = Array.isArray(req.params.hour) ? req.params.hour[0] : req.params.hour;
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;

    try {
      const detail = await logService.getLogDetail(date, hour, filename);
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
      res.json(detail);
    } catch (err) {
      res.status(404).json({ error: 'Log file not found' });
    }
  }

  public async getStats(req: Request, res: Response): Promise<void> {
    const rangeParam = req.query.range as string | undefined;
    let range = 24;
    if (rangeParam) {
      const parsedRange = parseInt(rangeParam, 10);
      if ([6, 12, 24, 48].includes(parsedRange)) {
        range = parsedRange;
      }
    }
    const stats = await logService.getStats(range);
    res.json(stats);
  }

  public async updateConfig(req: Request, res: Response): Promise<void> {
    try {
      const newConfig = req.body;
      await updateConfig(newConfig, { resetToEnv: Boolean(req.body.resetToEnv) });
      res.json({
        status: 'ok',
        message: 'Configuration updated successfully',
        config: {
          logLevel: config.logLevel,
          systemRoleToInstruction: config.systemRoleToInstruction,
          runtimeContextTag: config.runtimeContextTag,
          upstreamTimeoutMs: config.upstreamTimeoutMs,
          customSystemInstruction: config.customSystemInstruction,
          modelMappings: config.modelMappings,
          timeZone: config.timeZone,
          logRetentionDays: config.logRetentionDays,
          countTokensModel: config.countTokensModel,
        ephemeralUserMessages: config.ephemeralUserMessages,
        ephemeralSystemMessages: config.ephemeralSystemMessages
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to update configuration: ${err.message}` });
    }
  }

  public async getTerminalLogs(req: Request, res: Response): Promise<void> {
    const isStream = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const logs = terminalLogService.getHistory();
      res.write('data: ' + JSON.stringify({ type: 'history', logs }) + '\n\n');

      const onLog = (log: any) => {
        res.write('data: ' + JSON.stringify({ type: 'log', log }) + '\n\n');
      };

      terminalLogService.on('log', onLog);

      req.on('close', () => {
        terminalLogService.off('log', onLog);
      });
    } else {
      res.json({ logs: terminalLogService.getHistory() });
    }
  }
}

export default new AdminController();
