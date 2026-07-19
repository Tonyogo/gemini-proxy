import { Router, Request, Response } from 'express';
import * as path from 'path';
import { localhostOnly } from '../middleware/auth';
import adminController from '../controllers/adminController';

const router = Router();

// Secure all admin routes
router.use(localhostOnly);

// Static Viewer page delivery
router.get('/logs-viewer', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Logs APIs
router.get('/api/logs', (req: Request, res: Response) => adminController.listLogs(req, res));
router.get('/api/logs/:id', (req: Request, res: Response) => adminController.getLogDetail(req, res));

export default router;
