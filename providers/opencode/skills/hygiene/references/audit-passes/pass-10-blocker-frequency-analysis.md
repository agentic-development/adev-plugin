## Audit Pass 10: Blocker Frequency Analysis

**Goal:** Identify patterns in agent blockers to proactively improve context.

**Prerequisite check:**

If `.context-index/hygiene/blockers/` does not exist or is empty, SKIP this pass. Print:
```
## Blocker Frequency Analysis

Skipped — no blocker files found. Blockers are filed by subagents during /adev:implement.
```

**Steps (when blocker files exist):**

1. Read all blocker files in `.context-index/hygiene/blockers/`.
2. Count blockers per category and per module.
3. Identify modules with 3+ blockers as HIGH_BLOCKER_RATE.
4. Check if blocked tasks were eventually resolved (corresponding recovery record or validation report exists).
5. Flag unresolved blockers older than 7 days as STALE_BLOCKER.

**Output format:**
```
## Blocker Frequency Analysis

Total blockers: 5

| Category | Count | Resolved | Stale |
|----------|-------|----------|-------|
| MISSING_CONTEXT | 2 | 2 | 0 |
| AMBIGUOUS_SPEC | 2 | 1 | 1 |
| NOVEL_PROBLEM | 1 | 0 | 1 |

### Stale Blockers
- [ ] payments/stripe-webhook.md — AMBIGUOUS_SPEC, 12 days old, unresolved

**Actions:**
- [ ] Resolve stale blocker: clarify stripe webhook spec
- [ ] Review NOVEL_PROBLEM blocker for specialist gap
```
