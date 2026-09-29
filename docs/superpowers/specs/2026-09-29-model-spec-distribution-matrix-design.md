# Model Spec Distribution Matrix Visual Enhancement Spec

**Goal:** Redesign and optimize the model specification distribution (Standard vs High spec) column and mobile micro-cards in the Model Performance Matrix (`ModelPerformanceMatrix.tsx`) with high-contrast dual-color pill badges, explicit percentages, and an amplified gradient ratio bar.

## Problem Statement
In `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`, the model specification distribution column previously used:
1. Thin `h-1.5` progress bars that were easily overlooked.
2. Dim text labels (`10px`, `text-[var(--text-secondary)]`) without distinct visual encapsulation or clear percentage share per spec.
3. Subdued colors (`sky-500/80` and `purple-500/90`) where zero-count High specs collapsed into an indistinct `-` with 40% opacity.

## Requirements & Design Details

### 1. Dual-Color Pill Badges (Desktop & Mobile)
- **Standard Spec (Std)**:
  - Container style: `border-sky-500/30 bg-sky-500/10 text-sky-400 font-medium px-1.5 py-0.5 rounded-md`
  - Indicators: A solid cyan bullet (`bg-sky-400 w-1.5 h-1.5 rounded-full`) followed by count and percentage, e.g. `Std 1,240 · 80%`.
  - Tooltip: clear localized description with exact count and percentage.
- **High Spec (High)**:
  - Non-zero count style: `border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 font-medium px-1.5 py-0.5 rounded-md`
  - Icon: `Zap` icon in `w-2.5 h-2.5 text-fuchsia-400` followed by count and percentage, e.g. `High 310 · 20%`.
  - Zero count style: Subtle ghost capsule `border-[var(--border-subtle)] bg-black/5 dark:bg-white/5 text-[var(--text-secondary)] opacity-50` showing `High 0 · 0%` to preserve vertical and horizontal alignment across rows.

### 2. Amplified Dual-Color Gradient Ratio Bar
- Height increased from `h-1.5` (6px) to `h-2.5` (10px).
- Styling: Rounded full capsule with subtle outer container border `border border-black/5 dark:border-white/5 p-0.5`.
- Standard bar: `bg-gradient-to-r from-sky-500 to-blue-500`.
- High bar: `bg-gradient-to-r from-fuchsia-500 to-purple-600` with subtle left division line `border-l border-white/20 dark:border-black/20`.
- Responsive border radius: Corner radiuses adapt so rounded ends always map to the outer boundary regardless of 100%/0% distributions.

### 3. Layout Dimensions
- Desktop column width: adjust table header width from `min-w-[170px]` to `min-w-[210px]` to provide adequate breathing room for dual badges.
- Mobile cards: mirror the desktop pill badges and `h-2.5` gradient bar.

## Verification & Testing
- Unit test suite: `tests/modelPerformanceMatrixEnhancement.test.ts` updated to assert presence of `h-2.5`, badges classes (`sky-500`, `fuchsia-500`), and percentage rendering logic.
- Visual and type build check: `npm run build:frontend`.
