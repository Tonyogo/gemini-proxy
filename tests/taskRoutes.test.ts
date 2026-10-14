import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config from '../config/default';
import taskService from '../src/admin/services/taskService';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Admin Tasks API Endpoints', () => {
  const tasksFile = path.resolve(process.cwd(), 'config/tasks.json');

  beforeEach(async () => {
    config.adminSecretKey = 'test-secret-key';
    if (fs.existsSync(tasksFile)) {
      fs.unlinkSync(tasksFile);
    }
  });

  afterAll(() => {
    config.adminSecretKey = '';
    if (fs.existsSync(tasksFile)) {
      fs.unlinkSync(tasksFile);
    }
  });

  test('Unauthorized request without x-admin-key returns 401', async () => {
    const res = await request(app).get('/api/admin/tasks');
    expect(res.status).toBe(401);
  });

  test('GET /api/admin/tasks returns empty task list with valid key', async () => {
    const res = await request(app)
      .get('/api/admin/tasks')
      .set('x-admin-key', 'test-secret-key');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tasks)).toBe(true);
  });

  test('POST /api/admin/tasks creates a new task', async () => {
    const res = await request(app)
      .post('/api/admin/tasks')
      .set('x-admin-key', 'test-secret-key')
      .send({
        title: '构建看板视图',
        priority: 'p0',
        status: 'todo',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.task.title).toBe('构建看板视图');
    expect(res.body.task.priority).toBe('p0');
  });

  test('POST /api/admin/tasks with empty title returns 400', async () => {
    const res = await request(app)
      .post('/api/admin/tasks')
      .set('x-admin-key', 'test-secret-key')
      .send({ title: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('PUT /api/admin/tasks replaces all tasks atomically', async () => {
    const mockTasks = [
      {
        id: 'task_sync_1',
        title: '批量同步任务 A',
        status: 'in_progress',
        priority: 'p1',
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    const res = await request(app)
      .put('/api/admin/tasks')
      .set('x-admin-key', 'test-secret-key')
      .send({ tasks: mockTasks });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);

    const getRes = await request(app)
      .get('/api/admin/tasks')
      .set('x-admin-key', 'test-secret-key');
    expect(getRes.body.tasks).toHaveLength(1);
    expect(getRes.body.tasks[0].id).toBe('task_sync_1');
  });

  test('DELETE /api/admin/tasks/:id deletes task', async () => {
    const created = await taskService.addTask({ title: '待删除任务' });

    const delRes = await request(app)
      .delete(`/api/admin/tasks/${created.id}`)
      .set('x-admin-key', 'test-secret-key');
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const tasks = await taskService.getTasks();
    expect(tasks.find(t => t.id === created.id)).toBeUndefined();
  });
});
