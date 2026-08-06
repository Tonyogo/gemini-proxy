# Design Spec: Config Modal UI & Interaction Optimization

## Overview
This specification details the optimization of the Config Modal (`ConfigModal.tsx`) in the Admin Console. The goal is to transform the flat, unstructured list of inputs into organized section cards with an intuitive Key-Value editor for `MODEL_MAPPINGS` (with automatic bidirectional sync to a JSON fallback editor), improved input validation, tooltips, and complete bilingual internationalization (i18n).

---

## Architecture & Layout Changes

### 1. Categorized Section Cards (`ConfigModal.tsx`)
The modal form will be organized into 3 logical visual groups using cards with distinct background styling and icons:

1. **📦 System & Log Policies (`sysLogs`)**
   - `LOG_LEVEL`: Select dropdown (`error`, `warn`, `info`, `debug`) with descriptive context.
   - `LOG_RETENTION_DAYS`: Numeric input with helper text indicating `0 = disable auto-deletion`.
   - `UPSTREAM_TIMEOUT_MS`: Numeric input with boundaries validation (3000ms - 600000ms).

2. **🔄 Translation & Context Rules (`translationContext`)**
   - `SYSTEM_ROLE_TO_INSTRUCTION`: Toggle switch for converting inline system role messages to upstream `systemInstruction`.
   - `RUNTIME_CONTEXT_TAG`: Text input for system prompt wrapper tag name.
   - `COUNT_TOKENS_MODEL`: Text input for override count tokens model name.
   - `CUSTOM_SYSTEM_INSTRUCTION`: Textarea for custom system instructions injected upstream.

3. **🔀 Model Mappings (`modelMappings`)**
   - **Visual Key-Value List Editor (Default Mode):**
     - Table / List rendering `{ source: string, target: string }[]`.
     - Inputs for "Incoming Model" (Source) and "Gemini Upstream Model" (Target).
     - Trash icon button (`🗑️`) to remove a rule.
     - Add button (`+ Add Mapping Rule`) to append a new pair.
   - **Advanced JSON Mode Toggle (`Toggle Advanced JSON`):**
     - Collapsible textarea with JSON formatted string.
     - Real-time bidirectional synchronization: updating KV list updates JSON text, and editing JSON text updates KV list (with graceful JSON parse validation error feedback).

---

## Component State & Data Sync

### State Design
```typescript
interface MappingEntry {
  id: string;
  source: string;
  target: string;
}

// Inside ConfigModal.tsx:
const [mappingEntries, setMappingEntries] = useState<MappingEntry[]>([]);
const [showAdvancedJson, setShowAdvancedJson] = useState<boolean>(false);
```

### Sync Logic
- On initial fetch (`/api/admin/status`): Convert `data.config.modelMappings` object (e.g. `{ "a": "b" }`) into `MappingEntry[]` array with unique IDs. Also set `modelMappingsRaw`.
- When modifying KV list: Update `mappingEntries` and auto-serialize to `modelMappingsRaw = JSON.stringify(...)`.
- When modifying Advanced JSON textarea: Update `modelMappingsRaw` and attempt `JSON.parse`. If valid JSON object, update `mappingEntries`. If invalid, show inline syntax error badge without breaking the KV list.
- On Save submit: Construct clean object payload from `mappingEntries` (filtering out empty keys) or validated `modelMappingsRaw`.

---

## Internationalization (i18n) Updates

Add translations to `frontend/src/i18n/locales/zh.ts` and `frontend/src/i18n/locales/en.ts`:

- Group titles (`sysLogsTitle`, `translationTitle`, `modelMappingsGroupTitle`)
- Field labels and helper tooltips
- Button labels (`addMapping`, `toggleJson`, `removeMapping`, `sourceModel`, `targetModel`)
- Validation error alerts (`timeoutInvalid`, `jsonInvalidSyntax`)

---

## Verification & Testing Strategy
1. **Frontend Build Verification**: Run `npm run build:frontend` to verify strict TypeScript and Vite compilation.
2. **Integration Verification**: Run existing Jest backend tests with `npx jest --runInBand`.
