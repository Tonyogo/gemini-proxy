# Mobile Dashboard Layout & Spacing Optimization Design

## Problem Statement
When opening the dashboard view on mobile devices (smartphones with screen widths 360px~430px), several UI elements consume excessive screen real estate:
1. The 4 APM KPI stat cards are arranged in a 1-column stack with generous padding (`p-5`) and large text sizes (`text-2xl`), pushing critical performance metrics and charts far down below the initial fold.
2. The page container and header controls have loose vertical spacing (`space-y-6`) and large button padding, causing the time range switcher to take unnecessary vertical space.
3. The Model Performance Matrix uses desktop-oriented padding (`p-4 sm:p-5`) and loose item gaps on mobile.
4. The APM chart card has a fixed height of `h-[380px]` and `p-5` padding, overwhelming smaller mobile viewports.

## User Decisions & Constraints
- **KPI Cards Layout on Mobile**: 2-column compact grid (`grid-cols-2 lg:grid-cols-4`) with smaller padding (`p-3 sm:p-5`), compact icons (`w-6 h-6 sm:w-8 sm:h-8`), and proportional typography (`text-lg sm:text-2xl`) so all 4 indicators fit neatly in a 2x2 grid.
- **APM Chart Height on Mobile**: Dynamic responsive height `h-[300px] sm:h-[380px]` with padding `p-3.5 sm:p-6`.
- **Page Spacing**: Compact mobile gaps `space-y-3.5 sm:space-y-6`.
- **Model Matrix**: Compact card padding `p-3 sm:p-5` with `space-y-2` on mobile.

## Affected Components
1. `frontend/src/components/DashboardView.tsx`
2. `frontend/src/components/dashboard/ModelPerformanceMatrix.tsx`
3. Unit test assertions in `tests/dashboardOptimization.test.ts`
