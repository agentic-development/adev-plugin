## Audit Pass 13: Code Health

**Goal:** Detect dead exports, orphan files, unused dependencies, stale code, and duplicate logic in source code by dispatching `/adev:codehealth`.

**Prerequisite check:** Verify `symbol-ranks.json`/`dependency-graph.json` exist AND `dependency-graph.json`'s `commit` is <50 commits behind HEAD (Pass 5's threshold, issue-u1jtc0). Either failing → SKIP; do not invoke codehealth:

```
| Code Health | SKIP | Repomap artifacts not found/stale — run `/adev:repomap` |
```

**Steps:**

1. Invoke `/adev:codehealth` with no filters (full scan).
2. Read the generated report at `.context-index/reports/codehealth-<YYYY-MM-DD>.md`.
3. Parse the frontmatter `summary` to extract finding counts by severity.

**Status mapping:**

| Condition | Status |
|-----------|--------|
| Zero findings | PASS |
| All findings are low severity | WARN |
| Any medium or high severity findings | FAIL |
| Repomap artifacts missing | SKIP |
| `/adev:codehealth` errors | FAIL |

**Output format:**
```
## Code Health

Dispatched `/adev:codehealth` — full scan.

Findings: N high, N medium, N low

**Actions:**
- [ ] Review full report at `.context-index/reports/codehealth-<date>.md`
- [ ] Run `/adev:specify --refactor` for high-severity clusters
```

**Integration with summary table:** Add a row for Code Health in the report summary:
```
| Code Health | WARN | 2 high, 3 medium, 1 low |
```
