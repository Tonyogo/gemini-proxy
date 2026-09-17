import { Router, Request, Response } from 'express';
import geminiController from '../controllers/geminiController';

const router = Router();

// Handle all methods under /v1beta
router.all('*', (req: Request, res: Response) => geminiController.handleProxy(req, res));

export default router;
