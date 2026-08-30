# Model Multi-Target Mapping & Round-Robin Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support 1-to-N model mappings in `MODEL_MAPPINGS` (e.g. mapping `claude-3-7-sonnet` to multiple Gemini targets `["gemini-2.5-pro", "gemini-3.6-pro"]`) with in-memory Round-Robin load balancing per source model, while maintaining 100% backward compatibility with existing single-target configurations and UI editors.

**Architecture:**
- **Types (`src/types/index.ts`)**:
  - Extend `ModelMappingTargetConfig` to accept `target?: string` and `targets?: string[]`.
  - Extend `ModelMappingValue` to accept `string | string[] | ModelMappingTargetConfig`.
- **Translator & Dispatcher (`src/services/claudeTranslator.ts`)**:
  - Maintain a stateful in-memory round-robin map `roundRobinIndices: Map<string, number>`.
  - In `getModelMappingInfo(rawModel)`:
    - If mapped to an array of targets or an object with `targets` (e.g. `{ targets: [...], strategy?: '...' }`):
      - Extract target candidate list.
      - Select target via round-robin index: `const selected = targets[counter % targets.length]`.
      - Increment counter atomically.
      - Return `{ targetModel: selected, strategy: mapping.strategy }` (where `strategy` is passed along for downstream/upstream header handling).
    - If single target string or `{ target: string }`: preserve existing behavior.
- **Frontend Config & Visual Editors (`frontend/src/components/ConfigModal.tsx`, `DashboardView.tsx`)**:
  - In `ConfigModal.tsx`:
    - KV editor accepts comma-separated targets (e.g. `gemini-2.5-pro, gemini-3.6-pro`) or array in raw JSON mode.
    - Serializes comma-separated values to `string[]` or `{ targets: string[], strategy?: string }` if multiple targets exist.
    - Deserializes array targets smoothly into comma-separated text in KV inputs.
  - In `DashboardView.tsx`:
    - Handle display of array targets in model mappings cards gracefully (e.g. `targetA, targetB`).
- **Automated Tests (`tests/claudeTranslator.test.ts`, `tests/dynamicConfigHotReload.test.ts`)**:
  - Add test cases verifying round-robin distribution across multiple targets and downstream strategy header preservation.

**Tech Stack:** TypeScript, Express, React 18, Tailwind CSS, Jest.

**Spec:** In-chat approved Bounded Design for Multi-Target Model Mapping with Round-Robin Scheduling.

## Global Constraints
- Strict TypeScript: ensure full type safety for single target, multi-target arrays, and target config objects.
- Zero breaking changes for existing configs: single string (`"gemini-flash"`) and single object (`{ target: "...", strategy: "..." }`) must continue to work identically.
- Verification: `npm run build` and `npx jest --runInBand`.

---

### Task 1: Extend Backend Types and Round-Robin Mapping Resolution

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/claudeTranslator.ts`
- Test: `tests/claudeTranslator.test.ts`

**Interfaces:**
- `ModelMappingTargetConfig`: `{ target?: string; targets?: string[]; strategy?: SchedulingStrategy }`
- `ModelMappingValue`: `string | string[] | ModelMappingTargetConfig`
- `getModelMappingInfo(rawModel: string)`: `{ targetModel: string; strategy?: SchedulingStrategy }`

- [ ] **Step 1: Write failing unit tests for 1-to-N model mapping with round-robin**

Add test cases in `tests/claudeTranslator.test.ts`:
1. Array of targets (`["gemini-2.5-pro", "gemini-3.6-pro"]`) alternates targets on successive calls (Round-Robin).
2. Object with `targets` array and `strategy` (`{ targets: ["m1", "m2"], strategy: "round-robin" }`) alternates targets and returns the strategy.
3. Single string and single target object still work as expected.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/claudeTranslator.test.ts -t "round-robin"`
Expected: FAIL due to lack of array target handling.

- [ ] **Step 3: Update `src/types/index.ts` and `src/services/claudeTranslator.ts`**

1. Update `src/types/index.ts`:
   ```typescript
   export interface ModelMappingTargetConfig {
     target?: string;
     targets?: string[];
     strategy?: SchedulingStrategy;
   }
   export type ModelMappingValue = string | string[] | ModelMappingTargetConfig;
   ```
2. Update `src/services/claudeTranslator.ts`:
   - Add `private roundRobinCounters: Map<string, number> = new Map();`
   - In `getModelMappingInfo(rawModel)`:
     - Handle `Array.isArray(mapping)`:
       - If `mapping.length === 0`, return `{ targetModel: rawModel }`.
       - If `mapping.length === 1`, return `{ targetModel: mapping[0] }`.
       - If `mapping.length > 1`:
         - `const count = this.roundRobinCounters.get(rawModel) || 0;`
         - `const chosen = mapping[count % mapping.length];`
         - `this.roundRobinCounters.set(rawModel, count + 1);`
         - `return { targetModel: chosen };`
     - Handle `typeof mapping === 'object'`:
       - Check `mapping.targets` array:
         - If `Array.isArray(mapping.targets)` and `mapping.targets.length > 0`:
           - Use round-robin to pick target from `mapping.targets`.
           - Return `{ targetModel: chosen, strategy: mapping.strategy }`.
       - Check `mapping.target` string:
         - Return `{ targetModel: mapping.target, strategy: mapping.strategy }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/claudeTranslator.test.ts`
Expected: PASS with 100% test coverage on mapping resolution.

- [ ] **Step 5: Commit backend changes**

```bash
git add src/types/index.ts src/services/claudeTranslator.ts tests/claudeTranslator.test.ts
git commit -m "feat(core): support 1-to-N model mappings with round-robin load balancing"
```

---

### Task 2: Update Frontend KV Editor, JSON Sync & Dashboard View for Multi-Target Mappings

**Files:**
- Modify: `frontend/src/components/ConfigModal.tsx`
- Modify: `frontend/src/components/DashboardView.tsx`

**Interfaces:**
- `ConfigModal`:
  - Visual KV editor parses comma/space-separated targets into arrays when saving.
  - Visual KV editor displays array targets as comma-separated strings (`target1, target2`).
  - Raw JSON mode supports arrays and `{ targets: [...] }`.
- `DashboardView`:
  - Renders multi-target badges or comma-separated targets cleanly in active mapping cards.

- [ ] **Step 1: Update ConfigModal.tsx to support multi-target values in KV and JSON modes**

1. When loading config from API in `fetchConfig()` and `handleRawJsonChange()`:
   - If `val` is `string[]`, join with `', '` for KV target input.
   - If `val.targets` is `string[]`, join with `', '` for KV target input and preserve `strategy`.
2. When saving config in `updateRawFromEntries()`:
   - If target contains comma `,`:
     - Split by `,`, trim parts, filter empty strings.
     - If resulting array has multiple items:
       - If `strategyTrimmed`, output `{ targets: list, strategy: strategyTrimmed }`.
       - Otherwise output `list` (array of strings).
     - If resulting array has 1 item, output string or `{ target: item, strategy: strategyTrimmed }`.

- [ ] **Step 2: Update DashboardView.tsx to render multi-target mappings properly**

Check where `modelMappings` are rendered in `DashboardView.tsx`:
- If target value is an array or has `targets`, format as `targets.join(', ')` with a badge showing `(N targets, 轮询)`.

- [ ] **Step 3: Run full build and test suite**

Run: `npm run build && npx jest --runInBand`
Expected: 0 TypeScript errors, all 22 test suites passing.

- [ ] **Step 4: Commit frontend changes**

```bash
git add frontend/src/components/ConfigModal.tsx frontend/src/components/DashboardView.tsx
git commit -m "feat(ui): support multi-target model mappings in config editor and dashboard"
```
