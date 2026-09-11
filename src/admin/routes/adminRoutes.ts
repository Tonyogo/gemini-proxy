import { Router } from 'express';
import adminController from '../controllers/adminController';
import accountController from '../controllers/accountController';
import terminalFileController from '../controllers/terminalFileController';
import mihomoController from '../controllers/mihomoController';
import adminAuthMiddleware from '../middlewares/adminAuth';

const router = Router();

router.use(adminAuthMiddleware);

router.get('/status', (req, res) => adminController.getStatus(req, res));
router.get('/models', (req, res) => adminController.getModels(req, res));
router.get('/logs', (req, res) => adminController.getLogs(req, res));
router.get('/logs/:date/:hour/:filename', (req, res) => adminController.getLogDetail(req, res));
router.get('/stats', (req, res) => adminController.getStats(req, res));
router.get('/terminal-logs', (req, res) => adminController.getTerminalLogs(req, res));
router.get('/terminal/hosts', (req, res) => adminController.getTerminalHosts(req, res));
router.post('/config', (req, res) => adminController.updateConfig(req, res));

// Terminal File Management Routes
router.get('/terminal/files/list', (req, res) => terminalFileController.listFiles(req, res));
router.get('/terminal/files/content', (req, res) => terminalFileController.readFileContent(req, res));
router.post('/terminal/files/save', (req, res) => terminalFileController.saveFileContent(req, res));
router.post('/terminal/files/mkdir', (req, res) => terminalFileController.createDirectory(req, res));
router.post('/terminal/files/rename', (req, res) => terminalFileController.renameFile(req, res));
router.delete('/terminal/files/delete', (req, res) => terminalFileController.deleteItem(req, res));
router.get('/terminal/files/download', (req, res) => terminalFileController.downloadFile(req, res));
router.post('/terminal/files/upload', (req, res) => terminalFileController.uploadFile(req, res));

// Account Management Routes
router.get('/accounts/status', (req, res) => accountController.getStatus(req, res));
router.post('/accounts/upload', (req, res) => accountController.upload(req, res));
router.post('/accounts/toggle-disabled', (req, res) => accountController.toggleDisabled(req, res));
router.post('/accounts/:index/close-context', (req, res) => accountController.closeContext(req, res));
router.delete('/accounts/:index', (req, res) => accountController.deleteAccount(req, res));
router.post('/accounts/batch-delete', (req, res) => accountController.batchDelete(req, res));
router.post('/accounts/deduplicate', (req, res) => accountController.deduplicate(req, res));
router.put('/accounts/current', (req, res) => accountController.switchCurrent(req, res));
router.get('/accounts/files/:filename', (req, res) => accountController.downloadFile(req, res));
router.post('/accounts/batch-download', (req, res) => accountController.batchDownload(req, res));

// Mihomo Management Routes
router.get('/mihomo/status', (req, res) => mihomoController.getStatus(req, res));
router.get('/mihomo/traffic', (req, res) => mihomoController.getTraffic(req, res));
router.get('/mihomo/proxies', (req, res) => mihomoController.getProxies(req, res));
router.put('/mihomo/proxies/:group', (req, res) => mihomoController.selectProxy(req, res));
router.get('/mihomo/proxies/:name/delay', (req, res) => mihomoController.getProxyDelay(req, res));
router.get('/mihomo/configs', (req, res) => mihomoController.getConfigs(req, res));
router.patch('/mihomo/configs', (req, res) => mihomoController.updateConfigs(req, res));
router.get('/mihomo/connections', (req, res) => mihomoController.getConnections(req, res));
router.delete('/mihomo/connections', (req, res) => mihomoController.closeConnections(req, res));
router.delete('/mihomo/connections/:id', (req, res) => mihomoController.closeConnections(req, res));

export default router;
