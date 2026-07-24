import { Router } from 'express';
import adminController from '../controllers/adminController';
import adminAuthMiddleware from '../middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

router.get('/status', (req, res) => adminController.getStatus(req, res));
router.get('/models', (req, res) => adminController.getModels(req, res));
router.get('/logs', (req, res) => adminController.getLogs(req, res));
router.get('/logs/:date/:hour/:filename', (req, res) => adminController.getLogDetail(req, res));
router.get('/stats', (req, res) => adminController.getStats(req, res));
router.post('/config', (req, res) => adminController.updateConfig(req, res));

export default router;
