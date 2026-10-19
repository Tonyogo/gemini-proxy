# Direct Mode Model Usage Unification Design Spec

**Date:** 2026-10-19  
**Topic:** Unify Model Usage Overview and Account Row Display Between Direct Mode and Proxy Mode in AccountsView

## 1. Problem Statement & Motivation
Currently in `AccountsView.tsx`, servers operating in Google Gemini official "Direct Mode" (`isCurrentDirect === true`) display a completely different and fragmented UI compared to "Proxy Mode":
1. **Top Banner Inconsistency:** Direct mode displays a legacy Cyan-colored banner (`Gemini 直连密钥用量监控`) and four large statistic cards (API Keys, Total Requests, Success, Failure). It lacks the responsive, multi-column per-model traffic distribution cards that proxy mode possesses.
2. **Table / Row Usage Inconsistency:**
   - In desktop direct mode, usage is split across two wide columns (`调用统计` with an inline progress bar, and `活跃模型明细` with inline tags for all models), whereas proxy mode uses a clean, compact single column (`配额与今日用量`) with total requests, success rate badge, inline top model badges, and an interactive hover/click Portal Popover detailing all model breakdowns.
   - In mobile direct mode, model details are rendered as wrapping text tags instead of the compact toggle button with top model badges and expandable details.

## 2. Goals & Non-Goals
### Goals
- **Unified Top Model Stats Overview:** Both Direct Mode and Proxy Mode will use the unified minimalist model overview banner (`serverModelStats.models`), featuring responsive up to 5-column model cards (model name, request count, traffic share, success/error metrics, and success rate).
- **Unified Desktop Table Column:** Direct mode desktop table will adopt the same `配额与今日用量` layout: total requests + success rate percentage + Info icon + inline top models badges (`getAccountTopModels`), supporting click and hover triggers for the Portal Usage Popover.
- **Unified Mobile Card Row:** Direct mode mobile view will adopt the same compact usage button (`Clock` + count + rate + `ChevronDown`) + inline top model badges, with expandable breakdown card.
- **Remove Redundant Code:** Deprecate unneeded state computations (`directTotalReqs`, `directTotalSuccess`, `directTotalFailed`, `directSuccessRate`) and legacy banner markup.

### Non-Goals
- Changing backend API contracts (backend `/api/admin/accounts/status` already returns identical `usage.byModel` structures).
- Removing direct-mode specific functional badges (e.g. `直连`, `轮询活跃`) or key copy action.

## 3. UI Component Structure
```
[ AccountsView Top Section ]
  └─ Node Model Usage Overview (Unified for both Direct & Proxy nodes)
       ├─ Summary Header: N 个模型处理中 · 总调用量: X · 成功率: Y%
       └─ Grid (1 to 5 cols): [ Model Card: Name, Count (Share%), Ok/Err (Rate%) ]

[ Table / Card Section ]
  ├─ Desktop View:
  │    └─ Column 4: 配额与今日用量
  │         ├─ Total Reqs · Rate% · Info Icon -> Triggers Portal Popover
  │         └─ Inline Top Models Badges
  └─ Mobile View:
       └─ Usage Pill: Total Reqs · Rate% · ChevronDown -> Expands Breakdown Card
```
