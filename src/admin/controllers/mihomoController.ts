import { Request, Response } from 'express';
import mihomoService from '../services/mihomoService';

class MihomoController {
  public async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.getStatus();
      res.status(200).json(result);
    } catch (err: any) {
      res.status(200).json({ ok: false, message: err.message || 'Error checking status' });
    }
  }

  public async getTraffic(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.getTraffic();
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to fetch traffic from Mihomo' });
    }
  }

  public async getProxies(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.getProxies();
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to fetch proxies from Mihomo' });
    }
  }

  public async selectProxy(req: Request, res: Response): Promise<void> {
    const group = Array.isArray(req.params.group) ? req.params.group[0] : req.params.group;
    const { name } = req.body;
    if (!group || !name) {
      res.status(400).json({ error: 'Group and name are required' });
      return;
    }

    try {
      const result = await mihomoService.selectProxy(group, name);
      if (result.status === 204) {
        res.status(204).end();
        return;
      }
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to switch proxy' });
    }
  }

  public async getProxyDelay(req: Request, res: Response): Promise<void> {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    const testUrl = (req.query.url as string) || 'http://www.gstatic.com/generate_204';
    const timeout = parseInt((req.query.timeout as string) || '3000', 10);

    if (!name) {
      res.status(400).json({ error: 'Node name is required' });
      return;
    }

    try {
      const result = await mihomoService.getProxyDelay(name, testUrl, timeout);
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to test proxy delay' });
    }
  }

  public async getConfigs(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.getConfigs();
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to fetch configs from Mihomo' });
    }
  }

  public async updateConfigs(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.updateConfigs(req.body);
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to update configs in Mihomo' });
    }
  }

  public async getConnections(req: Request, res: Response): Promise<void> {
    try {
      const result = await mihomoService.getConnections();
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to fetch connections from Mihomo' });
    }
  }

  public async closeConnections(req: Request, res: Response): Promise<void> {
    const id = req.params.id ? (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) : undefined;
    try {
      const result = await mihomoService.closeConnections(id);
      if (result.status === 204) {
        res.status(204).end();
        return;
      }
      res.status(result.status).json(result.data);
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Failed to close connections in Mihomo' });
    }
  }
}

export const mihomoController = new MihomoController();
export default mihomoController;
