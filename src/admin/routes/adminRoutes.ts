import { Router } from 'express';
import adminController from '../controllers/adminController';
import accountController from '../controllers/accountController';
import taskController from '../controllers/taskController';
import adminAuthMiddleware from '../middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

// Admin Core Routes
router.get('/status', (req, res) => adminController.getStatus(req, res));
router.get('/models', (req, res) => adminController.getModels(req, res));
router.get('/logs', (req, res) => adminController.getLogs(req, res));
router.get('/logs/:date/:hour/:filename', (req, res) => adminController.getLogDetail(req, res));
router.get('/stats', (req, res) => adminController.getStats(req, res));
router.get('/upstream/health', (req, res) => adminController.getUpstreamHealth(req, res));
router.post('/config', (req, res) => adminController.updateConfig(req, res));
router.put('/config', (req, res) => adminController.updateConfig(req, res));

// Tasks Management Routes
router.get('/tasks', (req, res) => taskController.getTasks(req, res));
router.put('/tasks', (req, res) => taskController.saveTasks(req, res));
router.post('/tasks', (req, res) => taskController.addTask(req, res));
router.delete('/tasks/:id', (req, res) => taskController.deleteTask(req, res));

// Account Management Routes
router.get('/accounts/servers', (req, res) => accountController.getServers(req, res));
router.get('/accounts/status', (req, res) => accountController.getStatus(req, res));
router.get('/accounts/usage', (req, res) => accountController.getUsage(req, res));
router.post('/accounts/upload', (req, res) => accountController.upload(req, res));
router.post('/accounts/toggle-disabled', (req, res) => accountController.toggleDisabled(req, res));
router.post('/accounts/:index/close-context', (req, res) => accountController.closeContext(req, res));
router.delete('/accounts/:index', (req, res) => accountController.deleteAccount(req, res));
router.post('/accounts/batch-delete', (req, res) => accountController.batchDelete(req, res));
router.post('/accounts/deduplicate', (req, res) => accountController.deduplicate(req, res));
router.put('/accounts/current', (req, res) => accountController.switchCurrent(req, res));
router.get('/accounts/files/:filename', (req, res) => accountController.downloadFile(req, res));
router.post('/accounts/batch-download', (req, res) => accountController.batchDownload(req, res));

export default router;
