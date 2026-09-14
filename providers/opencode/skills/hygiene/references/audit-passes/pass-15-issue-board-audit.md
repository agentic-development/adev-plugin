## Audit Pass 15: Issue Board Audit

**Goal:** Cross-reference specs, plans, and the issue board to detect orphaned artifacts, stale items, and completeness gaps.

**Prerequisites:** `tasks.backend` must be configured in `manifest.yaml`. If not configured, output SKIP.

**Steps:**

1. **Orphaned plans**: Find `.plan.md` files under `.context-index/specs/features/` that have no corresponding epic on the issue board (no epic has a matching `planRef`).
2. **Orphaned issues**: Find issues whose `planRef` points to a file that no longer exists.
3. **Partial epics**: Find epics where the issue count doesn't match the plan's task count (plan says 6 tasks but only 4 issues exist).
4. **Stale deferred**: Find issues with `status: deferred` that are older than 14 days with no notes update.
5. **Epic completeness**: Find epics where all child issues are `closed` but the epic status is still `open`.
6. **Plan-spec consistency**: Find plans whose parent spec has been modified since the plan was created (spec has newer `updated` or `revision` in frontmatter).

**Status mapping:**

| Condition | Status |
|-----------|--------|
| No issues found | PASS |
| Only stale deferred or epic completeness gaps | WARN |
| Orphaned plans, orphaned issues, or partial epics | FAIL |
| Backend not configured | SKIP |

**Output format:**
```
## Issue Board Audit

| Check | Count | Details |
|-------|-------|---------|
| Orphaned plans | N | plan-x.plan.md (no epic) |
| Orphaned issues | N | issue-4 (planRef → nonexistent file) |
| Partial epics | N | epic-2 (3/6 tasks have issues) |
| Stale deferred | N | issue-5 (deferred 26 days) |
| Epic completeness | N | epic-1 (all issues closed, epic open) |
| Plan-spec consistency | N | plan-x (spec modified after plan) |

**Actions:**
- [ ] Close N stale epics
- [ ] Create missing issues for N partial epics
- [ ] Review N orphaned plans
- [ ] Triage N stale deferred issues
```

**Integration with summary table:**
```
| Issue Board Audit | FAIL | 2 orphaned, 1 stale epic |
```
