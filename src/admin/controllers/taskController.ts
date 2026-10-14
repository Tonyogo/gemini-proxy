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
