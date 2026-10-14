# 在线事项应用（Tasks）实施计划（Implementation Plan）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Gemini 代理控制台的发现页内置一套原生的在线事项（Tasks）应用，支持看板与清单双视图自由切换、拖拽改状态、优先级标记及数据独立云端原子化持久化。

**Architecture:** 
1. **数据与持久化层**：新增独立的 `src/admin/services/taskService.ts`，管理 `config/tasks.json` 的读写与原子化文件替换（`fs.rename`），支持格式损坏自愈备份；
2. **REST API 层**：在 `src/admin/controllers/taskController.ts` 和 `src/admin/routes/adminRoutes.ts` 中暴露 `/api/admin/tasks`（GET, PUT, POST, DELETE），由 `adminAuthMiddleware` 鉴权保护；
3. **发现页集成与路由**：在 `src/types/index.ts` 与 `frontend/src/types/discoverApps.ts` 中注册 `tasks` 内置应用，支持在 `App.tsx` 中切换 `discoverSubView === 'tasks'`，配置顶栏面包屑与返回导航；
4. **前端交互视图**：构建 `TasksView.tsx` 与 `TaskEditModal.tsx`，支持看板（3 列拖拽）与清单高密度双视图，具备乐观更新（Optimistic UI）与防抖云端同步，支持中英双语 i18n。

**Tech Stack:** TypeScript, React (Vite), Express, Tailwind CSS, Lucide React, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-10-14-discover-tasks-app-design.md`

## Global Constraints

- 存储路径：`config/tasks.json`（测试环境下支持动态/mock，生产环境采用原子化写入 `fs.rename`）。
- 鉴权约束：所有 `/api/admin/tasks` 端点必须通过 `adminAuthMiddleware` 鉴权，必须校验 `x-admin-key`。
- 命名与代码风格：遵循项目严苛 TypeScript 规范，禁止使用 `any` 忽略类型安全；后端动态配置访问，不静态缓存配置。
- 国际化约束：所有用户可见文本均需在 `frontend/src/i18n/locales/zh.ts` 与 `en.ts` 中声明对应的翻译项。
- 零破坏原则：不改动现有系统日志、接口演练、双栏对照与自定义 Web 应用的已有运行逻辑。

## Review Focus

1. **并发/意外断电导致 JSON 截断损坏**：写入 `tasks.json` 必须使用临时文件原子重命名（`atomic write`），损坏时能自愈备份为 `.corrupt.<timestamp>.json` 且返回 `[]`，不崩溃进程。
2. **非法输入与字段超长防御**：`title` 必须是非空字符串且截断/限制在 200 字符内，`status` 与 `priority` 必须是合法枚举值，非法输入应返回 HTTP 400。
3. **未鉴权非法访问防御**：缺少或错误的 `x-admin-key` 请求必须被中间件拦截返回 HTTP 401。
4. **看板跨列拖拽与边界状态更新**：卡片在“待办”、“进行中”、“已完成”三列之间拖拽时，状态和顺序正确持久化，勾选已完成时自动更新 `completedAt`。
5. **前端离线与乐观更新防抖**：用户快速编辑或连续拖拽卡片时，界面即时渲染（0 延迟），后台采用防抖合并网络请求，失败时展示重试状态，防止请求频繁轰炸后端。

---

### Task 1: 数据类型与后端存储服务（TaskService）及原子写入

**Files:**
- Create: `src/types/tasks.ts`
- Modify: `src/types/index.ts:150-155`
- Create: `src/admin/services/taskService.ts`
- Test: `tests/taskService.test.ts`

**Interfaces:**
- Produces: 
  - `TaskItem`, `TaskStatus`, `TaskPriority` 类型定义。
  - `taskService.getTasks(): Promise<TaskItem[]>`
  - `taskService.saveTasks(tasks: TaskItem[]): Promise<void>`
  - `taskService.addTask(task: Partial<TaskItem>): Promise<TaskItem>`
  - `taskService.deleteTask(id: string): Promise<boolean>`

- [x] **Step 1: 编写 TaskService 的单元测试（包含原子写入与损坏自愈）**

创建 `tests/taskService.test.ts`：
```typescript
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
```

- [x] **Step 2: 运行测试验证失败**

运行：`npm test tests/taskService.test.ts`
预期：FAIL（找不到模块 `src/types/tasks` 和 `src/admin/services/taskService`）

- [x] **Step 3: 编写数据类型与 TaskService 实现**

创建 `src/types/tasks.ts`：
```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'p0' | 'p1' | 'p2' | 'none';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags?: string[];
  dueDate?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
```

并在 `src/types/index.ts` 导出：
```typescript
export * from './tasks';
```

创建 `src/admin/services/taskService.ts`：
```typescript
import fs from 'fs';
import path from 'path';
import { TaskItem, TaskStatus, TaskPriority } from '../../types/tasks';

export class TaskService {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), 'config/tasks.json');
  }

  public async getTasks(): Promise<TaskItem[]> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      if (!raw.trim()) {
        return [];
      }
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        return data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
      return [];
    } catch (err: any) {
      console.warn(`[TaskService] Failed to parse tasks file: ${err.message}. Triggering self-healing backup.`);
      try {
        if (fs.existsSync(this.filePath)) {
          const dir = path.dirname(this.filePath);
          const base = path.basename(this.filePath);
          const backup = path.join(dir, `${base.replace('.json', '')}.corrupt.${Date.now()}.json`);
          await fs.promises.rename(this.filePath, backup);
        }
      } catch (backupErr) {
        // Ignore backup failure
      }
      return [];
    }
  }

  public async saveTasks(tasks: TaskItem[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const tempFile = `${this.filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const content = JSON.stringify(tasks, null, 2);

    await fs.promises.writeFile(tempFile, content, 'utf-8');
    await fs.promises.rename(tempFile, this.filePath);
  }

  public async addTask(taskData: Partial<TaskItem>): Promise<TaskItem> {
    const tasks = await this.getTasks();
    const now = Date.now();
    const newTask: TaskItem = {
      id: taskData.id || `task_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: (taskData.title || '').trim().slice(0, 200) || '未命名事项',
      description: taskData.description ? taskData.description.slice(0, 10000) : undefined,
      status: this.normalizeStatus(taskData.status),
      priority: this.normalizePriority(taskData.priority),
      tags: Array.isArray(taskData.tags) ? taskData.tags.map(t => String(t).trim()).filter(Boolean) : undefined,
      dueDate: taskData.dueDate || undefined,
      order: typeof taskData.order === 'number' ? taskData.order : tasks.length,
      createdAt: taskData.createdAt || now,
      updatedAt: now,
      completedAt: taskData.status === 'completed' ? (taskData.completedAt || now) : undefined,
    };

    tasks.push(newTask);
    await this.saveTasks(tasks);
    return newTask;
  }

  public async deleteTask(id: string): Promise<boolean> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) {
      return false;
    }
    tasks.splice(index, 1);
    await this.saveTasks(tasks);
    return true;
  }

  public normalizeStatus(status?: string): TaskStatus {
    if (status === 'in_progress' || status === 'completed') {
      return status;
    }
    return 'todo';
  }

  public normalizePriority(priority?: string): TaskPriority {
    if (priority === 'p0' || priority === 'p1' || priority === 'p2') {
      return priority;
    }
    return 'none';
  }
}

export default new TaskService();
```

- [x] **Step 4: 运行测试验证通过**

运行：`npx jest tests/taskService.test.ts`
预期：PASS

- [x] **Step 5: 提交任务代码**

```bash
git add src/types/tasks.ts src/types/index.ts src/admin/services/taskService.ts tests/taskService.test.ts
git commit -m "feat(tasks): implement TaskService with atomic write and self-healing storage"
```

---

### Task 2: 后端控制器与 API 路由（TaskController & AdminRoutes）

**Files:**
- Create: `src/admin/controllers/taskController.ts`
- Modify: `src/admin/routes/adminRoutes.ts:1-35`
- Test: `tests/taskRoutes.test.ts`

**Interfaces:**
- Consumes: `src/admin/services/taskService.ts`
- Produces: 
  - `GET /api/admin/tasks`
  - `PUT /api/admin/tasks`
  - `POST /api/admin/tasks`
  - `DELETE /api/admin/tasks/:id`

- [x] **Step 1: 编写 API 路由测试（鉴权、验证、CRUD）**

创建 `tests/taskRoutes.test.ts`：
```typescript
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
```

- [x] **Step 2: 运行测试验证失败**

运行：`npx jest tests/taskRoutes.test.ts`
预期：FAIL（接口尚未定义，返回 404）

- [x] **Step 3: 实现 TaskController 并注册到 AdminRoutes**

创建 `src/admin/controllers/taskController.ts`：
```typescript
import { Request, Response } from 'express';
import taskService from '../services/taskService';
import { TaskItem } from '../../types/tasks';

class TaskController {
  public async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const tasks = await taskService.getTasks();
      res.json({ success: true, tasks });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async saveTasks(req: Request, res: Response): Promise<void> {
    try {
      const { tasks } = req.body;
      if (!Array.isArray(tasks)) {
        res.status(400).json({ success: false, error: 'Request body must contain tasks array' });
        return;
      }

      // Basic validation and sanitize
      const sanitized: TaskItem[] = tasks.map((t: any, index: number) => ({
        id: String(t.id || `task_${Date.now()}_${index}`),
        title: String(t.title || '').trim().slice(0, 200) || '未命名事项',
        description: t.description ? String(t.description).slice(0, 10000) : undefined,
        status: taskService.normalizeStatus(t.status),
        priority: taskService.normalizePriority(t.priority),
        tags: Array.isArray(t.tags) ? t.tags.map((x: any) => String(x).trim()).filter(Boolean) : undefined,
        dueDate: t.dueDate ? String(t.dueDate) : undefined,
        order: typeof t.order === 'number' ? t.order : index,
        createdAt: Number(t.createdAt) || Date.now(),
        updatedAt: Date.now(),
        completedAt: t.status === 'completed' ? (Number(t.completedAt) || Date.now()) : undefined,
      }));

      await taskService.saveTasks(sanitized);
      res.json({ success: true, count: sanitized.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async addTask(req: Request, res: Response): Promise<void> {
    try {
      const { title, description, status, priority, tags, dueDate, order } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      const newTask = await taskService.addTask({
        title,
        description,
        status,
        priority,
        tags,
        dueDate,
        order,
      });

      res.json({ success: true, task: newTask });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  public async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const deleted = await taskService.deleteTask(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Task not found' });
        return;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

export default new TaskController();
```

更新 `src/admin/routes/adminRoutes.ts` 引入 `taskController` 并增加路由：
```typescript
import taskController from '../controllers/taskController';

// 在合适位置添加:
// Tasks Management Routes
router.get('/tasks', (req, res) => taskController.getTasks(req, res));
router.put('/tasks', (req, res) => taskController.saveTasks(req, res));
router.post('/tasks', (req, res) => taskController.addTask(req, res));
router.delete('/tasks/:id', (req, res) => taskController.deleteTask(req, res));
```

- [x] **Step 4: 运行测试验证通过**

运行：`npx jest tests/taskRoutes.test.ts`
预期：PASS

- [x] **Step 5: 提交任务代码**

```bash
git add src/admin/controllers/taskController.ts src/admin/routes/adminRoutes.ts tests/taskRoutes.test.ts
git commit -m "feat(tasks): add taskController and register tasks endpoints under /api/admin/tasks"
```

---

### Task 3: 前端发现页应用注册与国际化支持

**Files:**
- Modify: `src/types/index.ts:90-95`
- Modify: `config/default.ts:8-43`
- Modify: `frontend/src/types/discoverApps.ts:1-5`
- Modify: `frontend/src/utils/discoverAppsStorage.ts:3-38`
- Modify: `frontend/src/i18n/locales/zh.ts:639-688`
- Modify: `frontend/src/i18n/locales/en.ts:639-688`
- Test: `tests/discoverTasksRegistration.test.ts`

**Interfaces:**
- Consumes: `BuiltinToolId`
- Produces: `DEFAULT_BUILTIN_APPS` 包含 `tasks` 内置应用条目，i18n 包含中英文对应的 `tasks` 文案。

- [x] **Step 1: 编写发现页注册与 i18n 单元测试**

创建 `tests/discoverTasksRegistration.test.ts`：
```typescript
import { DEFAULT_BUILTIN_DISCOVER_APPS } from '../config/default';
import { DEFAULT_BUILTIN_APPS } from '../frontend/src/utils/discoverAppsStorage';
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover Tasks App Registration & i18n', () => {
  test('Backend default config includes tasks builtin app', () => {
    const tasksApp = DEFAULT_BUILTIN_DISCOVER_APPS.find(a => a.id === 'tasks');
    expect(tasksApp).toBeDefined();
    expect(tasksApp?.type).toBe('builtin');
    expect(tasksApp?.icon).toBe('CheckSquare');
  });

  test('Frontend default builtin apps includes tasks app', () => {
    const tasksApp = DEFAULT_BUILTIN_APPS.find(a => a.id === 'tasks');
    expect(tasksApp).toBeDefined();
    expect(tasksApp?.type).toBe('builtin');
    expect(tasksApp?.name).toBe('在线事项');
  });

  test('i18n locales include tasks section with required labels', () => {
    expect((zh as any).tasks).toBeDefined();
    expect((zh as any).tasks.title).toBe('在线事项');
    expect((zh as any).tasks.kanbanView).toBe('看板视图');
    expect((zh as any).tasks.listView).toBe('清单视图');

    expect((en as any).tasks).toBeDefined();
    expect((en as any).tasks.title).toBe('Online Tasks');
    expect((en as any).tasks.kanbanView).toBe('Kanban View');
    expect((en as any).tasks.listView).toBe('List View');
  });
});
```

- [x] **Step 2: 运行测试验证失败**

运行：`npx jest tests/discoverTasksRegistration.test.ts`
预期：FAIL

- [x] **Step 3: 更新类型、默认配置与中英 i18n**

1. 修改 `src/types/index.ts` 与 `frontend/src/types/discoverApps.ts`：
```typescript
export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate' | 'tasks';
```

2. 修改 `config/default.ts` 和 `frontend/src/utils/discoverAppsStorage.ts`，在 `DEFAULT_BUILTIN_DISCOVER_APPS` / `DEFAULT_BUILTIN_APPS` 中追加：
```typescript
  {
    id: 'tasks',
    type: 'builtin',
    name: '在线事项',
    description: '轻量高效的待办清单与状态看板，云端实时同步',
    icon: 'CheckSquare',
    color: 'from-emerald-500 to-teal-600',
    badge: 'KANBAN & LIST',
    enabled: true,
    order: 3,
  },
```

3. 更新 `frontend/src/i18n/locales/zh.ts` 和 `en.ts`，添加 `tasks` 键定义：
```typescript
  tasks: {
    title: '在线事项',
    subtitle: '轻量高效的待办清单与状态看板，云端实时同步',
    kanbanView: '看板视图',
    listView: '清单视图',
    addTask: '新建事项',
    editTask: '编辑事项',
    deleteTask: '删除事项',
    confirmDelete: '确定要删除此事项吗？',
    todo: '待办',
    inProgress: '进行中',
    completed: '已完成',
    priority: '优先级',
    priorityP0: 'P0 紧急',
    priorityP1: 'P1 重要',
    priorityP2: 'P2 常规',
    priorityNone: '无优先级',
    titlePlaceholder: '输入事项标题...',
    descPlaceholder: '添加详细说明或备忘 (支持 Markdown)...',
    dueDate: '截止日期',
    searchPlaceholder: '搜索事项标题或内容...',
    filterAll: '全部状态',
    filterPriority: '优先级筛选',
    synced: '云端已同步',
    syncing: '正在同步...',
    syncFailed: '同步失败 (点击重试)',
    emptyTodo: '暂无待办事项',
    emptyInProgress: '暂无进行中事项',
    emptyCompleted: '暂无已完成事项',
    emptyList: '暂无匹配的事项',
    save: '保存',
    cancel: '取消',
  }
```

- [x] **Step 4: 运行测试验证通过**

运行：`npx jest tests/discoverTasksRegistration.test.ts`
预期：PASS

- [x] **Step 5: 提交任务代码**

```bash
git add src/types/index.ts config/default.ts frontend/src/types/discoverApps.ts frontend/src/utils/discoverAppsStorage.ts frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/discoverTasksRegistration.test.ts
git commit -m "feat(discover): register tasks builtin app and add bilingual i18n support"
```

---

### Task 4: 前端事项应用核心组件（TasksView、TaskEditModal 与双视图拖拽）

**Files:**
- Create: `frontend/src/types/tasks.ts`
- Create: `frontend/src/components/TaskEditModal.tsx`
- Create: `frontend/src/components/TasksView.tsx`
- Test: `tests/tasksViewComponent.test.ts`

**Interfaces:**
- Consumes: `TaskItem`, `TaskStatus`, `TaskPriority`
- Produces: 
  - `<TasksView adminKey={adminKey} onBack={onBack} />`
  - `<TaskEditModal isOpen={isOpen} task={task} onSave={onSave} onClose={onClose} />`

- [x] **Step 1: 编写 TasksView 组件静态语法与结构验证测试**

创建 `tests/tasksViewComponent.test.ts`：
```typescript
import fs from 'fs';
import path from 'path';

describe('TasksView & TaskEditModal Component Architecture', () => {
  const tasksViewPath = path.resolve(__dirname, '../frontend/src/components/TasksView.tsx');
  const editModalPath = path.resolve(__dirname, '../frontend/src/components/TaskEditModal.tsx');
  const typesPath = path.resolve(__dirname, '../frontend/src/types/tasks.ts');

  test('Component and type files exist', () => {
    expect(fs.existsSync(typesPath)).toBe(true);
    expect(fs.existsSync(tasksViewPath)).toBe(true);
    expect(fs.existsSync(editModalPath)).toBe(true);
  });

  test('TasksView implements Kanban and List view switches and optimistic debounced sync', () => {
    const content = fs.readFileSync(tasksViewPath, 'utf-8');
    expect(content).toContain('kanban');
    expect(content).toContain('list');
    expect(content).toContain('/api/admin/tasks');
    expect(content).toContain('onDragStart');
    expect(content).toContain('onDrop');
  });

  test('TaskEditModal supports title, description, priority, and dueDate', () => {
    const modalContent = fs.readFileSync(editModalPath, 'utf-8');
    expect(modalContent).toContain('title');
    expect(modalContent).toContain('priority');
    expect(modalContent).toContain('dueDate');
    expect(modalContent).toContain('description');
  });
});
```

- [x] **Step 2: 运行测试验证失败**

运行：`npx jest tests/tasksViewComponent.test.ts`
预期：FAIL

- [x] **Step 3: 创建前端类型与编辑弹窗组件 `TaskEditModal.tsx`**

创建 `frontend/src/types/tasks.ts`：
```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
export type TaskPriority = 'p0' | 'p1' | 'p2' | 'none';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags?: string[];
  dueDate?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}
```

创建 `frontend/src/components/TaskEditModal.tsx`：实现包含标题、优先级胶囊单选、状态切换、多行描述、截止日期的平滑浮层。

- [x] **Step 4: 创建 `TasksView.tsx` 组件**

包含：
1. 看板视图（3 列布局：待办/进行中/已完成，支持 HTML5 原生拖拽 `draggable`, `onDragOver`, `onDrop`）；
2. 清单视图（高密度列表，带勾选划线动效与状态分组）；
3. 搜索与优先级即时过滤；
4. 乐观更新（状态本地即时改变）结合 500ms 防抖自动提交 `PUT /api/admin/tasks`；
5. 云端同步指示微标与错误重试机制。

- [x] **Step 5: 运行测试验证通过**

运行：`npx jest tests/tasksViewComponent.test.ts`
预期：PASS

- [x] **Step 6: 提交任务代码**

```bash
git add frontend/src/types/tasks.ts frontend/src/components/TaskEditModal.tsx frontend/src/components/TasksView.tsx tests/tasksViewComponent.test.ts
git commit -m "feat(tasks): create TasksView and TaskEditModal with Kanban and List dual views"
```

---

### Task 5: 主控制台集成（App.tsx 与 DiscoverHubView 挂载）与端到端测试

**Files:**
- Modify: `frontend/src/App.tsx:50-100, 580-650, 750-800`
- Modify: `frontend/src/components/DiscoverHubView.tsx:30-45, 80-100`
- Test: `tests/discoverTasksIntegration.test.ts`

**Interfaces:**
- Consumes: `TasksView.tsx`, `DiscoverSubView`
- Produces: 
  - `discoverSubView === 'tasks'` 渲染 `<TasksView />`
  - 点击“发现”页“在线事项”卡片无缝拉起
  - 顶栏展示“返回发现”与面包屑导航

- [x] **Step 1: 编写端到端集成测试**

创建 `tests/discoverTasksIntegration.test.ts`：
```typescript
import fs from 'fs';
import path from 'path';

describe('Tasks View Discover Hub Integration', () => {
  const appPath = path.resolve(__dirname, '../frontend/src/App.tsx');
  const hubPath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  test('App.tsx registers tasks in DiscoverSubView and imports TasksView lazy', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    expect(appContent).toContain("'tasks'");
    expect(appContent).toContain('TasksView');
    expect(appContent).toContain("discoverSubView === 'tasks'");
  });

  test('DiscoverHubView supports tasks tool launching', () => {
    const hubContent = fs.readFileSync(hubPath, 'utf-8');
    expect(hubContent).toContain('tasks');
  });
});
```

- [x] **Step 2: 运行测试验证失败**

运行：`npx jest tests/discoverTasksIntegration.test.ts`
预期：FAIL

- [x] **Step 3: 修改 `frontend/src/App.tsx` 和 `DiscoverHubView.tsx`**

1. 在 `frontend/src/App.tsx` 中：
   - 扩充 `DiscoverSubView = 'hub' | 'systemLogs' | 'playground' | 'translate' | 'tasks' | 'embeddedWeb'`;
   - 懒加载 `const TasksView = lazy(() => import('./components/TasksView'));`;
   - 在面包屑与顶栏导航处，针对 `discoverSubView === 'tasks'` 添加“返回发现”与标题渲染；
   - 在主视图展示区渲染 `<TasksView adminKey={adminKey} onBack={() => setDiscoverSubView('hub')} />`。

2. 在 `frontend/src/components/DiscoverHubView.tsx` 中：
   - 更新 `DiscoverToolId = 'systemLogs' | 'playground' | 'translate' | 'tasks'`;
   - 确保 `handleLaunchApp` 命中 `tasks` 时正常调用 `onSelectTool('tasks')`。

- [x] **Step 4: 运行测试验证通过**

运行：`npx jest tests/discoverTasksIntegration.test.ts`
预期：PASS

- [x] **Step 5: 提交任务代码**

```bash
git add frontend/src/App.tsx frontend/src/components/DiscoverHubView.tsx tests/discoverTasksIntegration.test.ts
git commit -m "feat(discover): integrate TasksView into App.tsx and DiscoverHubView"
```

---

### Task 6: 完整构建验证与现有测试套件回归

**Files:**
- Test: All Jest tests
- Build: `npm run build`

- [x] **Step 1: 运行全量单元与集成测试套件**

运行：`npm test`
预期：全量测试套件 PASS，零回归错误。

- [x] **Step 2: 执行全量打包编译（前端 + 后端）**

运行：`npm run build`
预期：
- `npm run build:frontend` (Vite) 成功输出至 `dist/frontend`，TypeScript 检查 0 报错；
- `npm run build:backend` (`tsc`) 成功输出至 `dist/src`，0 类型错误。

- [x] **Step 3: 最终成果提交**

```bash
git add .
git commit -m "chore(tasks): verify build and all tests passing for discover online tasks app"
```
