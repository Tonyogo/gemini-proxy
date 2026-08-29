# Mobile Bottom Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a fixed bottom navigation bar for mobile viewports, remove the mobile side-drawer, and relocate top actions (settings, language, logout, refresh) into the mobile header for an optimal native app-like experience.

**Architecture:** 
- Mobile screens (`< 768px` / `md:hidden`): Replace the slide-out drawer with a fixed bottom navigation bar featuring the 5 main tabs (Dashboard, Accounts, Logs, Terminal, Playground).
- Header (`<header>`): In mobile view, remove the hamburger menu icon, display the brand badge with active tab name, and provide quick-access action buttons (Settings, Language, Logout, Refresh).
- Main viewport (`<main>`): Update bottom padding (`pb-20 md:pb-6`) to prevent fixed bottom navigation from obscuring page content.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide React icons, Vite

**Spec:** In-chat approved bounded design for mobile bottom navigation.

## Global Constraints
- Strict TypeScript: no `any` regressions where types exist.
- Ensure all 5 tabs and auxiliary controls (Settings, Language, Logout, Refresh) are accessible on mobile without a side drawer.
- Preserve desktop collapsible sidebar behavior exactly as-is (`md:flex`, `w-16` / `w-60`).

---

### Task 1: Refactor App.tsx for Fixed Mobile Bottom Navigation & Header Action Controls

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `useTranslation()`, `activeTab`, `setActiveTab`, `handleRefresh`, `handleLogout`, `setIsConfigModalOpen`
- Produces: Fixed bottom nav bar for mobile (`md:hidden`) and updated glass top header with quick action items.

- [ ] **Step 1: Update App.tsx with Bottom Navigation Bar & Mobile Header Actions**

In `frontend/src/App.tsx`:
1. Remove `isMobileOpen` state and its window resize handler (no longer needed since drawer is replaced with bottom bar).
2. Clean up mobile drawer elements and simplify `<aside>` to `hidden md:flex`.
3. Update `<header>` to display brand icon + active title on left, and quick action buttons (`Refresh`, `Settings`, `Language`, `Logout`, `Online status`) on right.
4. Add fixed bottom navigation `<nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0C0E14]/95 backdrop-blur-lg border-t border-white/[0.08] px-2 py-1.5 flex items-center justify-around md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">` mapping over `NAV_ITEMS`.
5. Update `<main>` padding to `p-2.5 sm:p-4 md:p-6 pb-20 md:pb-6`.

- [ ] **Step 2: Build frontend to verify TypeScript and JSX compilation**

Run: `npm run build`
Expected: `✓ built in ...` and `tsc` exits with 0.

- [ ] **Step 3: Run test suite to ensure all tests pass**

Run: `npm test`
Expected: 22 test suites passed.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ui): implement fixed bottom navigation bar for mobile viewports"
```
