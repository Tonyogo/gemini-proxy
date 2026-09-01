# Terminal Accessory Bar Streamlining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the bottom mobile/touch `TerminalAccessoryBar` component by removing redundant Vim-specific shortcut buttons and single-character buttons, keeping a clean, professional standard terminal accessory bar.

**Architecture:** Update `frontend/src/components/terminal/TerminalAccessoryBar.tsx` to retain only standard modifier keys (`ESC`, `TAB`, `CTRL`, `ALT`), terminal control shortcuts (`^C`, `^D`, `^L`), Enter (`↵`), arrow navigation keys (`↑`, `↓`, `←`, `→`), and utility tools (`Snippets`, `Keyboard`).

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React, Jest.

---

### Task 1: Streamline `TerminalAccessoryBar.tsx`

**Files:**
- Modify: `frontend/src/components/terminal/TerminalAccessoryBar.tsx`

**Interfaces:**
- `TerminalAccessoryBarProps`: Unchanged.
- Preserves all core keyboard and modifier handlers (`onSendInput`, `onToggleCtrl`, `onToggleAlt`, `onToggleKeyboard`, `onOpenSnippets`).

- [ ] **Step 1: Update `frontend/src/components/terminal/TerminalAccessoryBar.tsx`**

Replace content with the clean, streamlined layout without redundant buttons.

- [ ] **Step 2: Run frontend build and test suites**

Run: `npm run build && npm test`
Expected: PASS with zero build errors and all 25+ test suites passing.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/terminal/TerminalAccessoryBar.tsx
git commit -m "refactor(terminal): streamline accessory bar by removing redundant vim buttons"
```
