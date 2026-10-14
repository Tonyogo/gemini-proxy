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
