import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Kanban,
  List,
  Plus,
  Search,
  CheckCircle2,
  Circle,
  Calendar,
  Trash2,
  Edit2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Check
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { TaskItem, TaskPriority, TaskStatus } from '../types/tasks';
import TaskEditModal from './TaskEditModal';

export interface TasksViewProps {
  adminKey?: string;
  onBack?: () => void;
}

type ViewMode = 'kanban' | 'list';
type SyncStatus = 'synced' | 'syncing' | 'failed';

const STATUS_COLUMNS: { key: TaskStatus; labelKey: string; color: string; bgLight: string }[] = [
  { key: 'todo', labelKey: 'tasks.todo', color: 'text-amber-500', bgLight: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'in_progress', labelKey: 'tasks.inProgress', color: 'text-blue-500', bgLight: 'bg-blue-500/10 border-blue-500/20' },
  { key: 'completed', labelKey: 'tasks.completed', color: 'text-emerald-500', bgLight: 'bg-emerald-500/10 border-emerald-500/20' },
];

export const TasksView: React.FC<TasksViewProps> = ({ adminKey, onBack }) => {
  const { t } = useTranslation();

  // View mode preference
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('tasks_view_mode');
    return saved === 'list' ? 'list' : 'kanban';
  });

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('tasks_view_mode', mode);
  };

  // State
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [modalInitialStatus, setModalInitialStatus] = useState<TaskStatus>('todo');

  // Drag and drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  // Debounced auto-save timer ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tasksRef = useRef<TaskItem[]>(tasks);
  tasksRef.current = tasks;

  const getEffectiveKey = useCallback(() => {
    return adminKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminKey') || '' : '');
  }, [adminKey]);

  // Load tasks on mount
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const key = getEffectiveKey();
      const res = await fetch('/api/admin/tasks', {
        headers: {
          'x-admin-key': key,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load tasks: ${res.status}`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.tasks)) {
        setTasks(data.tasks);
        setSyncStatus('synced');
      }
    } catch (err) {
      console.error('[TasksView] Error loading tasks:', err);
      setSyncStatus('failed');
    } finally {
      setLoading(false);
    }
  }, [getEffectiveKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Debounced sync function
  const triggerSync = useCallback((newTasks: TaskItem[]) => {
    setSyncStatus('syncing');

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const key = getEffectiveKey();
        const res = await fetch('/api/admin/tasks', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': key,
          },
          body: JSON.stringify({ tasks: newTasks }),
        });

        if (!res.ok) {
          throw new Error(`Sync failed with status ${res.status}`);
        }

        setSyncStatus('synced');
      } catch (err) {
        console.error('[TasksView] Auto-sync failed:', err);
        setSyncStatus('failed');
      }
    }, 500);
  }, [getEffectiveKey]);

  // Task mutations with optimistic update
  const handleSaveTask = (taskData: Partial<TaskItem>) => {
    const now = Date.now();
    let updatedTasks: TaskItem[];

    if (taskData.id) {
      // Editing existing task
      updatedTasks = tasks.map((item) => {
        if (item.id === taskData.id) {
          return {
            ...item,
            ...taskData,
            updatedAt: now,
            completedAt:
              taskData.status === 'completed'
                ? item.status === 'completed'
                  ? item.completedAt || now
                  : now
                : undefined,
          } as TaskItem;
        }
        return item;
      });
    } else {
      // Adding new task
      const newTask: TaskItem = {
        id: `task_${now}_${Math.random().toString(36).slice(2, 7)}`,
        title: (taskData.title || '').trim().slice(0, 200) || '未命名事项',
        description: taskData.description,
        status: taskData.status || 'todo',
        priority: taskData.priority || 'none',
        dueDate: taskData.dueDate,
        order: tasks.length,
        createdAt: now,
        updatedAt: now,
        completedAt: taskData.status === 'completed' ? now : undefined,
      };
      updatedTasks = [...tasks, newTask];
    }

    setTasks(updatedTasks);
    triggerSync(updatedTasks);
  };

  const handleDeleteTask = (id: string) => {
    const confirmMsg = t('tasks.confirmDelete', '确定要删除此事项吗？');
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(confirmMsg)) {
      return;
    }

    const updatedTasks = tasks.filter((t) => t.id !== id);
    setTasks(updatedTasks);
    triggerSync(updatedTasks);
  };

  const handleToggleTaskStatus = (task: TaskItem) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
    const now = Date.now();
    const updatedTasks = tasks.map((t) => {
      if (t.id === task.id) {
        return {
          ...t,
          status: nextStatus,
          updatedAt: now,
          completedAt: nextStatus === 'completed' ? now : undefined,
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    triggerSync(updatedTasks);
  };

  // Drag & drop handlers
  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, colStatus: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colStatus) {
      setDragOverColumn(colStatus);
    }
  };

  const onDragLeave = () => {
    setDragOverColumn(null);
  };

  const onDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetStatus) return;

    const now = Date.now();
    const updatedTasks = tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: targetStatus,
          updatedAt: now,
          completedAt: targetStatus === 'completed' ? now : undefined,
        };
      }
      return t;
    });

    setTasks(updatedTasks);
    triggerSync(updatedTasks);
  };

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(query);
        const matchDesc = t.description?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc) return false;
      }
      if (priorityFilter !== 'all') {
        if (t.priority !== priorityFilter) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, priorityFilter]);

  const openCreateModal = (status: TaskStatus = 'todo') => {
    setEditingTask(null);
    setModalInitialStatus(status);
    setIsModalOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setModalInitialStatus(task.status);
    setIsModalOpen(true);
  };

  const renderPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'p0':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
            P0
          </span>
        );
      case 'p1':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            P1
          </span>
        );
      case 'p2':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            P2
          </span>
        );
      default:
        return null;
    }
  };

  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    const dueTime = new Date(dueDate).setHours(23, 59, 59, 999);
    return dueTime < Date.now();
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-canvas)] text-[var(--text-primary)] overflow-hidden">
      {/* Top Header & Actions Toolbar */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
        {/* Left: Back / Title / View Switcher */}
        <div className="flex items-center space-x-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors"
              title={t('discover.backToDiscover', '返回发现')}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center space-x-1.5">
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
              {t('tasks.title', '在线事项')}
            </h2>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-[var(--bg-input)] p-0.5 rounded-xl border border-[var(--border-subtle)] text-xs">
            <button
              type="button"
              onClick={() => handleSetViewMode('kanban')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'kanban'
                  ? 'bg-emerald-500 text-white shadow-sm font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('tasks.kanbanView', '看板')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-emerald-500 text-white shadow-sm font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('tasks.listView', '清单')}</span>
            </button>
          </div>
        </div>

        {/* Right: Search, Filter, Sync Status, Add Button */}
        <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tasks.searchPlaceholder', '搜索事项...')}
              className="w-36 sm:w-48 pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Priority Filter */}
          <div className="relative">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="text-xs py-1.5 px-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-secondary)] focus:outline-none"
            >
              <option value="all">{t('tasks.filterAll', '全部状态')}</option>
              <option value="p0">{t('tasks.priorityP0', 'P0 紧急')}</option>
              <option value="p1">{t('tasks.priorityP1', 'P1 重要')}</option>
              <option value="p2">{t('tasks.priorityP2', 'P2 常规')}</option>
              <option value="none">{t('tasks.priorityNone', '无优先级')}</option>
            </select>
          </div>

          {/* Cloud Sync Status Pill */}
          <div className="flex items-center">
            {syncStatus === 'synced' && (
              <span className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <Check className="w-3 h-3" />
                <span className="hidden md:inline">{t('tasks.synced', '云端已同步')}</span>
              </span>
            )}
            {syncStatus === 'syncing' && (
              <span className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 rounded-lg border border-amber-500/20 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="hidden md:inline">{t('tasks.syncing', '正在同步...')}</span>
              </span>
            )}
            {syncStatus === 'failed' && (
              <button
                type="button"
                onClick={() => triggerSync(tasksRef.current)}
                className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium text-rose-500 bg-rose-500/10 rounded-lg border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
                title={t('tasks.syncFailed', '同步失败 (点击重试)')}
              >
                <AlertCircle className="w-3 h-3" />
                <span>{t('tasks.syncFailed', '重试')}</span>
              </button>
            )}
          </div>

          {/* Create Task Button */}
          <button
            type="button"
            onClick={() => openCreateModal('todo')}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('tasks.addTask', '新建事项')}</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-hidden p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
          </div>
        ) : viewMode === 'kanban' ? (
          /* Kanban Board View */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full overflow-y-auto md:overflow-hidden pb-6">
            {STATUS_COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.key);
              const isDragOver = dragOverColumn === col.key;

              return (
                <div
                  key={col.key}
                  onDragOver={(e) => onDragOver(e, col.key)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, col.key)}
                  className={`flex flex-col h-full rounded-2xl border transition-all ${
                    isDragOver
                      ? 'border-emerald-500/80 bg-emerald-500/5 shadow-md shadow-emerald-500/10 ring-2 ring-emerald-500/20'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                  }`}
                >
                  {/* Column Header */}
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.key === 'todo' ? 'bg-amber-500' : col.key === 'in_progress' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                        {t(col.labelKey, col.key)}
                      </h3>
                      <span className="px-1.5 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        {colTasks.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreateModal(col.key)}
                      className="p-1 text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                      title={t('tasks.addTask', '新建事项')}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Column Body / Cards List */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {colTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-36 border-2 border-dashed border-[var(--border-subtle)] rounded-xl text-center p-4">
                        <p className="text-xs text-[var(--text-muted)]">
                          {col.key === 'todo'
                            ? t('tasks.emptyTodo', '暂无待办事项')
                            : col.key === 'in_progress'
                            ? t('tasks.emptyInProgress', '暂无进行中事项')
                            : t('tasks.emptyCompleted', '暂无已完成事项')}
                        </p>
                        <button
                          type="button"
                          onClick={() => openCreateModal(col.key)}
                          className="mt-2 text-[11px] text-emerald-500 hover:underline flex items-center space-x-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{t('tasks.addTask', '新建事项')}</span>
                        </button>
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const isTaskCompleted = task.status === 'completed';
                        const overdue = !isTaskCompleted && isOverdue(task.dueDate);

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, task.id)}
                            className={`group relative p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-emerald-500/40 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all ${
                              draggedTaskId === task.id ? 'opacity-40 scale-95' : 'opacity-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              {/* Complete Toggle */}
                              <button
                                type="button"
                                onClick={() => handleToggleTaskStatus(task)}
                                className="mt-0.5 text-[var(--text-muted)] hover:text-emerald-500 transition-colors flex-shrink-0"
                              >
                                {isTaskCompleted ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                                ) : (
                                  <Circle className="w-4 h-4 hover:stroke-emerald-500" />
                                )}
                              </button>

                              {/* Title & Description */}
                              <div className="flex-1 min-w-0" onClick={() => openEditModal(task)}>
                                <h4
                                  className={`text-xs font-semibold leading-snug break-words ${
                                    isTaskCompleted
                                      ? 'line-through text-[var(--text-muted)]'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  {task.title}
                                </h4>
                                {task.description && (
                                  <p className="mt-1 text-[11px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                                    {task.description}
                                  </p>
                                )}
                              </div>

                              {/* Priority Badge */}
                              <div className="flex-shrink-0">
                                {renderPriorityBadge(task.priority)}
                              </div>
                            </div>

                            {/* Card Footer: Due Date & Actions */}
                            <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)]/60 flex items-center justify-between text-[10px]">
                              {task.dueDate ? (
                                <span
                                  className={`inline-flex items-center space-x-1 ${
                                    overdue
                                      ? 'text-rose-500 font-medium'
                                      : 'text-[var(--text-muted)]'
                                  }`}
                                >
                                  <Calendar className="w-3 h-3" />
                                  <span>{task.dueDate}</span>
                                </span>
                              ) : (
                                <span />
                              )}

                              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(task)}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                  title={t('tasks.editTask', '编辑事项')}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                  title={t('tasks.deleteTask', '删除事项')}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* High-density List View */
          <div className="h-full overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-sm p-4 space-y-4">
            {filteredTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm text-[var(--text-muted)]">
                  {t('tasks.emptyList', '暂无匹配的事项')}
                </p>
                <button
                  type="button"
                  onClick={() => openCreateModal('todo')}
                  className="mt-3 px-3.5 py-1.5 text-xs font-medium rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  {t('tasks.addTask', '新建事项')}
                </button>
              </div>
            ) : (
              STATUS_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.key);
                if (colTasks.length === 0) return null;

                return (
                  <div key={col.key} className="space-y-2">
                    <div className="flex items-center space-x-2 px-2 py-1">
                      <span className={`w-2 h-2 rounded-full ${col.key === 'todo' ? 'bg-amber-500' : col.key === 'in_progress' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        {t(col.labelKey, col.key)}
                      </h4>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        ({colTasks.length})
                      </span>
                    </div>

                    <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--bg-card)]">
                      {colTasks.map((task) => {
                        const isTaskCompleted = task.status === 'completed';
                        const overdue = !isTaskCompleted && isOverdue(task.dueDate);

                        return (
                          <div
                            key={task.id}
                            className="group flex items-center justify-between px-3.5 py-2.5 hover:bg-[var(--bg-hover)] transition-colors gap-3"
                          >
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => handleToggleTaskStatus(task)}
                              className="text-[var(--text-muted)] hover:text-emerald-500 flex-shrink-0 transition-colors"
                            >
                              {isTaskCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4 hover:stroke-emerald-500" />
                              )}
                            </button>

                            {/* Title & Desc */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => openEditModal(task)}
                            >
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`text-xs font-medium truncate ${
                                    isTaskCompleted
                                      ? 'line-through text-[var(--text-muted)]'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                {renderPriorityBadge(task.priority)}
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                                  {task.description}
                                </p>
                              )}
                            </div>

                            {/* Due Date & Actions */}
                            <div className="flex items-center space-x-3 flex-shrink-0 text-xs">
                              {task.dueDate && (
                                <span
                                  className={`inline-flex items-center space-x-1 text-[11px] ${
                                    overdue
                                      ? 'text-rose-500 font-medium'
                                      : 'text-[var(--text-muted)]'
                                  }`}
                                >
                                  <Calendar className="w-3 h-3" />
                                  <span>{task.dueDate}</span>
                                </span>
                              )}

                              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(task)}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                  title={t('tasks.editTask', '编辑事项')}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                  title={t('tasks.deleteTask', '删除事项')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Task Edit/Create Modal */}
      <TaskEditModal
        isOpen={isModalOpen}
        task={editingTask}
        initialStatus={modalInitialStatus}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTask}
      />
    </div>
  );
};

export default TasksView;
