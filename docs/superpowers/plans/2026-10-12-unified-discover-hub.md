# Unified Discover Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge builtin tools and custom web apps in the Discover page into a single unified layout with desktop-only page configuration management (arbitrary reordering, visibility toggling, CRUD custom apps) while keeping mobile purely read-only.

**Architecture:** Abstract both builtin tools and custom web apps into a uniform `DiscoverAppItem` model. Provide a persistent storage utility `discoverAppsStorage.ts` with legacy data migration, introduce a dedicated `DiscoverConfigModal` for managing order and visibility on desktop, and refactor `DiscoverHubView` to render a single unified responsive grid on desktop and a clean list on mobile.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest.

**Spec:** `docs/superpowers/specs/2026-10-12-unified-discover-hub-design.md`

## Global Constraints
- Node 18+ and TypeScript strict mode compatibility.
- Zero static configuration caching; respect dynamic updates.
- Storage backward compatibility: users with existing `custom_discover_apps` in localStorage must have their apps automatically preserved and migrated.
- Mobile viewport constraint: Mobile (`md:hidden`) Discover page is strictly read-only launcher; no edit or config buttons displayed.
- Desktop viewport constraint: Desktop (`hidden md:block`) Discover page provides "⚙ 管理页面" button and dashed "+ 添加应用 / 配置" card.

## Review Focus
1. **Migration idempotency**: Loading with existing `custom_discover_apps` in localStorage must seamlessly import custom items without duplicating builtin items.
2. **Hidden app handling**: When an app's `enabled` is toggled to `false`, it must not appear in the Discover launcher grid or mobile list, but must still be visible and toggleable in `DiscoverConfigModal`.
3. **Reordering bounds**: Move up on the first item and Move down on the last item must be safely disabled or no-op without crashing or corrupting index values.
4. **All apps hidden edge case**: If a user disables all apps, the page must show a friendly empty state with an easy way to reopen the config modal rather than a broken or blank screen.
5. **Mobile read-only guarantee**: Ensure that on mobile (`md:hidden`), no edit pencils, delete buttons, or manage page triggers are rendered.

---

### Task 1: Unified Data Types & Storage Migration Layer

**Files:**
- Create: `frontend/src/types/discoverApps.ts`
- Create: `frontend/src/utils/discoverAppsStorage.ts`
- Test: `tests/discoverAppsStorage.test.ts`

**Interfaces:**
- Produces:
  - `export interface DiscoverAppItem`: Unified app item interface.
  - `export function loadDiscoverApps(): DiscoverAppItem[]`: Loads apps with automatic legacy migration.
  - `export function saveDiscoverApps(apps: DiscoverAppItem[], adminKey?: string): void`: Persists apps to localStorage and optional remote admin config.
  - `export function resetDiscoverAppsToDefault(adminKey?: string): DiscoverAppItem[]`: Resets to initial default builtin + preset apps.
  - `export function moveDiscoverApp(id: string, direction: 'up' | 'down', adminKey?: string): DiscoverAppItem[]`: Reorders items.
  - `export function toggleDiscoverAppVisibility(id: string, adminKey?: string): DiscoverAppItem[]`: Toggles `enabled`.
  - `export function saveOrUpdateCustomApp(app: Partial<DiscoverAppItem>, adminKey?: string): DiscoverAppItem[]`: Adds or edits custom app.
  - `export function deleteCustomApp(id: string, adminKey?: string): DiscoverAppItem[]`: Removes custom app.

- [x] **Step 1: Write failing unit tests for storage utility**

Create `tests/discoverAppsStorage.test.ts`:
```typescript
import {
  loadDiscoverApps,
  saveDiscoverApps,
  resetDiscoverAppsToDefault,
  moveDiscoverApp,
  toggleDiscoverAppVisibility,
  saveOrUpdateCustomApp,
  deleteCustomApp,
  DISCOVER_APPS_STORAGE_KEY,
} from '../frontend/src/utils/discoverAppsStorage';
import { DiscoverAppItem } from '../frontend/src/types/discoverApps';

describe('discoverAppsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default builtin apps when storage is empty', () => {
    const apps = loadDiscoverApps();
    expect(apps.length).toBeGreaterThanOrEqual(3);
    expect(apps.some(a => a.id === 'systemLogs' && a.type === 'builtin')).toBe(true);
    expect(apps.some(a => a.id === 'playground' && a.type === 'builtin')).toBe(true);
    expect(apps.some(a => a.id === 'translate' && a.type === 'builtin')).toBe(true);
  });

  it('migrates legacy custom_discover_apps cleanly', () => {
    const legacy = [
      {
        id: 'legacy_app_1',
        name: 'My Service',
        url: 'https://example.com',
        color: 'from-orange-500 to-amber-600',
        createdAt: 1000,
      },
    ];
    localStorage.setItem('custom_discover_apps', JSON.stringify(legacy));

    const apps = loadDiscoverApps();
    expect(apps.some(a => a.id === 'legacy_app_1' && a.type === 'custom')).toBe(true);
    expect(apps.find(a => a.id === 'legacy_app_1')?.name).toBe('My Service');
  });

  it('moves apps up and down correctly', () => {
    let apps = resetDiscoverAppsToDefault();
    const firstId = apps[0].id;
    const secondId = apps[1].id;

    // Moving first item up should be a no-op
    apps = moveDiscoverApp(firstId, 'up');
    expect(apps[0].id).toBe(firstId);

    // Moving second item up swaps 0 and 1
    apps = moveDiscoverApp(secondId, 'up');
    expect(apps[0].id).toBe(secondId);
    expect(apps[1].id).toBe(firstId);
  });

  it('toggles visibility of an app', () => {
    let apps = resetDiscoverAppsToDefault();
    const target = apps[0];
    expect(target.enabled).toBe(true);

    apps = toggleDiscoverAppVisibility(target.id);
    expect(apps.find(a => a.id === target.id)?.enabled).toBe(false);

    apps = toggleDiscoverAppVisibility(target.id);
    expect(apps.find(a => a.id === target.id)?.enabled).toBe(true);
  });

  it('adds, edits and deletes custom app', () => {
    let apps = saveOrUpdateCustomApp({
      name: 'Test App',
      url: 'https://test.local',
      color: 'from-blue-500 to-cyan-600',
    });
    const created = apps.find(a => a.name === 'Test App');
    expect(created).toBeDefined();
    expect(created?.type).toBe('custom');
    expect(created?.url).toBe('https://test.local');

    // Edit
    apps = saveOrUpdateCustomApp({
      id: created!.id,
      name: 'Updated App',
      url: 'https://test.local/v2',
    });
    expect(apps.find(a => a.id === created!.id)?.name).toBe('Updated App');

    // Delete
    apps = deleteCustomApp(created!.id);
    expect(apps.find(a => a.id === created!.id)).toBeUndefined();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverAppsStorage.test.ts`
Expected: FAIL (files not yet created)

- [x] **Step 3: Implement `frontend/src/types/discoverApps.ts`**

Define `DiscoverAppItem`, `DiscoverAppType`, `BuiltinToolId`:
```typescript
export type DiscoverAppType = 'builtin' | 'custom';
export type BuiltinToolId = 'systemLogs' | 'playground' | 'translate';

export interface DiscoverAppItem {
  id: string;
  type: DiscoverAppType;
  name: string;
  description?: string;
  icon: string;
  color: string;
  badge?: string;
  enabled: boolean;
  order: number;
  url?: string;
  useGateway?: boolean;
  createdAt?: number;
}
```

- [x] **Step 4: Implement `frontend/src/utils/discoverAppsStorage.ts`**

Implement complete storage logic, default presets, migration from `custom_discover_apps`, URL normalization, and CRUD operations.

- [x] **Step 5: Run tests and verify they pass**

Run: `npx jest tests/discoverAppsStorage.test.ts`
Expected: PASS

- [x] **Step 6: Commit Task 1**

```bash
git add frontend/src/types/discoverApps.ts frontend/src/utils/discoverAppsStorage.ts tests/discoverAppsStorage.test.ts
git commit -m "feat(discover): add unified DiscoverAppItem schema and discoverAppsStorage utility"
```

---

### Task 2: Localization Dictionary Updates

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/discoverI18n.test.ts`

**Interfaces:**
- Produces translation keys under `discover`:
  - `managePage`: "页面配置" / "Manage Page"
  - `manageTitle`: "发现页管理" / "Discover Hub Settings"
  - `manageDesc`: "自定义卡片排序与显示隐藏" / "Customize app cards ordering and visibility"
  - `moveUp`: "上移" / "Move Up"
  - `moveDown`: "下移" / "Move Down"
  - `show`: "显示" / "Show"
  - `hide`: "隐藏" / "Hide"
  - `builtinType`: "内置功能" / "Built-in"
  - `customType`: "外部应用" / "Web App"
  - `resetDefault`: "恢复默认" / "Reset Default"
  - `resetConfirm`: "确定恢复默认应用布局吗？" / "Reset to default layout?"
  - `allHiddenPrompt`: "当前所有应用均已隐藏" / "All apps are currently hidden"
  - `openSettings`: "打开配置" / "Open Settings"

- [x] **Step 1: Write test for translation keys**

Create `tests/discoverI18n.test.ts`:
```typescript
import { zh } from '../frontend/src/i18n/locales/zh';
import { en } from '../frontend/src/i18n/locales/en';

describe('Discover I18n translations', () => {
  const requiredKeys = [
    'managePage',
    'manageTitle',
    'manageDesc',
    'moveUp',
    'moveDown',
    'builtinType',
    'customType',
    'resetDefault',
    'allHiddenPrompt',
  ];

  it('zh locale has all required discover management keys', () => {
    requiredKeys.forEach((key) => {
      expect((zh.discover as any)[key]).toBeDefined();
    });
  });

  it('en locale has all required discover management keys', () => {
    requiredKeys.forEach((key) => {
      expect((en.discover as any)[key]).toBeDefined();
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverI18n.test.ts`
Expected: FAIL

- [x] **Step 3: Update `zh.ts` and `en.ts`**

Add the keys into `discover` namespace in both locale files.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverI18n.test.ts`
Expected: PASS

- [x] **Step 5: Commit Task 2**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/discoverI18n.test.ts
git commit -m "feat(i18n): add discover hub management localization strings"
```

---

### Task 3: Discover Page Management Modal (`DiscoverConfigModal.tsx`)

**Files:**
- Create: `frontend/src/components/DiscoverConfigModal.tsx`
- Test: `tests/discoverConfigModal.test.ts`

**Interfaces:**
- Consumes:
  - `DiscoverAppItem` from `frontend/src/types/discoverApps.ts`
  - `moveDiscoverApp`, `toggleDiscoverAppVisibility`, `deleteCustomApp`, `resetDiscoverAppsToDefault` from `frontend/src/utils/discoverAppsStorage.ts`
- Produces:
  - `export const DiscoverConfigModal: React.FC<DiscoverConfigModalProps>`
  ```typescript
  export interface DiscoverConfigModalProps {
    isOpen: boolean;
    adminKey?: string;
    onClose: () => void;
    onAppsUpdated: () => void;
    onOpenAddCustomApp: () => void;
    onOpenEditCustomApp: (app: DiscoverAppItem) => void;
  }
  ```

- [x] **Step 1: Write test for DiscoverConfigModal structure**

Create `tests/discoverConfigModal.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverConfigModal Component Integrity', () => {
  const filePath = path.resolve(__dirname, '../frontend/src/components/DiscoverConfigModal.tsx');

  it('exports DiscoverConfigModal with required props and controls', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('export const DiscoverConfigModal');
    expect(content).toContain('onAppsUpdated');
    expect(content).toContain('moveDiscoverApp');
    expect(content).toContain('toggleDiscoverAppVisibility');
    expect(content).toContain('resetDiscoverAppsToDefault');
  });

  it('includes Move Up, Move Down, Toggle Switch and Action buttons', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ArrowUp');
    expect(content).toContain('ArrowDown');
    expect(content).toContain('Eye');
    expect(content).toContain('Trash2');
    expect(content).toContain('Edit3');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverConfigModal.test.ts`
Expected: FAIL

- [x] **Step 3: Implement `frontend/src/components/DiscoverConfigModal.tsx`**

Build the modal with:
1. Modal header with title, subtitle, "+ 添加应用", and close button.
2. Scrollable list of all apps sorted by order.
3. Up/Down buttons (disabled for first/last elements).
4. App icon, title, description, and "内置" / "外部应用" chip.
5. Visibility toggle button/switch.
6. Edit / Delete icons for custom apps.
7. Footer with "恢复默认" button and "完成" button.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverConfigModal.test.ts`
Expected: PASS

- [x] **Step 5: Commit Task 3**

```bash
git add frontend/src/components/DiscoverConfigModal.tsx tests/discoverConfigModal.test.ts
git commit -m "feat(discover): implement DiscoverConfigModal for page layout customization"
```

---

### Task 4: Unified DiscoverHubView Refactoring

**Files:**
- Modify: `frontend/src/components/DiscoverHubView.tsx`
- Test: `tests/discoverHubUnified.test.ts`

**Interfaces:**
- Consumes:
  - `loadDiscoverApps`, `saveOrUpdateCustomApp` from `frontend/src/utils/discoverAppsStorage.ts`
  - `DiscoverConfigModal` from `frontend/src/components/DiscoverConfigModal.tsx`
  - `CustomWebAppModal` from `frontend/src/components/CustomWebAppModal.tsx`
- Produces:
  - `export const DiscoverHubView: React.FC<DiscoverHubViewProps>`
  - Unified card rendering for both builtin and custom apps.
  - Desktop: Top "⚙ 管理页面" button + single unified card grid + dashed "+ 添加应用 / 配置" card at grid end.
  - Mobile: Clean, read-only list without edit or config buttons.

- [x] **Step 1: Write test for unified DiscoverHubView**

Create `tests/discoverHubUnified.test.ts`:
```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('DiscoverHubView Unified Architecture', () => {
  const filePath = path.resolve(__dirname, '../frontend/src/components/DiscoverHubView.tsx');

  it('uses loadDiscoverApps and imports DiscoverConfigModal', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('loadDiscoverApps');
    expect(content).toContain('DiscoverConfigModal');
    expect(content).toContain('isConfigModalOpen');
  });

  it('renders unified card grid on desktop with manage button and dashed card', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('managePage');
    expect(content).toContain('discover-app-card-');
    expect(content).toContain('dashed');
  });

  it('keeps mobile list clean without edit or config triggers', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Mobile section
    const mobileSection = content.split('md:hidden')[1].split('hidden md:block')[0];
    expect(mobileSection).not.toContain('handleOpenEditModal');
    expect(mobileSection).not.toContain('DiscoverConfigModal');
    expect(mobileSection).not.toContain('Edit3');
  });

  it('handles empty state when all apps are hidden', () => {
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('allHiddenPrompt');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/discoverHubUnified.test.ts`
Expected: FAIL

- [x] **Step 3: Refactor `frontend/src/components/DiscoverHubView.tsx`**

1. Replace separate builtin and custom app states with unified `apps = loadDiscoverApps()`.
2. Filter visible apps: `const visibleApps = apps.filter(a => a.enabled).sort((a, b) => a.order - b.order)`.
3. Render Desktop Header with "⚙ 管理页面" button (`setIsConfigModalOpen(true)`).
4. Render Desktop Unified Grid:
   - Map over `visibleApps`.
   - Dispatch to `onSelectTool(app.id)` if `app.type === 'builtin'` or `onSelectCustomApp(app)` / `window.open` if `custom`.
   - Trailing dashed card to open config modal or add app modal.
5. Render Mobile List:
   - Single WeChat-styled list for `visibleApps`.
   - Clean rows: icon, title, description, chevron. No edit pencils.
6. Mount `DiscoverConfigModal` and `CustomWebAppModal`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/discoverHubUnified.test.ts`
Expected: PASS

- [x] **Step 5: Commit Task 4**

```bash
git add frontend/src/components/DiscoverHubView.tsx tests/discoverHubUnified.test.ts
git commit -m "feat(discover): unify builtin and custom apps in DiscoverHubView with desktop page config"
```

---

### Task 5: Full Build & Regression Testing

**Files:**
- Test: All frontend tests in `tests/`
- Build: `frontend/`

- [x] **Step 1: Run frontend compilation**

Run: `npm run build:frontend`
Expected: Vite build succeeds with 0 errors.

- [x] **Step 2: Run all related Jest tests**

Run: `npx jest tests/discover*.test.ts tests/customWebApp*.test.ts --runInBand`
Expected: All tests PASS.

- [x] **Step 3: Run entire test suite to ensure zero regressions**

Run: `npm test`
Expected: All test suites PASS.

- [x] **Step 4: Commit and finalize**

```bash
git add .
git commit -m "chore: verify unified discover hub build and regression tests"
```
