import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Calendar,
  AlertCircle,
  Flag,
  AlignLeft,
  Clock,
  Sparkles
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { TaskItem, TaskPriority, TaskStatus } from '../types/tasks';

export interface TaskEditModalProps {
  isOpen: boolean;
  task?: TaskItem | null;
  initialStatus?: TaskStatus;
  onClose: () => void;
  onSave: (taskData: Partial<TaskItem>) => void;
}

export const TaskEditModal: React.FC<TaskEditModalProps> = ({
  isOpen,
  task,
  initialStatus = 'todo',
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (task) {
        setTitle(task.title || '');
        setDescription(task.description || '');
        setStatus(task.status || 'todo');
        setPriority(task.priority || 'none');
        setDueDate(task.dueDate || '');
      } else {
        setTitle('');
        setDescription('');
        setStatus(initialStatus);
        setPriority('none');
        setDueDate('');
      }
      setError(null);

      // Focus title after animation
      const timer = setTimeout(() => {
        titleInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, task, initialStatus]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('tasks.titlePlaceholder', '输入事项标题...'));
      titleInputRef.current?.focus();
      return;
    }

    onSave({
      id: task ? task.id : undefined,
      title: trimmedTitle.slice(0, 200),
      description: description.trim() ? description.slice(0, 10000) : undefined,
      status,
      priority,
      dueDate: dueDate || undefined,
      order: task ? task.order : undefined,
      createdAt: task ? task.createdAt : undefined,
      completedAt: status === 'completed' ? (task?.completedAt || Date.now()) : undefined,
    });

    onClose();
  };

  const priorityOptions: { value: TaskPriority; label: string; badgeClass: string; activeClass: string }[] = [
    {
      value: 'p0',
      label: t('tasks.priorityP0', 'P0 紧急'),
      badgeClass: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
      activeClass: 'bg-rose-500 text-white shadow-rose-500/20 shadow-md border-rose-500',
    },
    {
      value: 'p1',
      label: t('tasks.priorityP1', 'P1 重要'),
      badgeClass: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
      activeClass: 'bg-amber-500 text-white shadow-amber-500/20 shadow-md border-amber-500',
    },
    {
      value: 'p2',
      label: t('tasks.priorityP2', 'P2 常规'),
      badgeClass: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
      activeClass: 'bg-blue-500 text-white shadow-blue-500/20 shadow-md border-blue-500',
    },
    {
      value: 'none',
      label: t('tasks.priorityNone', '无优先级'),
      badgeClass: 'text-[var(--text-muted)] bg-[var(--bg-muted)] border-[var(--border-subtle)]',
      activeClass: 'bg-slate-600 text-white shadow-slate-600/20 shadow-md border-slate-600',
    },
  ];

  const statusOptions: { value: TaskStatus; label: string }[] = [
    { value: 'todo', label: t('tasks.todo', '待办') },
    { value: 'in_progress', label: t('tasks.inProgress', '进行中') },
    { value: 'completed', label: t('tasks.completed', '已完成') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[var(--text-primary)]">
                {task ? t('tasks.editTask', '编辑事项') : t('tasks.addTask', '新建事项')}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('tasks.subtitle', '轻量高效的待办清单与状态看板，云端实时同步')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-center space-x-2 p-3 text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              {t('tasks.titlePlaceholder', '输入事项标题...')} <span className="text-rose-500">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t('tasks.titlePlaceholder', '输入事项标题...')}
              maxLength={200}
              className="w-full px-3.5 py-2.5 text-sm bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-[var(--text-muted)]">
                {title.length}/200
              </span>
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              <Clock className="w-3.5 h-3.5 inline mr-1 text-[var(--text-muted)]" />
              {t('tasks.todo', '状态')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all text-center ${
                    status === opt.value
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              <Flag className="w-3.5 h-3.5 inline mr-1 text-[var(--text-muted)]" />
              {t('tasks.priority', '优先级')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {priorityOptions.map((opt) => {
                const isSelected = priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPriority(opt.value)}
                    className={`py-2 px-2.5 text-xs font-medium rounded-xl border transition-all text-center flex items-center justify-center space-x-1.5 ${
                      isSelected
                        ? opt.activeClass
                        : `${opt.badgeClass} hover:opacity-80`
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1 text-[var(--text-muted)]" />
              {t('tasks.dueDate', '截止日期')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              <AlignLeft className="w-3.5 h-3.5 inline mr-1 text-[var(--text-muted)]" />
              {t('tasks.descPlaceholder', '添加详细说明或备忘 (支持 Markdown)...')}
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('tasks.descPlaceholder', '添加详细说明或备忘 (支持 Markdown)...')}
              maxLength={10000}
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all resize-y font-mono"
            />
            <div className="flex justify-end mt-1">
              <span className="text-[10px] text-[var(--text-muted)]">
                {description.length}/10000
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
            >
              {t('tasks.cancel', '取消')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-medium rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('tasks.save', '保存')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskEditModal;
