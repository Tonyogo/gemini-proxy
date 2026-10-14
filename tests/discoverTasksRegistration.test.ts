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
