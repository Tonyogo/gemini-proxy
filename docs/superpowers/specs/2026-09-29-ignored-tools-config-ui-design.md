# Admin Config UI: Ignored Tools Configuration Spec

**Date:** 2026-09-29
**Status:** Approved

## 1. Goal
Provide a Tag-based interactive editor in the Admin Web Console configuration modal (`ConfigModal.tsx`) allowing administrators to view, add, remove, and reset `IGNORED_TOOLS` live, with seamless backend persistence and zero-downtime hot reloading.

## 2. Architecture & Requirements

### 2.1 Backend Integration (`src/admin/controllers/adminController.ts`)
- **GET `/api/admin/status`**:
  - Expose `ignoredTools: config.ignoredTools` in the returned `config` object.
- **POST `/api/admin/config`**:
  - Accept `ignoredTools` from `req.body`.
  - Normalize incoming `ignoredTools` (support string array or comma/newline-delimited string, trimming whitespace and filtering empty strings).
  - Return updated `ignoredTools` in the response `config` object.

### 2.2 Frontend UI Integration (`frontend/src/components/ConfigModal.tsx`)
- **State Management**:
  - `ignoredTools: string[]` (defaults to empty array or populated from API `/api/admin/status`).
  - `toolInputText: string` (buffer for new tool names currently being typed).
- **Tab 3 ("系统指令与规则" / `instructions`) UI Component**:
  - Render an interactive Tag Badge editor card:
    - **Header**: Title `IGNORED_TOOLS` (`t('config.ignoredToolsTitle')`), description (`t('config.ignoredToolsDesc')`), and header action buttons:
      - "恢复默认" (`t('config.ignoredToolsResetDefault')`): Resets tags to `DEFAULT_IGNORED_TOOLS` (`['Artifact', 'ArtifactCheck', 'ArtifactData', 'ArtifactComments']`).
      - "清空" (`t('config.ignoredToolsClear')`): Clears all tags to empty `[]`.
    - **Tag Container**:
      - Renders pills for each tool name with a clickable remove (`×`) button.
      - If empty, displays placeholder guidance text indicating all tools will pass through.
    - **Add Input Bar**:
      - Text input with placeholder (`t('config.ignoredToolsPlaceholder')`).
      - Pressing `Enter` or clicking `+ 添加` button adds the trimmed tool name (avoiding duplicates).
- **Persistence & Synchronization**:
  - `fetchConfig`: Load `data.config.ignoredTools` (array) into state.
  - `handleSave`: Include `ignoredTools` in the payload sent to `/api/admin/config`.

### 2.3 Internationalization (`frontend/src/i18n/locales/`)
- Add required localized strings in `zh.ts` and `en.ts`:
  - `ignoredToolsTitle`: "IGNORED_TOOLS (忽略特殊工具)"
  - `ignoredToolsDesc`: "过滤发往 Gemini ��游的特殊工具声明（如 Artifact 内部工具），防止生成无法执行的工具调用并节省 Prompt Token。"
  - `ignoredToolsPlaceholder`: "输入工具名称（如 Artifact），按回车或点击添加..."
  - `ignoredToolsAdd`: "添加"
  - `ignoredToolsResetDefault`: "填入默认"
  - `ignoredToolsClear`: "清空"
  - `ignoredToolsEmpty`: "未配置任何忽略工具，所有工具声明都将透传至 Gemini 上游。"

### 2.4 Testing & Verification
- Unit test in `tests/adminController.test.ts` verifying GET `/api/admin/status` and POST `/api/admin/config` read and update `ignoredTools`.
- Integration test in `tests/configModalIgnoredTools.test.ts` verifying `ConfigModal.tsx` and i18n locales wire up `ignoredTools`.
- Run frontend build `npm run build:frontend` and test suite `npm test` to guarantee complete integrity.
