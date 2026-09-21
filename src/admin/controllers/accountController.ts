import { Request, Response } from 'express';
import accountService from '../services/accountService';
import accountUsageService from '../services/accountUsageService';
import upstreamManager from '../../utils/upstreamManager';

class AccountController {
  private getServerIndex(req: Request): number | undefined {
    const raw = req.query.serverId ?? req.query.serverIndex;
    if (typeof raw === 'string') {
      const idx = parseInt(raw, 10);
      if (!isNaN(idx) && idx >= 0) {
        return idx;
      }
    }
    return undefined;
  }

  public async getServers(req: Request, res: Response): Promise<void> {
    res.json({
      servers: upstreamManager.getBaseUrls(),
      circuits: upstreamManager.getCircuitStatusList()
    });
  }

  public async getStatus(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const result = serverIndex !== undefined
      ? await accountService.getStatus(serverIndex)
      : await accountService.getStatus();

    if (result.status === 200 && result.data?.status?.accountDetails && Array.isArray(result.data.status.accountDetails)) {
      for (const acc of result.data.status.accountDetails) {
        const localStats = acc.name ? accountUsageService.getUsageForAccount(acc.name) : null;
        const byModelCompat: Record<string, any> = {};

        if (localStats?.byModel) {
          for (const [model, stats] of Object.entries(localStats.byModel)) {
            const cleanModel = model.replace(/^models\//, '');
            byModelCompat[cleanModel] = {
              usage: stats.success,
              requests: stats.total,
              success: stats.success,
              error: stats.error
            };
          }
        }

        acc.usage = {
          total: localStats?.totalSuccess || 0,
          totalRequests: localStats?.totalRequests || 0,
          totalSuccess: localStats?.totalSuccess || 0,
          totalError: localStats?.totalError || 0,
          byModel: byModelCompat
        };
      }
    }

    res.status(result.status).json(result.data);
  }

  public async getUsage(req: Request, res: Response): Promise<void> {
    res.json(accountUsageService.getAllUsage());
  }

  public async upload(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const { files, content } = req.body;
    if (Array.isArray(files)) {
      const result = serverIndex !== undefined
        ? await accountService.uploadBatchFiles(files, serverIndex)
        : await accountService.uploadBatchFiles(files);
      res.status(result.status).json(result.data);
    } else {
      const result = serverIndex !== undefined
        ? await accountService.uploadFile(content, serverIndex)
        : await accountService.uploadFile(content);
      res.status(result.status).json(result.data);
    }
  }

  public async toggleDisabled(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const { index, disabled } = req.body;
    if (typeof index !== 'number' || typeof disabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid parameters: index and disabled are required' });
      return;
    }
    const result = serverIndex !== undefined
      ? await accountService.toggleDisabled(index, disabled, serverIndex)
      : await accountService.toggleDisabled(index, disabled);
    res.status(result.status).json(result.data);
  }

  public async deleteAccount(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const indexParam = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
    const index = parseInt(indexParam, 10);
    const force = req.query.force === 'true';
    if (isNaN(index)) {
      res.status(400).json({ error: 'Invalid account index' });
      return;
    }
    const result = serverIndex !== undefined
      ? await accountService.deleteAccount(index, force, serverIndex)
      : await accountService.deleteAccount(index, force);
    res.status(result.status).json(result.data);
  }

  public async batchDelete(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const { indices, force } = req.body;
    if (!Array.isArray(indices)) {
      res.status(400).json({ error: 'indices must be an array of numbers' });
      return;
    }
    const result = serverIndex !== undefined
      ? await accountService.batchDeleteAccounts(indices, force !== false, serverIndex)
      : await accountService.batchDeleteAccounts(indices, force !== false);
    res.status(result.status).json(result.data);
  }

  public async deduplicate(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const result = serverIndex !== undefined
      ? await accountService.deduplicateAccounts(serverIndex)
      : await accountService.deduplicateAccounts();
    res.status(result.status).json(result.data);
  }

  public async switchCurrent(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const { targetIndex } = req.body;
    const result = serverIndex !== undefined
      ? await accountService.switchCurrentAccount(targetIndex, serverIndex)
      : await accountService.switchCurrentAccount(targetIndex);
    res.status(result.status).json(result.data);
  }

  public async closeContext(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const indexParam = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
    const index = parseInt(indexParam, 10);
    if (isNaN(index) || index < 0) {
      res.status(400).json({ error: 'Invalid account index' });
      return;
    }
    const result = serverIndex !== undefined
      ? await accountService.closeContext(index, serverIndex)
      : await accountService.closeContext(index);
    res.status(result.status).json(result.data);
  }

  public async downloadFile(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const filenameParam = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filename = filenameParam || '';
    const result = serverIndex !== undefined
      ? await accountService.getFileStream(filename, serverIndex)
      : await accountService.getFileStream(filename);
    if (result.status === 200 && result.body && typeof (result.body as any).pipe === 'function') {
      res.setHeader('Content-Type', result.headers['content-type'] || 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      (result.body as any).pipe(res);
    } else {
      res.status(result.status).json(result.data);
    }
  }

  public async batchDownload(req: Request, res: Response): Promise<void> {
    const serverIndex = this.getServerIndex(req);
    const { indices } = req.body;
    const result = serverIndex !== undefined
      ? await accountService.batchDownload(indices || [], serverIndex)
      : await accountService.batchDownload(indices || []);
    if (result.status === 200 && result.body && typeof (result.body as any).pipe === 'function') {
      res.setHeader('Content-Type', result.headers['content-type'] || 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="accounts.zip"');
      if (result.headers['x-file-count']) {
        res.setHeader('X-File-Count', result.headers['x-file-count']);
      }
      (result.body as any).pipe(res);
    } else {
      res.status(result.status).json(result.data);
    }
  }
}

export default new AccountController();
