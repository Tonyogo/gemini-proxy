---
name: log-page-recent-hour-design
description: Fix logs page issue where the most recent hour with data is not displayed due to JS Object.keys sorting behavior
metadata:
  type: project
---

# Design Spec: Fix Logs Page Recent Hour Display Bug

## Background & Problem Statement
The logs viewer in the admin dashboard allows users to inspect proxy requests/responses. Logs are organized by date (folders like `YYYY-MM-DD`) and hour (folders like `HH` from `00` to `23`) in the workspace.

The backend builds a hierarchy of dates and hours to return to the frontend:
```json
{
  "tree": {
    "2026-07-26": { "22": 11 },
    "2026-07-25": { "23": 178, "22": 12, "02": 3 }
  }
}
```

On the frontend, the code attempts to auto-select the latest date and the latest hour with data on initial load. It does this by using `Object.keys()` on the tree:
```typescript
const dates = Object.keys(logTree);
const latestDate = dates[0];
const hours = Object.keys(logTree[latestDate] || {});
const latestHour = hours[0];
```

**The Bug:**
By ES6 standard behavior, `Object.keys(obj)` orders integer-like keys (unsigned 32-bit integers) in ascending numeric order. Non-integer numeric strings with leading zeros (like `"00"`, `"01"`, etc.) are treated as alphabetical string keys and ordered after integer keys.

This causes:
- An object like `{"23": 1, "22": 2, "02": 3}` to have keys ordered as `['22', '23', '02']`.
- The first element `hours[0]` resolves to `"22"`, ignoring the actual more recent hour `"23"`.
- Under other circumstances (e.g. only `"01"` and `"02"`), they are sorted as string keys `['01', '02']`, where the first item is `"01"`, failing to show `"02"`.

This design spec outlines how we fix this by sorting dates and hours explicitly in descending order on the frontend.

## Proposed Solution: Frontend Sorting (Approach 1)

We will sort the parsed date keys alphabetically descending and parsed hour keys numerically descending at all places where they are extracted and used to make selections or populate dropdown lists.

### 1. Auto-Jump Hour Selection in `fetchLogs`
Modify the auto-jump hour selection logic to sort dates and hours descending before taking index `0`:
- **Dates**: Alphabetic comparison descending (`b.localeCompare(a)`).
- **Hours**: Numeric subtraction descending (`parseInt(b, 10) - parseInt(a, 10)`).

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
      fetchSpecificLogs(latestDate, latestHour);
      return;
    }
  }
}
```

### 2. Manual Date Switch Selection in `handleDateChange`
When switching dates manually, select the maximum hour of that date:
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

### 3. Available Hours Helper Definition
Update `availableHours` computation to pre-sort hours numerically descending:
```typescript
const availableHours = selectedDate && tree[selectedDate]
  ? Object.keys(tree[selectedDate]).sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
  : [];
```

### 4. Date Dropdown Select Render Option List
Update the date options list to ensure dates are always listed descending (most recent first):
```typescript
{Object.keys(tree).sort((a, b) => b.localeCompare(a)).map(d => (
  <option key={d} value={d}>📅 {d}</option>
))}
```

## Testing & Verification Plan

1. **Production Compilation Check:**
   Run `npm run build` to verify there are no TypeScript syntax errors, type incompatibilities, or bundler-level regression in frontend compilation.

2. **Manual verification / code inspection:**
   Ensure the date and hour dropdown lists are populated in correct reverse-chronological order and that auto-jump lands precisely on the most recent hour (e.g., selecting `"23"` instead of `"22"` or `"02"`).
