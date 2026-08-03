# Design Spec: Frontend Internationalization (i18n)

## Overview
This specification details the architecture for adding bilingual (Chinese / English) internationalization support across the Admin Web Console frontend without adding third-party dependencies, leveraging a lightweight React Context with local storage persistence.

---

## Architectural Changes

### 1. i18n Context & Dictionaries (`frontend/src/i18n/`)

#### Locale Dictionary Structure (`frontend/src/i18n/locales/`)
- `en.ts`: English string definitions.
- `zh.ts`: Simplified Chinese string definitions.
- Keys organized by component domain:
  - `nav`: Navigation tabs, auth, header controls.
  - `dashboard`: Status metrics, system uptime, quick config.
  - `logs`: Transaction logs sidebar, detail view, headers.
  - `terminal`: Real-time terminal log viewer, status badge, filters.
  - `playground`: API playground presets, endpoint selection, curl generation.
  - `config`: Runtime configuration modal fields, placeholders, reset controls.
  - `concurrent`: Concurrency testing modal controls and stats.

#### LanguageContext Provider (`frontend/src/i18n/LanguageContext.tsx`)
- Detects initial language preference from `localStorage.getItem('app_lang')` or `navigator.language` (defaults to `'zh'` if Chinese locale detected, otherwise `'en'`).
- Provides custom hook `useTranslation()`:
  - `t(key: string): string`: Evaluates nested key paths (e.g. `t('nav.dashboard')`).
  - `lang`: Current active language (`'zh' | 'en'`).
  - `setLang(lang)`: Updates active language and saves to `localStorage`.

---

### 2. Header Language Toggle (`frontend/src/App.tsx`)
- Adds a language toggle button in the top header adjacent to the Admin Secret Key controls.
- Displays `中 / EN` toggle button allowing instant, zero-reload language switching.

---

### 3. Component Text Key Migration
Updates all 7 frontend UI components to replace hardcoded text with `t(...)` calls:
- `App.tsx`
- `DashboardView.tsx`
- `LogsView.tsx`
- `TerminalLogsView.tsx`
- `PlaygroundView.tsx`
- `ConfigModal.tsx`
- `ConcurrentTestModal.tsx`

---

## Testing Strategy
- **Type Checking & Build**: Run `npm run build:frontend` to verify TypeScript key resolution and Vite bundle compilation.
- **Backend Test Suite**: Run `npx jest --runInBand` to ensure full project integration passes cleanly.
