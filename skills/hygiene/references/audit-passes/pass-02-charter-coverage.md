## Audit Pass 2: Charter Coverage

**Goal:** Identify which codebase areas have charters and which are uncharted territory. Prioritize by git change frequency.

**Steps:**

1. List all feature charter directories under `.context-index/specs/features/`.
2. Map each charter to its corresponding codebase area:
   - Read each charter's scope section for directory/file references.
   - If no explicit scope, infer from the module name.
3. Identify source directories that are NOT covered by any charter.
4. For uncharted areas, check git change frequency:
   ```bash
   git log --oneline --since="30 days ago" -- <directory> | wc -l
   ```
5. Rank uncharted areas by change frequency (high-churn areas need charters first).
6. Check that each charter has been updated within the last 90 days. Flag stale charters.

**Output format:**
```
## Charter Coverage

Chartered areas: 3
Uncharted areas: 5

### High Priority (high churn, no charter)
- [ ] src/lib/auth/ — 42 changes in 30 days, no charter
- [ ] src/app/api/ — 38 changes in 30 days, no charter

### Medium Priority (moderate churn, no charter)
- [ ] src/lib/payments/ — 12 changes in 30 days, no charter

### Low Priority (low churn, no charter)
- [ ] prisma/ — 5 changes in 30 days, no charter
- [ ] scripts/ — 2 changes in 30 days, no charter

### Stale Charters
- [ ] task-boards/charter.md — last updated 120 days ago, source changed 15 times since

**Actions:**
- [ ] Run `/adev:brainstorm` for src/lib/auth/ (highest churn without charter)
- [ ] Review task-boards charter for staleness
```
