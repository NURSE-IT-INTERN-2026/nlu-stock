---
target: settings page
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-06-09T08-51-28Z
slug: src-app-dashboard-settings-page-tsx
---
## Settings Page Critique

### Design Health Score: 24/40 (Acceptable)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton loading, toast feedback, but no dirty form warning |
| 2 | Match System / Real World | 3 | Thai labels clear, but status chips use English keys |
| 3 | User Control and Freedom | 3 | Cancel on all dialogs, but no undo for drag-reorder |
| 4 | Consistency and Standards | 2 | Each tab uses different container style |
| 5 | Error Prevention | 3 | Code/name duplicate check, but CSV parse is fragile |
| 6 | Recognition Rather Than Recall | 3 | Filters visible, but state lost on tab switch |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no batch edit |
| 8 | Aesthetic and Minimalist Design | 2 | Items tab is dense — 9 columns, no visual break |
| 9 | Error Recovery | 2 | Toast errors don't persist, form data not saved on error |
| 10 | Help and Documentation | 1 | No inline help, Import tab doesn't explain CSV format |

### Anti-Patterns: Not AI slop, but overly uniform visual weight

### Priority Issues
- [P1] Items tab too dense for a tab — consider separate page or two-level navigation
- [P1] Flat visual hierarchy in Items tab — toolbar/data/pagination same weight
- [P2] Tab switch resets filter state
- [P2] Each tab uses different container style
- [P2] Import tab doesn't teach CSV format

### Strengths
- Code suggestion with duplicate detection (orange pill)
- Skeleton loading on all tabs
- Meaningful empty states with CTA
