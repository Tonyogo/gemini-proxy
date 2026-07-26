# Logs Recent Hour Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly sort the log dates alphabetically descending and hours numerically descending on the frontend admin logs page so that the most recent hour with data is auto-selected and displayed first in selection dropdowns.

**Architecture:** Keep data structures returned from the API compatible but add robust client-side sorting algorithms specifically for dates and hour selections.

**Tech Stack:** React (TypeScript), Tailwind CSS

## Global Constraints
- Target frontend source file: `frontend/src/components/LogsView.tsx`
- Do not make changes to API key propagation patterns or the underlying payload schemas.
- Ensure that the frontend successfully compiles with `npm run build` once task changes are implemented.

---

### Task 1: Sort Dates and Hours during Initial Fetch Auto-Jump

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:37-64`

**Interfaces:**
- Consumes: JSON response from `/api/admin/logs?limit=100` via backend `AdminController.getLogs()`.
- Produces: Correct state updates for `selectedDate` and `selectedHour`.

- [ ] **Step 1: Inspect target code segment**
Read lines 37 to 64 in `frontend/src/components/LogsView.tsx` to understand the current logic.

- [ ] **Step 2: Implement explicit date and hour sorting in fetchLogs**
Replace:
```typescript
        const dates = Object.keys(logTree);
        if (dates.length > 0) {
          if (forceAutoJump || !targetDate || !logTree[targetDate]) {
            const latestDate = dates[0];
            setSelectedDate(latestDate);

            const hours = Object.keys(logTree[latestDate] || {});
            if (hours.length > 0) {
              const latestHour = hours[0];
              setSelectedHour(latestHour);
              // Refetch specifically for the auto-jumped date and hour
              fetchSpecificLogs(latestDate, latestHour);
              return;
            }
          }
        }
```
With:
```typescript
        const dates = Object.keys(logTree).sort((a, b) => b.localeCompare(a));
        if (dates.length > 0) {
          if (forceAutoJump || !targetDate || !logTree[targetDate]) {
            const latestDate = dates[0];
            setSelectedDate(latestDate);

            const hours = Object.keys(logTree[latestDate] || {})
              .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
            if (hours.length > 0) {
              const latestHour = hours[0];
              setSelectedHour(latestHour);
              // Refetch specifically for the auto-jumped date and hour
              fetchSpecificLogs(latestDate, latestHour);
              return;
            }
          }
        }
```

- [ ] **Step 3: Commit current task changes**
```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(frontend): sort dates and hours descending during auto-jump selection"
```

---

### Task 2: Sort Hours on Manual Date Selection

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:99-105`

**Interfaces:**
- Consumes: Selected date string from the Date dropdown `<select>`.
- Produces: Correctly sorted hours list for finding the maximum hour of the selected date.

- [ ] **Step 1: Inspect target manual handler**
Review `handleDateChange` logic in `frontend/src/components/LogsView.tsx`.

- [ ] **Step 2: Update handleDateChange to sort hours numerically descending**
Replace:
```typescript
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const hours = Object.keys(tree[date] || {});
    const newHour = hours.length > 0 ? hours[0] : '';
    setSelectedHour(newHour);
    fetchLogs(false, date, newHour);
  };
```
With:
```typescript
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    const hours = Object.keys(tree[date] || {})
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    const newHour = hours.length > 0 ? hours[0] : '';
    setSelectedHour(newHour);
    fetchLogs(false, date, newHour);
  };
```

- [ ] **Step 3: Commit task changes**
```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(frontend): sort hours descending on manual date change selection"
```

---

### Task 3: Sort Hours and Dates inside Select Dropdowns Rendering

**Files:**
- Modify: `frontend/src/components/LogsView.tsx:112-112`, `frontend/src/components/LogsView.tsx:148-150`

**Interfaces:**
- Consumes: Current values of `tree` state and `selectedDate`.
- Produces: Sorted array strings for date option mapping and hour option mapping in dropdown elements.

- [ ] **Step 1: Inspect hours and dates selectors**
Find `availableHours` helper line and the date dropdown option list rendering inside `LogsView.tsx`.

- [ ] **Step 2: Sort availableHours helper numerically descending**
Replace:
```typescript
  const availableHours = selectedDate && tree[selectedDate] ? Object.keys(tree[selectedDate]) : [];
```
With:
```typescript
  const availableHours = selectedDate && tree[selectedDate]
    ? Object.keys(tree[selectedDate]).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
    : [];
```

- [ ] **Step 3: Sort dates option list alphabetically descending in JSX render**
Replace:
```typescript
                {Object.keys(tree).map(d => (
                  <option key={d} value={d}>📅 {d}</option>
                ))}
```
With:
```typescript
                {Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
                  <option key={d} value={d}>📅 {d}</option>
                ))}
```

- [ ] **Step 4: Commit task changes**
```bash
git add frontend/src/components/LogsView.tsx
git commit -m "feat(frontend): sort dropdown select options for dates and hours descending"
```

---

### Task 4: Compilation and Verification

**Files:**
- Verify Compilation: `frontend` folder

**Interfaces:**
- Consumes: All changes made to `LogsView.tsx`.
- Produces: Successful webpack/vite build of the frontend code.

- [ ] **Step 1: Compile the frontend application**
Run: `npm run build` from the workspace root (or `npm run build` directly inside the `frontend` folder) to verify that frontend production compilation succeeds with no syntax or type errors.

- [ ] **Step 2: Run test suite to verify no regressions**
Run: `npm test` to verify backend routes and other components behave correctly.
