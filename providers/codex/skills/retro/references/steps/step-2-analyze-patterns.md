## Step 2: Analyze Patterns

Compute metrics and identify patterns from the gathered data.

### Throughput

- **Specs completed vs. planned:** Count specs that have a PASS validation report in the period vs. specs that have plan files created in the period.
- **Completion rate:** (completed specs / planned specs) as a percentage.
- **Velocity trend:** If previous retrospective reports exist in `.context-index/hygiene/retros/`, compare current throughput against the last 1-2 periods.
- **Partial completions:** Specs where some but not all tasks were implemented.

### Quality

- **First-run validation pass rate:** Of all validation runs, what percentage passed on the first attempt?
- **Rerun rate:** How many specs required 2+ validation cycles?
- **Common failure checks:** Which of the 9 validation checks failed most often? (e.g., Check 2: Spec Compliance, Check 4: Constitution Compliance)
- **Auto-fix rate:** If `--fix` was used in validations, how often did auto-fix resolve the issue vs. requiring manual intervention?

### Recovery Patterns

- **Total recoveries:** Count of recovery records in the period.
- **Root cause distribution:** Group recoveries by root cause category. Identify the most common cause.
- **Mean time to recovery (MTTR):** Average time from recovery trigger to resolution.
- **Repeat offenders:** Files or modules that triggered multiple recoveries.

### Blocker Frequency

- **Total blockers:** Count of blocker files in the period.
- **Blockers per spec:** Average blockers encountered per spec under development.
- **Most blocked areas:** Modules or components with the highest blocker count.
- **Blocker duration:** Average time from blocker creation to resolution.

### Review Revision History

For each spec touched in the period, read `currentState(spec).steps.review.byRevision` (the per-revision projection from `lib/lifecycle-state.mjs` Task 3 of review-block-auto-retry). Render the revision history:

- **Total revisions per spec:** Count of `byRevision[N]` entries. A value > 1 indicates the BLOCK→revise auto-retry loop ran.
- **Final verdict:** The verdict on the latest revision (PASS / PASS_WITH_NOTES / FAIL).
- **Convergence pattern:** Did the loop converge on PASS within budget, or did it terminate at NO_PROGRESS / REGRESSED / BUDGET_EXHAUSTED (read from `state.specRevisions` for `spec_revised` events)?
- **Specs requiring `--require-human-final-pass`:** Specs with `human_approval_required` events in their lifecycle log (`state.humanApprovalsRequired`). These are domain hotspots where human sign-off was deemed necessary.

Convergence patterns inform whether reviewer prompts or blocker categories need refinement. A high rate of NO_PROGRESS terminations suggests the reviewer is stuck in a local minimum and the spec template / reviewer prompt may need additional guidance.


### Specialist Effectiveness

- **Specialist-routed vs. generic tasks:** Of all tasks in executed plans, how many had specialist tags vs. `[specialist: none]`?
- **Specialist task quality:** Compare validation pass rates for specialist-routed tasks vs. generic tasks. Did specialist routing correlate with fewer validation failures?
- **Missing specialist coverage:** Tasks that failed validation in domain-specific checks (Check 7) but had no specialist tag.

### Scope Drift

- **Plan adherence:** For each executed plan, compare the files listed in the plan's "File Structure" section against the files actually changed in commits.
- **Unplanned files:** Files changed that were not listed in any plan. High counts indicate scope creep or incomplete planning.
- **Plan accuracy:** Percentage of planned files that were actually touched vs. files touched that were not planned.

### Heuristic Health

If heuristics were gathered in Step 1.7, compute:

- **Total heuristics** by scope and confidence level
- **New heuristics in period:** entries whose `created` date falls within the analysis range
- **Stale heuristics:** entries whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days)
- **Contradicted heuristics:** entries with 1+ items in `contradicted-by[]`
- **Duplicate candidates:** entries within the same scope whose `title` or `pattern` text has high semantic overlap (look for entries describing the same lesson in different words)
- **Promotion candidates:** entries with 2+ distinct-path evidence entries that remain at `low` confidence, or 3+ at `medium` (should have been auto-promoted — may indicate a store bug)

### Uncommitted Artifact Health

If Step 1.8 surfaced any entries, summarize:

- **Durable artifacts pending commit:** total count, broken down by class (lifecycle-state, sessions, drift stamps, hygiene report).
- **Transient artifacts present:** total count of files that should be gitignored.
- **Uncategorized artifacts:** total count of files that the classifier could not place.

A non-zero durable count indicates a **missed-commit pattern** — some skill ran, produced an artifact, and the calling orchestrator (or follow-up step) did not commit it. Do not infer "transient junk" or "user WIP" from durable-class hits — these are framework artifacts whose canonical home is git.

If only transient artifacts are present, the working tree is clean from the framework's perspective — recommend gitignore patterns but do not treat it as a sprint-quality signal.
