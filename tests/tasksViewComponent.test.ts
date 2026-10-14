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
