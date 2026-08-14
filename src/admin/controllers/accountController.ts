import { Request, Response } from 'express';
import accountService from '../services/accountService';

class AccountController {
  public async getStatus(req: Request, res: Response): Promise<void> {
    const result = await accountService.getStatus();
    res.status(result.status).json(result.data);
  }

  public async upload(req: Request, res: Response): Promise<void> {
    const { files, content } = req.body;
    if (Array.isArray(files)) {
      const result = await accountService.uploadBatchFiles(files);
      res.status(result.status).json(result.data);
    } else {
      const result = await accountService.uploadFile(content);
      res.status(result.status).json(result.data);
    }
  }

  public async toggleDisabled(req: Request, res: Response): Promise<void> {
    const { index, disabled } = req.body;
    if (typeof index !== 'number' || typeof disabled !== 'boolean') {
      res.status(400).json({ error: 'Invalid parameters: index and disabled are required' });
      return;
    }
    const result = await accountService.toggleDisabled(index, disabled);
    res.status(result.status).json(result.data);
  }

  public async deleteAccount(req: Request, res: Response): Promise<void> {
    const indexParam = Array.isArray(req.params.index) ? req.params.index[0] : req.params.index;
    const index = parseInt(indexParam, 10);
    const force = req.query.force === 'true';
    if (isNaN(index)) {
      res.status(400).json({ error: 'Invalid account index' });
      return;
    }
    const result = await accountService.deleteAccount(index, force);
    res.status(result.status).json(result.data);
  }

  public async batchDelete(req: Request, res: Response): Promise<void> {
    const { indices, force } = req.body;
    if (!Array.isArray(indices)) {
      res.status(400).json({ error: 'indices must be an array of numbers' });
      return;
    }
    const result = await accountService.batchDeleteAccounts(indices, force !== false);
    res.status(result.status).json(result.data);
  }

  public async deduplicate(req: Request, res: Response): Promise<void> {
    const result = await accountService.deduplicateAccounts();
    res.status(result.status).json(result.data);
  }

  public async switchCurrent(req: Request, res: Response): Promise<void> {
    const { targetIndex } = req.body;
    const result = await accountService.switchCurrentAccount(targetIndex);
    res.status(result.status).json(result.data);
  }

  public async downloadFile(req: Request, res: Response): Promise<void> {
    const filenameParam = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filename = filenameParam || '';
    const result = await accountService.getFileStream(filename);
    if (result.status === 200 && result.body && typeof (result.body as any).pipe === 'function') {
      res.setHeader('Content-Type', result.headers['content-type'] || 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      (result.body as any).pipe(res);
    } else {
      res.status(result.status).json(result.data);
    }
  }

  public async batchDownload(req: Request, res: Response): Promise<void> {
    const { indices } = req.body;
    const result = await accountService.batchDownload(indices || []);
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
