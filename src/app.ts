import express, { Request, Response } from 'express';
import claudeRoutes from './routes/claudeRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();

app.use(express.json({ limit: '50mb' }));

app.use('/v1', claudeRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default app;
