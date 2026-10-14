import fs from 'fs';
import path from 'path';
import taskService, { TaskService } from '../src/admin/services/taskService';
import { TaskItem } from '../src/types/tasks';

describe('TaskService Storage & Resilience', () => {
  const testConfigDir = path.resolve(__dirname, '../config');
  const testTasksFile = path.resolve(testConfigDir, 'tasks.test.json');

  let service: TaskService;

  beforeEach(() => {
    if (fs.existsSync(testTasksFile)) {
      fs.unlinkSync(testTasksFile);
    }
    service = new TaskService(testTasksFile);
  });

  afterEach(() => {
    if (fs.existsSync(testTasksFile)) {
      fs.unlinkSync(testTasksFile);
    }
  });

  test('getTasks returns empty array when file does not exist', async () => {
    const tasks = await service.getTasks();
    expect(tasks).toEqual([]);
  });

  test('saveTasks persists tasks atomically and getTasks retrieves them', async () => {
    const mockTasks: TaskItem[] = [
      {
        id: 'task_1',
        title: '测试任务 1',
        status: 'todo',
        priority: 'p1',
        order: 0,
        createdAt: 1728900000000,
        updatedAt: 1728900000000,
      },
    ];

    await service.saveTasks(mockTasks);
    expect(fs.existsSync(testTasksFile)).toBe(true);

    const loaded = await service.getTasks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe('测试任务 1');
  });

  test('corrupted JSON file triggers self-healing, backups corrupt file, and returns []', async () => {
    fs.writeFileSync(testTasksFile, '{ broken_json: ...', 'utf-8');

    const loaded = await service.getTasks();
    expect(loaded).toEqual([]);

    // Check corrupt backup created
    const files = fs.readdirSync(testConfigDir);
    const corruptFile = files.find(f => f.startsWith('tasks.test.corrupt.'));
    expect(corruptFile).toBeDefined();

    if (corruptFile) {
      fs.unlinkSync(path.join(testConfigDir, corruptFile));
    }
  });

  test('addTask and deleteTask work correctly', async () => {
    const added = await service.addTask({
      title: '新增单项事项',
      priority: 'p0',
      status: 'todo',
    });
    expect(added.id).toBeDefined();
    expect(added.title).toBe('新增单项事项');
    expect(added.priority).toBe('p0');

    const tasksAfterAdd = await service.getTasks();
    expect(tasksAfterAdd).toHaveLength(1);

    const deleted = await service.deleteTask(added.id);
    expect(deleted).toBe(true);

    const tasksAfterDelete = await service.getTasks();
    expect(tasksAfterDelete).toHaveLength(0);
  });
});
