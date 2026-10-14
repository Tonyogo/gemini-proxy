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
