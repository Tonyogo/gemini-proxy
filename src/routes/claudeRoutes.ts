import { Router, Request, Response } from 'express';
import claudeController from '../controllers/claudeController';

const router = Router();

router.post('/messages', (req: Request, res: Response) => claudeController.handleMessages(req, res));
router.post('/messages/count_tokens', (req: Request, res: Response) => claudeController.handleCountTokens(req, res));

router.get('/models', (req: Request, res: Response) => claudeController.handleListModels(req, res));
router.get('/models/:model_id', (req: Request, res: Response) => claudeController.handleRetrieveModel(req, res));

export default router;
