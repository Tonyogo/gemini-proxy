# Terminal Logs Title & Text Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify and unify the title, description, and empty state labels for "代理服务终端日志" / "服务端终端输出" into concise, clean phrases ("终端日志" / "Terminal Logs") across i18n locales.

**Architecture:**
- `zh.ts`:
  - `accounts.upstreamLogsTitle`: `"代理服务终端日志"` → `"终端日志"`
  - `accounts.noUpstreamLogs`: `"暂无上游代理服务终端日志输出。"` → `"暂无终端日志输出。"`
  - `terminal.title`: `"服务端终端输出"` → `"终端日志"`
  - `terminal.noLogsRecorded`: `"暂无终端输出记录。"` → `"暂无终端日志记录。"`
- `en.ts`:
  - `accounts.upstreamLogsTitle`: `"Upstream Proxy Terminal Logs"` → `"Terminal Logs"`
  - `accounts.noUpstreamLogs`: `"No upstream proxy terminal logs available."` → `"No terminal logs available."`
  - `terminal.title`: `"Server Terminal Output"` → `"Terminal Logs"`
  - `terminal.noLogsRecorded`: `"No terminal logs recorded."` → `"No terminal logs recorded."`

**Tech Stack:** TypeScript, i18n locale files

**Spec:** In-chat approved bounded design for terminal logs text simplification.

## Global Constraints
- Strict TypeScript: maintain type safety of `Translations` interface in `frontend/src/i18n/locales/en.ts` and `zh.ts`.

---

### Task 1: Update zh.ts & en.ts with Simplified Terminal Logs Titles

**Files:**
- Modify: `frontend/src/i18n/locales/zh.ts`
- Modify: `frontend/src/i18n/locales/en.ts`

**Interfaces:**
- Consumes: `Translations`
- Produces: Simplified strings for `upstreamLogsTitle`, `noUpstreamLogs`, `terminal.title`, `terminal.noLogsRecorded`.

- [ ] **Step 1: Edit zh.ts and en.ts**

Update `accounts.upstreamLogsTitle`, `accounts.noUpstreamLogs`, `terminal.title`, and `terminal.noLogsRecorded` in both locale files.

- [ ] **Step 2: Build frontend to verify compilation**

Run: `npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 3: Run test suite**

Run: `npx jest --runInBand`
Expected: 22 test suites passed.

- [ ] **Step 4: Commit changes**

```bash
git add frontend/src/i18n/locales/zh.ts frontend/src/i18n/locales/en.ts
git commit -m "refactor(i18n): simplify terminal log titles and descriptions across locales"
```
