## Audit Pass 9: Recovery Pattern Analysis

**Goal:** Identify systemic context gaps from recovery records.

**Prerequisite check:**

If `.context-index/hygiene/recoveries/` does not exist or is empty, SKIP this pass. Print:
```
## Recovery Pattern Analysis

Skipped — no recovery records found. Records are created by /adev:recover.
```

**Steps (when recovery records exist):**

1. Read all recovery records in `.context-index/hygiene/recoveries/`.
2. Compute root cause distribution (count per category: MISSING_CONTEXT, AMBIGUOUS_SPEC, CONSTRAINT_CONFLICT, NOVEL_PROBLEM, TOOL_FAILURE, BUDGET_EXHAUSTION).
3. Identify repeat offenders: same root cause in the same module more than once.
4. Compute Mean Time to Recovery (MTTU) across all records.
5. Flag modules with 3+ recoveries as HIGH_RECOVERY_RATE.
6. If MISSING_CONTEXT is the top category, list which context types were missing (ADR, sample, cross-cutting spec) and suggest additions.

**Output format:**
```
## Recovery Pattern Analysis

Total recoveries: 7 (last 90 days)

| Root Cause | Count | Avg MTTU |
|-----------|-------|---------|
| MISSING_CONTEXT | 3 | 8m |
| AMBIGUOUS_SPEC | 2 | 15m |
| NOVEL_PROBLEM | 1 | 22m |
| TOOL_FAILURE | 1 | 5m |

### Repeat Offenders
- [ ] auth module: 2x MISSING_CONTEXT (missing ADR for session storage)
- [ ] payments module: 2x AMBIGUOUS_SPEC (unclear error handling)

**Actions:**
- [ ] Draft ADR for session storage (would prevent 2 recoveries)
- [ ] Clarify error handling spec in payments charter
```
