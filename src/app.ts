import express, { Request, Response } from 'express';
import path from 'path';
import claudeRoutes from './proxy/routes/claudeRoutes';
import geminiRoutes from './proxy/routes/geminiRoutes';
import adminRoutes from './admin/routes/adminRoutes';
import terminalRoutes from './terminal/routes/terminalRoutes';
import config from '../config/default';

const app = express();

app.use(express.json({ limit: '50mb' }));

// Public direct download endpoints for gt CLI and installer
app.get('/install.sh', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../scripts/install-gt.sh'));
});
app.get('/gt', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../scripts/gt.js'));
});

app.use('/v1beta', geminiRoutes);
app.use('/v1', claudeRoutes);
app.use('/api/terminal', terminalRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

if (config.enableUi) {
  const frontendDist = path.join(__dirname, '../../dist/frontend');
  app.use(express.static(frontendDist));
  app.get('*', (req: Request, res: Response, next) => {
    if (
      req.path.startsWith('/v1beta') ||
      req.path.startsWith('/v1') ||
      req.path.startsWith('/api') ||
      req.path === '/health' ||
      req.path === '/install.sh' ||
      req.path === '/gt'
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('UI not built yet. Run npm run build.');
      }
    });
  });
}

export default app;
