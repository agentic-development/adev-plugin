## Step 3: Generate Recommendations

Based on the patterns identified in Step 2, generate concrete, actionable improvement recommendations. Each recommendation must reference the specific data that supports it.

### Golden Sample Candidates

Identify files that served as informal references during the period:
- Files read by 3+ different implementation tasks (inferred from git history and plan file references)
- Files in frequently-changed directories that follow patterns other tasks replicated

For each candidate, note: the file path, how many tasks referenced it, and the pattern it represents.

Recommendation: "Add `<file>` as a golden sample with `/adev:sample`. It was used as reference by N tasks this period."

### Constitution Amendments

Identify constitution rules that were violated repeatedly:
- Rules that caused validation failures in 2+ specs
- Architecture boundaries that were crossed with approval (indicating the boundary may be too restrictive or needs clarification)

Recommendation: "Clarify constitution section '<section>' — violated in N validations. Consider whether the rule is too strict or needs better examples."

### Missing ADRs

Identify architectural decisions made during the period that lack formal ADRs:
- New dependencies added (check `package.json`, `requirements.txt`, or equivalent changes)
- New database models or schema changes
- New infrastructure patterns (middleware, auth flows, API versioning changes)
- Significant refactoring that changed module boundaries

Recommendation: "Draft ADR for '<decision>' — implemented in commit <hash> but no ADR exists."

### Spec Template Improvements

If certain acceptance criteria types are repeatedly missed during validation:
- Error handling criteria missing from multiple specs
- Performance criteria absent
- Accessibility criteria overlooked

Recommendation: "Add '<criteria type>' to the spec template — missed in N specs this period."

### Specialist Gaps

If tasks in a particular domain had high failure rates and no specialist exists for that domain:
- Frontend tasks failing accessibility checks with no frontend specialist
- Database tasks causing schema issues with no data-engineering specialist

Recommendation: "Consider creating a '<domain>' specialist — N tasks in this area had validation failures."

### Uncommitted Artifact Recommendations

Emit class-specific recommendations — NEVER lump durable and transient artifacts into a single "consider gitignore" bucket. The distinction is load-bearing.

**Durable artifacts pending commit:** Recommend `/adev:reconcile` (or a manual `git add` + commit) to capture them. Cite the count and the responsible writer per class:

> Recommendation: "Run `/adev:reconcile` to capture N uncommitted durable artifacts: M lifecycle-state events, K session summaries, J drift stamps. Source writers: `lib/lifecycle-state.mjs`, `.githooks/post-commit`, `lib/spec-drift.mjs` — none of these commit their output by design."

If the same durable class shows up across multiple retros (cross-check against the prior retro file), escalate:

> Recommendation: "Durable <class> artifacts have been uncommitted across N consecutive retros. The orchestrating skill is not capturing this writer's output. File an issue against the relevant skill."

**Transient artifacts present:** Recommend `.gitignore` patterns only when the file matches the explicit transient table in Step 1.8:

> Recommendation: "Add `<pattern>` to .gitignore — harness operational state that should never be tracked."

**Uncategorized artifacts:** Surface for human review — DO NOT auto-classify:

> Recommendation: "N uncommitted files do not match the durable/transient classifier patterns. List: <files>. Decide per-file whether they are durable artifacts (commit) or transient (gitignore), and extend the classifier table in `skills/retro/SKILL.md` Step 1.8 if a new durable class emerges."

### Heuristic Consolidation

If heuristics were gathered in Step 1.7:

**Stale heuristics:** For each stale heuristic found in Step 2:

> Recommendation: "Archive stale heuristic '<id>' in scope '<scope>' — last updated <date>, <N> days ago. Reason: staleness."

**Duplicate candidates:** For each pair of duplicate candidates:

> Recommendation: "Merge duplicate heuristics '<id1>' and '<id2>' in scope '<scope>' — both describe: '<shared pattern summary>'. Keep the one with higher evidence count, archive the other with reason 'merged-duplicate'."

**Contradicted heuristics:** For each heuristic with exactly 1 contradiction:

> Recommendation: "Review contradicted heuristic '<id>' — 1 contradiction recorded. A second contradiction will auto-archive it. Verify whether the contradiction is valid."

**Promotion candidates:** For each promotion anomaly:

> Recommendation: "Heuristic '<id>' has <N> evidence entries but confidence is still '<level>'. Expected auto-promotion to '<expected>'. Investigate whether evidence paths are truly distinct."
