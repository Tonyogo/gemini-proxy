# Admin Config UI: Ignored Tools Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an interactive Tag Badge editor in the Admin Web Console configuration modal allowing administrators to view, add, remove, and reset `IGNORED_TOOLS` live, with full backend persistence and dynamic hot reloading.

**Architecture:** Extend backend `adminController` to expose and persist `ignoredTools` through `/api/admin/status` and `/api/admin/config`. Implement a Tag-based editor component inside `ConfigModal.tsx` in Tab 3 ("系统指令与规则" / `instructions`), with actions to add, remove, load defaults, and clear tools, backed by internationalized string assets in `zh.ts` and `en.ts`.

**Tech Stack:** TypeScript, Node.js, Express, React, Tailwind CSS, Lucide React, Jest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-29-ignored-tools-config-ui-design.md`

## Global Constraints

- Zero Static Config Caching: do not cache `config` properties at module top level, always access `config.ignoredTools` dynamically.
- `updateConfig` in `src/admin/controllers/adminController.ts` must safely sanitize/normalize incoming `ignoredTools` (support arrays and comma/newline strings, trim whitespace, deduplicate).
- Maintain strict TypeScript type checks and preserve code style across both backend and frontend.

## Review Focus

- Empty tools array `[]`: ensure saving an empty array correctly clears ignored tools so all tools pass through to Gemini.
- Duplicate and whitespace entries: ensure trimming and deduplication when users input tool names or paste comma-separated strings.
- Reset to default: ensure clicking "填入默认" restores the 4 default tools (`['Artifact', 'ArtifactCheck', 'ArtifactData', 'ArtifactComments']`).
- Reset to ENV: ensure backend `/api/admin/config` resetToEnv restores the environment default.
- Responsiveness and styling: ensure Tag badges wrap cleanly on mobile viewports and match the theme aesthetic.

---

### Task 1: Backend Controller Integration & Unit Tests

**Files:**
- Modify: `src/admin/controllers/adminController.ts:12-32, 82-115`
- Test: `tests/adminController.test.ts`

**Interfaces:**
- Consumes: `config.ignoredTools` and `updateConfig` from `config/default.ts`.
- Produces: `ignoredTools: string[]` in GET `/api/admin/status` and POST `/api/admin/config` responses.

- [ ] **Step 1: Write the failing tests in `tests/adminController.test.ts`**

Add tests to verify:
1. `GET /api/admin/status` returns `ignoredTools` array.
2. `POST /api/admin/config` updates `ignoredTools` with custom tools.
3. `POST /api/admin/config` handles comma-separated string or array and trims/deduplicates.

```typescript
test('GET /api/admin/status returns ignoredTools in config', async () => {
  const res = await request(app).get('/api/admin/status');
  expect(res.status).toBe(200);
  expect(res.body.config).toHaveProperty('ignoredTools');
  expect(Array.isArray(res.body.config.ignoredTools)).toBe(true);
});

test('POST /api/admin/config updates ignoredTools', async () => {
  const customTools = ['CustomToolA', 'CustomToolB'];
  const updateRes = await request(app)
    .post('/api/admin/config')
    .send({ ignoredTools: customTools });
  expect(updateRes.status).toBe(200);
  expect(updateRes.body.config.ignoredTools).toEqual(customTools);

  // Revert back to default
  await updateConfig({
    ignoredTools: ['Artifact', 'ArtifactCheck', 'ArtifactData', 'ArtifactComments']
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/adminController.test.ts -t "ignoredTools"`
Expected: FAIL with missing property `ignoredTools` in `res.body.config`.

- [ ] **Step 3: Implement `ignoredTools` in `adminController.ts`**

In `src/admin/controllers/adminController.ts`:
1. In `getStatus`, add `ignoredTools: config.ignoredTools` under `res.json({ config: { ... } })`.
2. In `updateConfig`:
   - If `newConfig.ignoredTools !== undefined`, normalize:
     ```typescript
     if (typeof newConfig.ignoredTools === 'string') {
       newConfig.ignoredTools = newConfig.ignoredTools
         .split(/[,\n]/)
         .map((s: string) => s.trim())
         .filter(Boolean);
     } else if (Array.isArray(newConfig.ignoredTools)) {
       newConfig.ignoredTools = Array.from(new Set(
         newConfig.ignoredTools.map((s: any) => String(s).trim()).filter(Boolean)
       ));
     }
     ```
   - In the response json `config` object, include `ignoredTools: config.ignoredTools`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/adminController.test.ts -t "ignoredTools"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/admin/controllers/adminController.ts tests/adminController.test.ts
git commit -m "feat(admin): expose and update ignoredTools in adminController"
```

---

### Task 2: Internationalization Locales

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`
- Test: `tests/configModalIgnoredTools.test.ts`

**Interfaces:**
- Consumes: None
- Produces: i18n keys under `config.*`: `ignoredToolsTitle`, `ignoredToolsDesc`, `ignoredToolsPlaceholder`, `ignoredToolsAdd`, `ignoredToolsResetDefault`, `ignoredToolsClear`, `ignoredToolsEmpty`.

- [ ] **Step 1: Write integration assertions for i18n keys in `tests/configModalIgnoredTools.test.ts`**

Create `tests/configModalIgnoredTools.test.ts` checking:
1. `zh.ts` defines all `ignoredTools*` keys.
2. `en.ts` defines all `ignoredTools*` keys.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalIgnoredTools.test.ts`
Expected: FAIL with missing keys in `zhContent` / `enContent`.

- [ ] **Step 3: Add locale keys in `frontend/src/i18n/locales/zh.ts` and `en.ts`**

In `frontend/src/i18n/locales/zh.ts` under `config`:
```typescript
ignoredToolsTitle: "IGNORED_TOOLS (过滤特殊工具)",
ignoredToolsDesc: "在转发给 Gemini 上游前过滤不需要的工具定义（如 Artifact 内部工具），防止生成不可执行的工具调用并节省 Token。",
ignoredToolsPlaceholder: "输入工具名称（如 Artifact），回车或点击添加...",
ignoredToolsAdd: "添加",
ignoredToolsResetDefault: "填入默认",
ignoredToolsClear: "清空",
ignoredToolsEmpty: "未配置任何忽略工具，所有客户端工具声明将透传至 Gemini 上游。",
```

In `frontend/src/i18n/locales/en.ts` under `config`:
```typescript
ignoredToolsTitle: "IGNORED_TOOLS",
ignoredToolsDesc: "Filter out unwanted tool declarations (such as Claude Artifact internal tools) before forwarding to upstream Gemini, preventing unusable tool calls and saving tokens.",
ignoredToolsPlaceholder: "Enter tool name (e.g. Artifact), press Enter or Add...",
ignoredToolsAdd: "Add",
ignoredToolsResetDefault: "Load Defaults",
ignoredToolsClear: "Clear All",
ignoredToolsEmpty: "No ignored tools configured. All client tool declarations will be passed through to upstream Gemini.",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/configModalIgnoredTools.test.ts`
Expected: PASS for locale assertions.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts tests/configModalIgnoredTools.test.ts
git commit -m "feat(i18n): add ignoredTools localization keys"
```

---

### Task 3: Frontend Tag Editor Component in ConfigModal

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Test: `tests/configModalIgnoredTools.test.ts`

**Interfaces:**
- Consumes: `t()` from `LanguageContext`, `data.config.ignoredTools` from `/api/admin/status`.
- Produces: Tag-based UI in Tab 3 ("instructions"), sending `ignoredTools: string[]` in POST `/api/admin/config`.

- [ ] **Step 1: Write integration test assertions for `ConfigModal.tsx` in `tests/configModalIgnoredTools.test.ts`**

Add tests verifying that `ConfigModal.tsx`:
1. Defines `ignoredTools` state initialized/fetched from `data.config.ignoredTools`.
2. Includes `ignoredTools` in the save payload.
3. Renders the Tag editor with `t('config.ignoredToolsTitle')`, "填入默认", "清空", and remove tag handler.
4. Renders input bar with add button and Enter key trigger.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/configModalIgnoredTools.test.ts`
Expected: FAIL due to missing `ignoredTools` state and JSX in `ConfigModal.tsx`.

- [ ] **Step 3: Implement Tag editor in `frontend/src/components/ConfigModal.tsx`**

1. Define constant:
   ```typescript
   const DEFAULT_IGNORED_TOOLS = [
     'Artifact',
     'ArtifactCheck',
     'ArtifactData',
     'ArtifactComments'
   ];
   ```
2. Add states:
   ```typescript
   const [ignoredTools, setIgnoredTools] = useState<string[]>(DEFAULT_IGNORED_TOOLS);
   const [toolInputText, setToolInputText] = useState<string>('');
   ```
3. In `fetchConfig`:
   ```typescript
   if (Array.isArray(data.config.ignoredTools)) {
     setIgnoredTools(data.config.ignoredTools);
   } else {
     setIgnoredTools(DEFAULT_IGNORED_TOOLS);
   }
   ```
4. In `handleSave`:
   ```typescript
   body: JSON.stringify({
     ...
     ignoredTools,
   })
   ```
5. Helper functions:
   ```typescript
   const handleAddTool = () => {
     const trimmed = toolInputText.trim();
     if (!trimmed) return;
     // Support comma-separated batch adding
     const parts = trimmed.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
     const next = Array.from(new Set([...ignoredTools, ...parts]));
     setIgnoredTools(next);
     setToolInputText('');
   };

   const handleRemoveTool = (toolToRemove: string) => {
     setIgnoredTools(ignoredTools.filter(t => t.toLowerCase() !== toolToRemove.toLowerCase()));
   };

   const handleResetDefaultTools = () => {
     setIgnoredTools([...DEFAULT_IGNORED_TOOLS]);
   };

   const handleClearTools = () => {
     setIgnoredTools([]);
   };
   ```
6. In Tab 3 (`activeTab === 'instructions'`), add the Tag Editor card below `STRIP_SYSTEM_FINGERPRINTS`:
   - Header with Title and "填入默认" (`RotateCcw` or `Sparkles` icon) & "清空" (`Trash2` icon) buttons.
   - Tag Pills section:
     - When `ignoredTools.length > 0`: flex container with pills styled with subtle purple/indigo theme, showing tool name and a small remove `X` icon.
     - When `ignoredTools.length === 0`: render muted text stating all tools pass through.
   - Input bar:
     - Input field with `toolInputText`, `onKeyDown` on Enter calling `handleAddTool`.
     - `+ 添加` button calling `handleAddTool`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/configModalIgnoredTools.test.ts`
Expected: PASS

- [ ] **Step 5: Verify frontend compilation**

Run: `npm run build:frontend`
Expected: Exit code 0, no TypeScript or JSX compilation errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ConfigModal.tsx tests/configModalIgnoredTools.test.ts
git commit -m "feat(ui): add ignoredTools tag editor in ConfigModal"
```

---

### Task 4: Complete System Validation & Regression Testing

**Files:**
- Test: All tests in `tests/`
- Build: Full build verification

**Interfaces:**
- Consumes: Complete codebase
- Produces: Green test suite & production bundle

- [ ] **Step 1: Run all unit and integration tests**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 2: Run full build**

Run: `npm run build`
Expected: Both frontend and backend compile successfully.

- [ ] **Step 3: Verify git status is clean**

Run: `git status`
Expected: Working tree clean or ready for final commit.
