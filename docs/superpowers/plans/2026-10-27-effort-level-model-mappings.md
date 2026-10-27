# Effort Level Model Mappings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Codex-style `Low / Medium / High` effort level switcher in the top header bar and per-effort model mapping configurations in the backend and `ConfigModal`.

**Architecture:** Extend `config/default.ts` and `src/types/index.ts` with `effortLevel: 'low' | 'medium' | 'high'` (default `'medium'`) and `effortModelMappings: Record<EffortLevel, ModelMappingsConfig>`, automatically syncing the active effort's mappings into `config.modelMappings` on every update so all existing proxy pipelines remain 100% compatible. Expose `effortLevel` and `effortModelMappings` via `/api/admin/status`, `/api/admin/config`, and `/api/admin/models`, render an `EffortSelector` dropdown badge next to the header title in `App.tsx`, and add per-effort mapping tabs in `ConfigModal.tsx`.

**Tech Stack:** TypeScript, Express, Jest, Supertest, React 18, Tailwind CSS, Lucide React

**Spec:** `docs/superpowers/specs/2026-10-27-effort-level-model-mappings-design.md`

## Global Constraints

- Valid effort levels are strictly `'low' | 'medium' | 'high'`, defaulting to `'medium'`.
- Zero Static Config Caching: always read `config.effortLevel`, `config.effortModelMappings`, and `config.modelMappings` dynamically.
- Backward Compatibility: `config.modelMappings` must always reflect `config.effortModelMappings[config.effortLevel]`; updating `modelMappings` alone (legacy API callers/tests) must also update `config.effortModelMappings[config.effortLevel]`.
- Upgrade Migration: when `effortModelMappings` is absent from `runtime.json` or `.env`, initialize all three levels (`low`, `medium`, `high`) with deep clones of the existing `modelMappings`.

## Review Focus

- Invalid `effortLevel` values in `updateConfig` (e.g., `'ultra'`, `null`, `123`) must safely fall back to the current valid `effortLevel` (or `'medium'`) without throwing or corrupting `modelMappings`.
- Partial `effortModelMappings` objects in `updateConfig` (e.g., only `{ high: { ... } }` provided) must preserve existing mappings for the omitted levels (`low`, `medium`).
- Legacy callers sending `{ modelMappings: { a: 'b' } }` without `effortModelMappings` must update both `config.modelMappings` and `config.effortModelMappings[config.effortLevel]`, so subsequent `effortLevel` switches do not lose that update.
- Reference isolation between levels: mutating one level's mapping object must never mutate another level's mapping object (deep clone on initialization and sync).
- `ConfigModal` JSON validation across all 3 effort levels: invalid JSON in an inactive effort tab must still be caught on save with a clear alert identifying which level has invalid JSON.

---

### Task 1: Backend Types, Config Sync & Admin API Support

**Files:**
- Modify: `src/types/index.ts:125-137`
- Modify: `config/default.ts:1-635`
- Modify: `src/admin/controllers/adminController.ts:8-140`
- Test: `tests/effortConfig.test.ts`

**Interfaces:**
- Produces in `src/types/index.ts`:
  ```ts
  export type EffortLevel = 'low' | 'medium' | 'high';
  export type EffortModelMappings = Record<EffortLevel, ModelMappingsConfig>;
  ```
- Produces in `config/default.ts`:
  ```ts
  export const VALID_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high'];
  export function normalizeEffortLevel(raw: any, fallback?: EffortLevel): EffortLevel;
  export function normalizeEffortModelMappings(raw: any, fallbackMappings?: ModelMappingsConfig, baseEffortMappings?: EffortModelMappings): EffortModelMappings;
  // on config object:
  effortLevel: EffortLevel;
  effortModelMappings: EffortModelMappings;
  ```
- Produces in `/api/admin/status` & `/api/admin/config` response `config`:
  `effortLevel: EffortLevel`, `effortModelMappings: EffortModelMappings`
- Produces in `/api/admin/models` response:
  `mappings: ModelMappingsConfig`, `effortLevel: EffortLevel`, `effortModelMappings: EffortModelMappings`

- [x] **Step 1: Write the failing test in `tests/effortConfig.test.ts`**

```ts
import request from 'supertest';
import express from 'express';
import adminRoutes from '../src/admin/routes/adminRoutes';
import config, { updateConfig } from '../config/default';
import claudeTranslator from '../src/proxy/services/claudeTranslator';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Effort Level Model Mappings Configuration', () => {
  beforeEach(async () => {
    config.adminSecretKey = '';
    await updateConfig({}, { resetToEnv: true });
  });

  afterAll(async () => {
    await updateConfig({}, { resetToEnv: true });
  });

  test('initializes effortLevel to medium and populates low/medium/high in effortModelMappings', async () => {
    const res = await request(app).get('/api/admin/status');
    expect(res.status).toBe(200);
    expect(res.body.config.effortLevel).toBe('medium');
    expect(res.body.config.effortModelMappings).toBeDefined();
    expect(res.body.config.effortModelMappings).toHaveProperty('low');
    expect(res.body.config.effortModelMappings).toHaveProperty('medium');
    expect(res.body.config.effortModelMappings).toHaveProperty('high');
  });

  test('switches effortLevel and syncs config.modelMappings and translator resolution', async () => {
    const effortMappings = {
      low: { 'claude-sonnet': 'gemini-2.5-flash' },
      medium: { 'claude-sonnet': 'gemini-2.5-pro' },
      high: { 'claude-sonnet': 'gemini-2.5-pro-high' }
    };

    const saveRes = await request(app)
      .post('/api/admin/config')
      .send({
        effortLevel: 'medium',
        effortModelMappings: effortMappings
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.config.effortLevel).toBe('medium');
    expect(saveRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-pro' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-pro');

    // Switch to high via effortLevel only
    const highRes = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'high' });

    expect(highRes.status).toBe(200);
    expect(highRes.body.config.effortLevel).toBe('high');
    expect(highRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-pro-high' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-pro-high');

    // Switch to low via effortLevel only
    const lowRes = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'low' });

    expect(lowRes.status).toBe(200);
    expect(lowRes.body.config.effortLevel).toBe('low');
    expect(lowRes.body.config.modelMappings).toEqual({ 'claude-sonnet': 'gemini-2.5-flash' });
    expect(claudeTranslator.getCleanModelName('claude-sonnet')).toBe('gemini-2.5-flash');
  });

  test('ignores invalid effortLevel and preserves current valid level', async () => {
    await updateConfig({
      effortLevel: 'high',
      effortModelMappings: {
        low: { m: 'low-m' },
        medium: { m: 'med-m' },
        high: { m: 'high-m' }
      }
    });

    const res = await request(app)
      .post('/api/admin/config')
      .send({ effortLevel: 'invalid-level' });

    expect(res.status).toBe(200);
    expect(res.body.config.effortLevel).toBe('high');
    expect(res.body.config.modelMappings).toEqual({ m: 'high-m' });
  });

  test('legacy update with only modelMappings updates active effort level mapping and preserves others', async () => {
    await updateConfig({
      effortLevel: 'medium',
      effortModelMappings: {
        low: { m: 'low-m' },
        medium: { m: 'med-m' },
        high: { m: 'high-m' }
      }
    });

    const res = await request(app)
      .post('/api/admin/config')
      .send({ modelMappings: { m: 'med-updated' } });

    expect(res.status).toBe(200);
    expect(res.body.config.modelMappings).toEqual({ m: 'med-updated' });
    expect(res.body.config.effortModelMappings.medium).toEqual({ m: 'med-updated' });
    expect(res.body.config.effortModelMappings.low).toEqual({ m: 'low-m' });
    expect(res.body.config.effortModelMappings.high).toEqual({ m: 'high-m' });
  });

  test('partial effortModelMappings update preserves omitted levels', async () => {
    await updateConfig({
      effortLevel: 'low',
      effortModelMappings: {
        low: { m: 'low-1' },
        medium: { m: 'med-1' },
        high: { m: 'high-1' }
      }
    });

    await updateConfig({
      effortModelMappings: {
        high: { m: 'high-2' }
      } as any
    });

    expect(config.effortModelMappings.low).toEqual({ m: 'low-1' });
    expect(config.effortModelMappings.medium).toEqual({ m: 'med-1' });
    expect(config.effortModelMappings.high).toEqual({ m: 'high-2' });
    expect(config.modelMappings).toEqual({ m: 'low-1' });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/effortConfig.test.ts --runInBand`
Expected: FAIL because `effortLevel` and `effortModelMappings` are undefined on `res.body.config`.

- [x] **Step 3: Implement types, config synchronization, and controller fields**

1. In `src/types/index.ts`, export `EffortLevel = 'low' | 'medium' | 'high'` and `EffortModelMappings = Record<EffortLevel, ModelMappingsConfig>`.
2. In `config/default.ts`:
   - Import `EffortLevel, EffortModelMappings` from `../src/types`.
   - Implement `VALID_EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high']`, `normalizeEffortLevel(raw: any, fallback: EffortLevel = 'medium'): EffortLevel`, and `normalizeEffortModelMappings(raw: any, fallbackMappings: ModelMappingsConfig = {}, baseEffortMappings?: EffortModelMappings): EffortModelMappings` using `JSON.parse(JSON.stringify(...))` so levels never share object references.
   - In `getEnvConfig()` and `config` initialization:
     - Determine `effortLevel` via `normalizeEffortLevel(runtimeOverrides.effortLevel ?? process.env.EFFORT_LEVEL, 'medium')`.
     - Determine `baseMappings` from `runtimeOverrides.modelMappings ?? parsedModelMappings`.
     - Determine `effortModelMappings` via `normalizeEffortModelMappings(runtimeOverrides.effortModelMappings, baseMappings)`.
     - Set `modelMappings` to a deep clone of `effortModelMappings[effortLevel]`.
   - In `updateConfig(partialConfig, options)`:
     - On `resetToEnv`: reset `config` from `getEnvConfig()` so `effortLevel`, `effortModelMappings`, and `modelMappings` reset cleanly.
     - Otherwise:
       - Resolve `currentLevel = normalizeEffortLevel(config.effortLevel, 'medium')`.
       - Resolve `nextLevel = partialConfig.effortLevel !== undefined ? normalizeEffortLevel(partialConfig.effortLevel, currentLevel) : currentLevel`.
       - Start from `currentEffortMappings = normalizeEffortModelMappings(config.effortModelMappings, config.modelMappings)`.
       - If `partialConfig.effortModelMappings !== undefined`, merge via `nextEffortMappings = normalizeEffortModelMappings(partialConfig.effortModelMappings, config.modelMappings, currentEffortMappings)`.
       - Else if `partialConfig.modelMappings !== undefined` (legacy update without `effortModelMappings`), clone `currentEffortMappings` and set `nextEffortMappings[nextLevel] = JSON.parse(JSON.stringify(partialConfig.modelMappings))`.
       - If any of `effortLevel`, `effortModelMappings`, or `modelMappings` was in `partialConfig`, set:
         - `partialConfig.effortLevel = nextLevel`
         - `partialConfig.effortModelMappings = nextEffortMappings`
         - `partialConfig.modelMappings = JSON.parse(JSON.stringify(nextEffortMappings[nextLevel]))`
3. In `src/admin/controllers/adminController.ts`:
   - Include `effortLevel: config.effortLevel` and `effortModelMappings: config.effortModelMappings` in `getStatus`, `getModels`, and `updateConfig` responses.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/effortConfig.test.ts tests/adminController.test.ts --runInBand`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add src/types/index.ts config/default.ts src/admin/controllers/adminController.ts tests/effortConfig.test.ts
git commit -m "feat(config): support effortLevel and effortModelMappings with live sync"
```

---

### Task 2: i18n Translations & Header `EffortSelector` Component

**Files:**
- Modify: `frontend/src/i18n/locales/en.ts:395-528`
- Modify: `frontend/src/i18n/locales/zh.ts:397-530`
- Create: `frontend/src/components/EffortSelector.tsx`
- Modify: `frontend/src/App.tsx:95-245,660-690,934-945`

**Interfaces:**
- Produces `frontend/src/components/EffortSelector.tsx`:
  ```tsx
  export type EffortLevel = 'low' | 'medium' | 'high';
  export type EffortModelMappings = Record<EffortLevel, Record<string, any>>;

  export interface EffortSelectorProps {
    effortLevel: EffortLevel;
    effortModelMappings?: EffortModelMappings;
    disabled?: boolean;
    onSelectEffort: (level: EffortLevel) => Promise<void> | void;
    onOpenMappingsConfig: () => void;
  }
  ```

- [x] **Step 1: Add i18n keys to `frontend/src/i18n/locales/en.ts` and `frontend/src/i18n/locales/zh.ts`**

Add `effort` section to both locale files:
- `en.ts`:
  ```ts
  effort: {
    title: "Reasoning Effort & Model Routing",
    label: "Effort",
    low: "Low",
    medium: "Medium",
    high: "High",
    lowShort: "Low",
    mediumShort: "Med",
    highShort: "High",
    lowDesc: "Fast & lightweight model routing",
    mediumDesc: "Balanced standard model routing",
    highDesc: "Deep reasoning & high-capacity routing",
    rulesCount: "{count} rules",
    activeBadge: "Active",
    setActive: "Set as Active Effort",
    isCurrentlyActive: "Currently Active Effort",
    copyFrom: "Copy rules from...",
    copyFromLevel: "Copy from {level}",
    configureMappings: "Configure Effort Mappings...",
    invalidJsonInLevel: "Invalid JSON in [{level}] effort mappings: "
  }
  ```
- `zh.ts`:
  ```ts
  effort: {
    title: "Effort 档位与模型路由",
    label: "档位",
    low: "Low",
    medium: "Medium",
    high: "High",
    lowShort: "Low",
    mediumShort: "Med",
    highShort: "High",
    lowDesc: "轻量极速模型映射方案",
    mediumDesc: "标准均衡模型映射方案",
    highDesc: "深度思考与高阶模型映射方案",
    rulesCount: "{count} 规则",
    activeBadge: "当前生效",
    setActive: "设为当前生效档位",
    isCurrentlyActive: "当前全局生效档位",
    copyFrom: "从其他档位复制...",
    copyFromLevel: "从 {level} 复制规则",
    configureMappings: "配置各档位映射规则...",
    invalidJsonInLevel: "[{level}] 档位的模型映射 JSON 格式错误: "
  }
  ```

- [x] **Step 2: Create `frontend/src/components/EffortSelector.tsx`**

Implement `EffortSelector` with:
- A compact Codex-style pill trigger button next to the header title displaying:
  - 3-bar signal strength indicator (`1` bar lit for `low` in emerald, `2` bars lit for `medium` in indigo, `3` bars lit + `Zap` icon for `high` in amber).
  - Current level label (`Low` / `Medium` / `High` on desktop, `Low` / `Med` / `High` on mobile).
  - `ChevronDown` icon that rotates when open.
- Outside-click and `Escape` key handler to close the dropdown menu.
- Dropdown popover listing `'low'`, `'medium'`, `'high'` options:
  - Shows signal bars, level title, description (`t('effort.lowDesc')`, etc.), rule count badge (`Object.keys(effortModelMappings?.[level] || {}).length`), and a `Check` icon on the active level.
  - Clicking an option invokes `onSelectEffort(level)` and closes the popover.
- Footer button in dropdown: `Settings` / `ArrowRightLeft` icon + `t('effort.configureMappings')` calling `onOpenMappingsConfig()`.

- [x] **Step 3: Integrate `EffortSelector` in `frontend/src/App.tsx`**

1. Add state in `App.tsx`:
   - `const [effortLevel, setEffortLevel] = useState<EffortLevel>('medium');`
   - `const [effortModelMappings, setEffortModelMappings] = useState<EffortModelMappings | undefined>(undefined);`
   - `const [configModalInitialTab, setConfigModalInitialTab] = useState<'general' | 'upstream' | 'instructions' | 'mappings' | 'security' | undefined>(undefined);`
2. Extract helper `syncEffortStateFromConfig(cfg: any)` in `App.tsx` and call it in `verifyAuth`, `handleRefresh`, and `ConfigModal.onSaved` (fetching `/api/admin/status` or reading returned config) to keep `effortLevel` and `effortModelMappings` in sync.
3. Implement `handleSelectEffort(nextLevel: EffortLevel)`:
   - Optimistically update `effortLevel` to `nextLevel`, POST `{ effortLevel: nextLevel }` to `/api/admin/config` with `x-admin-key`, update state from response `data.config`, and increment `refreshTrigger`. Revert `effortLevel` on error.
4. Render `<EffortSelector />` in the `<header>` right next to the breadcrumb title (`frontend/src/App.tsx:663-687`).

- [x] **Step 4: Build frontend to verify TypeScript compilation**

Run: `npm run build:frontend`
Expected: PASS with zero TypeScript or Vite bundling errors (`ConfigModal` `initialTab` prop will be wired in Task 3).

---

### Task 3: Per-Effort Model Mappings Workbench in `ConfigModal`

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx:80-115,187-405,460-740,1741-1930`

**Interfaces:**
- Consumes `EffortLevel` and `EffortModelMappings` from `./EffortSelector`.
- Extends `ConfigModalProps`:
  ```ts
  interface ConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    adminKey: string;
    initialTab?: TabType;
    onSaved?: () => void;
  }
  ```

- [x] **Step 1: Update `ConfigModal.tsx` state and data conversion helpers for 3 effort levels**

1. Accept `initialTab` in `ConfigModalProps`; when `isOpen` becomes `true` and `initialTab` is provided, switch `activeTab` to `initialTab`.
2. Add pure helper functions inside `ConfigModal.tsx`:
   - `parseMappingsObjectToEntries(mappings: Record<string, any>): MappingEntry[]`
   - `serializeEntriesToMappingsObject(entries: MappingEntry[]): Record<string, any>`
3. Replace single-level mapping state with per-effort state:
   - `activeEffortLevel: EffortLevel` (the globally active effort level to save)
   - `editingEffortTab: EffortLevel` (which effort tab is currently being edited in the Mappings view, initialized to `activeEffortLevel`)
   - `effortMappingEntries: Record<EffortLevel, MappingEntry[]>`
   - `effortMappingsRaw: Record<EffortLevel, string>`
4. Update `ConfigSnapshot` to store:
   - `effortLevel: EffortLevel`
   - `effortMappingsRaw: Record<EffortLevel, string>`
5. In `fetchConfig()`:
   - Read `lvl = data.config.effortLevel || 'medium'` and `rawEffortMappings = data.config.effortModelMappings`.
   - Populate `activeEffortLevel`, `editingEffortTab`, `effortMappingEntries`, `effortMappingsRaw`, and `initialConfigRef.current`.
6. Update `handleAddMapping`, `handleRemoveMapping`, `handleEntryChange`, `handleToggleHigh`, and `handleRawJsonChange` so they operate on the currently selected `editingEffortTab` within `effortMappingEntries` and `effortMappingsRaw`.
7. Add `handleCopyFromEffort(sourceLevel: EffortLevel)` to copy entries and raw JSON from `sourceLevel` into `editingEffortTab`.

- [x] **Step 2: Render Effort Level Switcher Bar & Actions inside `activeTab === 'mappings'`**

In `frontend/src/components/ConfigModal.tsx` (inside the `activeTab === 'mappings'` card):
- Render a 3-tab pill bar for `Low`, `Medium`, `High`:
  - Shows signal strength bars, level name, rule count badge `(effortMappingEntries[lvl].length)`, and an `Active / 当前生效` emerald/amber dot badge on `lvl === activeEffortLevel`.
  - Clicking a tab sets `editingEffortTab(lvl)`.
- Below the tab bar, render a compact toolbar for the currently selected `editingEffortTab`:
  - Left: status/button to set `editingEffortTab` as the active effort level (`activeEffortLevel === editingEffortTab` shows a green `✓ 当前全局生效档位` badge; otherwise shows a button `设为当前生效档位` that sets `setActiveEffortLevel(editingEffortTab)`).
  - Right: quick copy buttons (`Copy from Low / Med / High` for the other two levels) so users can clone rules with one click.
- Update the sidebar `mappings` rule count badge to show `effortMappingEntries[activeEffortLevel].length`.

- [x] **Step 3: Update Save, Revert, and Dirty Check logic in `ConfigModal.tsx`**

1. In `handleSave`:
   - Validate JSON syntax for all three levels (`low`, `medium`, `high`) in `effortMappingsRaw`. If any level fails `JSON.parse`, alert `${t('effort.invalidJsonInLevel', { level: lvl.toUpperCase() })}${err.message}`, switch `editingEffortTab` to that level, and abort save.
   - Send `effortLevel: activeEffortLevel`, `effortModelMappings: parsedEffortMappings`, and `modelMappings: parsedEffortMappings[activeEffortLevel]` in `POST /api/admin/config`.
2. In `handleRevertChanges` and `isDirty` / `tabDirtyMap.mappings`:
   - Compare `activeEffortLevel !== snap.effortLevel` and each level's `effortMappingsRaw[lvl].trim() !== snap.effortMappingsRaw[lvl].trim()`.

- [x] **Step 4: Run full build and test suite**

Run: `npm run build && npx jest --runInBand`
Expected: Both frontend and backend compile cleanly and all Jest test suites pass.

- [x] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/zh.ts frontend/src/components/EffortSelector.tsx frontend/src/App.tsx frontend/src/components/ConfigModal.tsx
git commit -m "feat(ui): add header EffortSelector and per-effort model mappings in ConfigModal"
```
