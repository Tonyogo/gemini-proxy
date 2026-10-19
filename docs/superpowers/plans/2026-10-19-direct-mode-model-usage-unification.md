# Direct Mode Model Usage Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the top model overview banner and per-account usage display between Direct Mode and Proxy Mode in AccountsView.

**Architecture:** Replace the legacy direct-mode 4-card banner with the unified minimalist 5-column responsive model overview cards. Refactor Direct Mode's desktop table and mobile card list to use the same compact usage summary (requests count + success rate + inline top model badges + popover / expandable breakdown) as Proxy Mode.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Jest

**Spec:** `docs/superpowers/specs/2026-10-19-direct-mode-model-usage-unification-design.md`

## Global Constraints

- No breaking changes to existing proxy mode account management features or backend APIs.
- Maintain existing direct-mode functional features: key masking, copy key button, and `轮询活跃` status badge.
- Ensure strict TypeScript safety and pass existing test suites (`npm test`).
- Ensure frontend builds cleanly without warnings or errors (`npm run build:frontend`).

## Review Focus

1. **Empty usage state:** When a direct node has 0 requests or no `byModel` entries, top overview displays `t('accounts.noModelUsageYet')` and key row usage displays `0 reqs (100.0%)` without crashing or NaN.
2. **Popover interactivity on direct mode keys:** Clicking or hovering the usage block on a direct mode key row correctly opens the Portal Usage Popover with detailed model breakdowns.
3. **Mobile expandable usage on direct mode keys:** Clicking the usage badge on mobile toggles the detailed breakdown accordion without interfering with key copy buttons.
4. **Cleanup of dead code:** Unused useMemo hooks (`directTotalReqs`, `directTotalSuccess`, `directTotalFailed`, `directSuccessRate`) and obsolete markup are cleanly eliminated.
5. **Multi-server switching:** Switching between Direct and Proxy nodes maintains smooth UI continuity with identical model usage card layouts.

---

### Task 1: Unify Top Model Overview Banner Across Direct and Proxy Modes

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:127-140, 1010-1082`
- Test: `tests/accountDirectModeModelUsageUnification.test.ts`

**Interfaces:**
- Consumes: `serverModelStats` from `calculateServerModelStats(accounts)`
- Produces: Unconditional rendering of the minimalist model breakdown grid for both direct and proxy nodes

- [x] **Step 1: Write failing test verifying top banner unification**

Create `tests/accountDirectModeModelUsageUnification.test.ts` with assertions verifying that:
1. `AccountsView.tsx` does not render the legacy direct mode 4-card grid (`grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4` under `directTotalReqs`).
2. The top model overview grid (`serverModelStats.models.map`) renders unconditionally regardless of `isCurrentDirect`.
3. Legacy unused variables (`directTotalReqs`, `directTotalSuccess`, `directTotalFailed`, `directSuccessRate`) are removed.

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('AccountsView Direct Mode Model Usage Unification', () => {
  const accountsViewPath = path.resolve(__dirname, '../frontend/src/components/AccountsView.tsx');
  let content: string;

  beforeAll(() => {
    content = fs.readFileSync(accountsViewPath, 'utf-8');
  });

  test('top model overview banner is unified and legacy direct mode 4-card grid is removed', () => {
    expect(content).not.toContain('directTotalReqs');
    expect(content).not.toContain('directTotalSuccess');
    expect(content).not.toContain('directSuccessRate');
    expect(content).not.toContain("t('accounts.directModeTitle', 'Gemini 直连密钥用量监控')");
    // Top model stats cards should render without isCurrentDirect ternary branch
    expect(content).toMatch(/\{\/\* Minimalist Top Summary Header \*\/\}/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountDirectModeModelUsageUnification.test.ts`  
Expected: FAIL (due to presence of `directTotalReqs` and `directModeTitle`).

- [x] **Step 3: Refactor top banner in `AccountsView.tsx`**

1. Remove `directTotalReqs`, `directTotalSuccess`, `directTotalFailed`, and `directSuccessRate` `useMemo` definitions.
2. In the JSX render section, replace the `{isCurrentDirect ? ( ... ) : ( <unified model overview> )}` ternary block with unconditional rendering of the unified model overview block.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountDirectModeModelUsageUnification.test.ts`  
Expected: PASS

- [x] **Step 5: Commit changes**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountDirectModeModelUsageUnification.test.ts
git commit -m "refactor(accounts): unify top model stats overview between direct and proxy modes"
```

---

### Task 2: Unify Desktop Table Column and Mobile Usage Card in Direct Mode

**Files:**
- Modify: `frontend/src/components/AccountsView.tsx:1415-1587`
- Test: `tests/accountDirectModeModelUsageUnification.test.ts`

**Interfaces:**
- Consumes: `getTotalUsage(acc.usage)`, `getModelBreakdowns(acc.usage)`, `getAccountTopModels(acc.usage, 2)`, `handleTogglePopover`, `handleMouseEnterPopover`, `toggleMobileUsage`
- Produces: Unified table column `配额与今日用量` in desktop direct mode table and unified mobile usage pill with expandable details

- [x] **Step 1: Write failing tests for desktop column and mobile direct mode layout**

Update `tests/accountDirectModeModelUsageUnification.test.ts`:
1. Verify desktop direct mode table uses `t('accounts.tableQuota')` header instead of separate `调用统计` and `活跃模型明细` headers.
2. Verify direct mode desktop rows wire `handleTogglePopover` / `handleMouseEnterPopover` on click/hover for the usage block.
3. Verify direct mode desktop rows render inline top model badges via `topModels.map(...)`.
4. Verify direct mode mobile card list renders `toggleMobileUsage` and expandable `breakdowns.map(...)` block instead of inline wrapping tags.

- [x] **Step 2: Run test to verify it fails**

Run: `npx jest tests/accountDirectModeModelUsageUnification.test.ts`  
Expected: FAIL

- [x] **Step 3: Implement unified desktop table and mobile cards in `AccountsView.tsx`**

1. In Desktop Direct Mode Table:
   - Change table header columns from 5 columns to 4 columns: `序号`, `Gemini API Key`, `状态`, `配额与今日用量`.
   - Update table body row:
     - Compute `const topModels = getAccountTopModels(acc.usage, 2);` and `const successRate = totalUsage > 0 ? parseFloat(((succ / totalUsage) * 100).toFixed(1)) : 100.0;`.
     - Render the unified usage column: `totalUsage reqs`, `successRate%` badge, `Info` icon (when `breakdowns.length > 0`), and inline top model badges.
     - Attach `onClick={(e) => handleTogglePopover(e, acc.index)}` and `onMouseEnter={(e) => handleMouseEnterPopover(e, acc.index)}`.
2. In Mobile Direct Mode Card List:
   - Replace the legacy progress bar & wrapping tags with the proxy-mode style usage button (`Clock` + count + rate + `ChevronDown` if `breakdowns.length > 0`) + inline top model badges.
   - Render expandable breakdown drawer `{isUsageExpanded && ( ... )}` when clicked.

- [x] **Step 4: Run test to verify it passes**

Run: `npx jest tests/accountDirectModeModelUsageUnification.test.ts`  
Expected: PASS

- [x] **Step 5: Run full test suite and frontend build**

Run: `npx jest tests/accountsViewMultiServer.test.ts tests/accountModelStatsBannerCollapse.test.ts tests/accountDirectModeModelUsageUnification.test.ts`  
Run: `cd frontend && npm run build`  
Expected: All tests pass (PASS), frontend builds without error.

- [x] **Step 6: Commit changes**

```bash
git add frontend/src/components/AccountsView.tsx tests/accountDirectModeModelUsageUnification.test.ts
git commit -m "feat(accounts): unify direct mode account usage table and mobile cards with proxy mode"
```
