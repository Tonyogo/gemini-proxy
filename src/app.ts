import express, { Request, Response } from 'express';
import path from 'path';
import claudeRoutes from './routes/claudeRoutes';
import adminRoutes from './admin/routes/adminRoutes';
import config from '../config/default';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);
app.use('/api/admin', adminRoutes);

if (config.enableUi) {
  const frontendDist = path.join(__dirname, '../../dist/frontend');
  app.use('/ui', express.static(frontendDist));
  app.get('/ui/*', (req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('UI not built yet. Run npm run build.');
      }
    });
  });
}

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
