import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import { terminalExecService } from '../src/admin/services/terminalExecService';
import config from '../config/default';

jest.mock('../src/admin/services/terminalExecService');

describe('TerminalExecController API', () => {
  let app: express.Express;
  const adminKey = 'test-admin-key';
  let originalKey: string;

  beforeAll(() => {
    originalKey = config.adminSecretKey;
    config.adminSecretKey = adminKey;
    app = express();
    app.use(express.json());
    app.use('/api/admin', adminRoutes);
  });

  afterAll(() => {
    config.adminSecretKey = originalKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unauthenticated request without admin key', async () => {
    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .send({ command: 'echo 1' });
    expect(res.status).toBe(401);
  });

  it('starts command execution with 202 Accepted', async () => {
    (terminalExecService.startExecution as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'running',
      command: 'echo 1',
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .set('x-admin-key', adminKey)
      .send({ command: 'echo 1' });

    expect(res.status).toBe(202);
    expect(res.body.taskId).toBe('task-123');
    expect(res.body.status).toBe('running');
  });

  it('returns 400 when command is missing', async () => {
    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .set('x-admin-key', adminKey)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('command');
  });

  it('returns 503 when target host is offline', async () => {
    (terminalExecService.startExecution as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Agent "node-1" is offline or unavailable',
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1')
      .set('x-admin-key', adminKey)
      .send({ command: 'echo 1' });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('offline');
  });

  it('polls task status with 200 OK', async () => {
    (terminalExecService.getExecutionStatus as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'completed',
      exitCode: 0,
      stdout: 'done\n',
    });

    const res = await request(app)
      .get('/api/admin/terminal/exec/node-1/task-123?offset=0')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.exitCode).toBe(0);
  });

  it('returns 404 when polling non-existent task', async () => {
    (terminalExecService.getExecutionStatus as jest.Mock).mockResolvedValue({
      success: false,
      error: 'No such task: task-999',
    });

    const res = await request(app)
      .get('/api/admin/terminal/exec/node-1/task-999')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('No such task');
  });

  it('kills task with 200 OK', async () => {
    (terminalExecService.killExecution as jest.Mock).mockResolvedValue({
      success: true,
      taskId: 'task-123',
      status: 'killed',
    });

    const res = await request(app)
      .post('/api/admin/terminal/exec/node-1/task-123/kill')
      .set('x-admin-key', adminKey)
      .send({ signal: 'SIGKILL' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('killed');
  });

  it('lists tasks with 200 OK', async () => {
    (terminalExecService.listExecutions as jest.Mock).mockResolvedValue({
      success: true,
      tasks: [{ taskId: 'task-123', command: 'ls', status: 'completed' }],
    });

    const res = await request(app)
      .get('/api/admin/terminal/exec/node-1?limit=10')
      .set('x-admin-key', adminKey);

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });
});
