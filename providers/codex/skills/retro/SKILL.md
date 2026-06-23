---
name: adev:retro
description: "Analyze completed work over a time period to extract lessons, compute delivery metrics, identify improvement opportunities, and update context artifacts. Sprint retrospective for agentic development. Use when the user says 'run a retro', 'what went well', 'review the sprint', 'delivery metrics', or wants to reflect on recent development work. In Codex, invoke with $adev:retro"
---

# Sprint Retrospective

Analyze completed work across a date range to extract patterns, compute delivery metrics, and generate actionable improvement recommendations. The retrospective examines git history, validation reports, recovery records, blocker files, hygiene reports, and plan files to build a comprehensive picture of what happened and what to improve.

**Announce at start:** "I'm using the adev:retro skill to analyze completed work and generate a retrospective."

## Arguments

- `--since <date>`: start date for the analysis period (default: 2 weeks ago from today). Accepts ISO format (YYYY-MM-DD) or relative expressions ("2 weeks ago", "1 month ago").
- `--charter <module>`: scope the retrospective to a specific feature charter module. Only analyzes specs, plans, and validations under `.context-index/specs/features/<module>/`.
- `--auto-apply`: apply low-risk improvements automatically (flag golden sample candidates, flag missing ADR topics, update hygiene report). Does not make destructive changes.

## Prerequisites

The project must have `.context-index/` initialized with at least a `constitution.md` and `manifest.yaml`. If the context index does not exist, suggest running `/adev:init` first.

## Step 1: Gather Data

Collect data from multiple sources within the analysis period. For each source, note what was found and what was empty. Missing sources are not errors; they reduce the analysis scope but do not block the retrospective.

### 1.1 Git History

```bash
git log --oneline --after="<since-date>" --before="<today>" --stat
```

Extract:
- Total commits in period
- Files changed (with change frequency per file)
- Spec references in commit messages (look for patterns like `feat(<module>):`, spec file names, or charter references)
- Authors and their commit counts (if multi-contributor)

### 1.2 Validation Reports

Read `.context-index/specs/features/**/*.validate.md` files. For each validation report:
- Check the `Date` field in the header. Include only reports within the date range.
- Extract the overall status (PASS or FAIL).
- If FAIL, extract which checks failed and the specific failure reasons.
- Note if a spec has multiple validation reports (indicates reruns were needed).

If `--charter <module>` was provided, only read validation reports under `.context-index/specs/features/<module>/`.

### 1.3 Recovery Records

Read files in `.context-index/hygiene/recoveries/` with dates in the analysis range. For each recovery record:
- Extract the root cause category (if categorized)
- Extract the time to resolution
- Extract which spec or task triggered the recovery
- Note the recovery strategy used

If the directory does not exist or is empty, note "No recovery records found" and continue.

### 1.4 Blocker Files

Read files in `.context-index/hygiene/blockers/` with dates in the analysis range. For each blocker:
- Extract what was blocked and why
- Extract how long the blocker persisted (if resolution date is present)
- Extract which spec or module was affected

If the directory does not exist or is empty, note "No blocker records found" and continue.

### 1.5 Hygiene Reports

Read the latest `.context-index/hygiene/drift-report.md`. Extract:
- Overall audit pass/warn/fail counts
- Priority actions listed (especially any that have been open for multiple cycles)
- Any patterns in repeated warnings

### 1.6 Plan Files

Read `.context-index/specs/features/**/*.plan.md` that were executed in the analysis range. Determine execution status by checking:
- Whether a corresponding validation report exists
- Whether all tasks in the plan have commits referencing them
- Whether the plan was fully executed, partially executed, or abandoned

If `--charter <module>` was provided, only read plans under `.context-index/specs/features/<module>/`.

### 1.7 Heuristics

Read heuristics by iterating over module slugs from `manifest.yaml` `modules[].slug` plus `_global`. For each module, call `readHeuristics(projectRoot, { module: slug })` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`, where `<ADEV_ROOT>` is the adev plugin root — derive it from this skill file's base directory by stripping the `skills/<name>/` suffix). Record each entry's `id`, `scope`, `confidence`, `evidence[]` count, `contradicted-by[]` count, `created`, and `updated` dates.

Also scan `.context-index/memory/heuristics/archive/` for recently archived entries (where `archived` date falls within the analysis range). Record their `archivedReason` for the health analysis.

If the heuristics directory does not exist or `readHeuristics` throws, note "No heuristics found" and proceed. The consolidation steps (Heuristic Health in Step 2 and Heuristic Consolidation in Step 3) are skipped when no heuristics are gathered.

### 1.8 Session Activity

When `.context-index/sessions/` exists and the analysis window contains at
least one session file, gather and render Session Activity:

```bash
adev retro session-activity --since <since> --until <until> --format text
```

Capture the rendered markdown and include it verbatim in the Step 1 report,
positioned after § 1.7 (Heuristics) and before § 1.9 (Uncommitted Artifacts).
When the directory is missing or no sessions fall within the analysis
window, the CLI verb emits an empty result and the Session Activity section
is omitted entirely from the report (Graceful absence invariant).

The verb wraps `lib/retro/session-activity.mjs::gatherSessionActivity()`
and produces the six subsections in the documented order: (a) total +
format breakdown line `(hook: N, post-commit: M, unknown: K)`,
(b) Tool-Use Distribution (top 10), (c) Per-Spec Session Counts,
(d) Cost & Token Trends (when any session-end has cost frontmatter),
(e) Sessions ↔ Closed Issues (when any session-end has `issue:`/`epic:`),
and (f) Context Gaps (frame-anchored, top 10).

For deeper analysis without rendering, request `--format json` instead and
post-process the structured result `{ totalSessions, formatBreakdown,
toolUseDistribution, perSpecCounts, costTokens, issueXrefs, contextGaps }`.

### 1.9 Uncommitted Artifacts

Scan the working tree to surface durable artifacts that have been written but never committed. This is distinct from the rest of Step 1, which inspects only committed history — uncommitted artifacts are invisible without an explicit scan.

```bash
git status --short
```

Classify each entry by path pattern into one of two classes:

| Path pattern | Class | Why |
|---|---|---|
| `.context-index/lifecycle-state/*.jsonl` | **durable** | Tracked context layer (CLAUDE.md routing); written by `lib/lifecycle-state.mjs` and `lib/lifecycle-events.mjs` without commit. |
| `.context-index/sessions/*.md` | **durable** | Session-file convention; written by `.githooks/post-commit` after the triggering commit, so always one commit behind. |
| `.spec.md` diff that is *only* `+drift_detected:` / `-drift_detected:` frontmatter changes | **durable** | Spec-drift scanner stamps; written by `lib/spec-drift.mjs` without commit. |
| `.context-index/hygiene/drift-report.md` (modified) | **durable** | Hygiene audit output; expected to be committed. |
| `.claude/scheduled_tasks.lock` | **transient** | Harness operational state. |
| `.context-index/.execution-state.json` | **transient** | Current-run execution state. |
| `.context-index/.context-preflight-ok` | **transient** | Per-session preflight flag (cleared by `hooks/session-start.sh`). |
| `.context-index/.session-tracking.jsonl` | **transient** (project-configurable) | Append-only tracking ledger; size grows monotonically. |

Other paths default to **uncategorized** — list them separately and recommend human review.

To distinguish a drift-only spec diff from a real spec edit, run `git diff <file>` for each `.spec.md` and check whether all `+`/`-` lines match `^[+-]drift_detected:`. If yes, classify as durable drift stamp; otherwise treat as in-progress work (do not flag in the retro — that's the user's WIP).

Record per class: file count, file list (truncate at 10 with "+ N more"), and one-line examples.

If `git status --short` returns no entries, note "Working tree clean" and skip the Uncommitted Artifact Health subsection in Step 2 and the Uncommitted Artifact recommendations in Step 3.

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

## Step 4: Auto-Apply (if --auto-apply)

When `--auto-apply` is passed, apply low-risk improvements that do not modify code or specs. These are informational updates only.

**Actions taken:**

1. **Flag golden sample candidates.** Print the list of candidates and suggest running `/adev:sample` for each. Do NOT extract or create samples automatically.

2. **Flag missing ADR topics.** Print the list of missing ADR topics and suggest running `/adev:brainstorm` to draft them. Do NOT create ADRs automatically.

3. **Update hygiene report.** If `.context-index/hygiene/drift-report.md` exists, append a "Retro Findings" section with the key metrics and top recommendations. This makes retro findings visible to the next `/adev:hygiene` run.

4. **Archive stale heuristics.** For each heuristic whose `updated` date is older than `heuristics.staleness_days` from manifest.yaml (default 90 days), call `archiveHeuristic(projectRoot, id, 'stale')` via inline Node.js (importing from `<ADEV_ROOT>/lib/heuristics.mjs`). Log progress: "Archived N/M stale heuristics". If `archiveHeuristic` throws (e.g., `HEURISTICS_ARCHIVE_CONFLICT`), log a warning per entry and continue.

**Actions NOT taken (require explicit user action):**

- Constitution amendments (too impactful for auto-apply)
- Specialist creation (requires design decisions)
- Spec template changes (affects future specs)
- Any file modifications outside `.context-index/hygiene/`
- Duplicate merging (requires human judgment to determine which entry to keep)
- Heuristic promotion (may indicate a legitimate edge case, not a bug)
- Contradiction resolution (requires domain knowledge)

## Step 5: Write Report

Save the retrospective report to `.context-index/hygiene/retros/<end-date>.md` where `<end-date>` is the last day of the analysis period in YYYY-MM-DD format.

If the `retros/` directory does not exist, create it.

If `--charter <module>` was provided, save to `.context-index/hygiene/retros/<end-date>-<module>.md` instead.

### Report Format

**Persona adaptation:** The report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

```markdown
# Retrospective: <start-date> to <end-date>

> **Period:** YYYY-MM-DD to YYYY-MM-DD
> **Scope:** <all modules | specific charter module>
> **Specs completed:** N
> **Validation pass rate:** N% (first-run)
> **Recoveries:** N (top cause: <category>)
> **Blockers:** N

## Session Activity

<Render the verbatim markdown produced by `adev retro session-activity
--since <since> --until <until> --format text`. Section appears here —
between the period header and Throughput — per Behavior 13 of
retro-session-consumption.spec.md (Stable section position invariant).
Omit this section entirely when the CLI verb's output is empty
(Graceful absence — no sessions in window).>

Subsections rendered by the verb, in order:
  (a) Total + format breakdown line `(hook: N, post-commit: M, unknown: K)`
  (b) Tool-Use Distribution (top 10)
  (c) Per-Spec Session Counts
  (d) Cost & Token Trends (only when at least one session-end has cost frontmatter)
  (e) Sessions ↔ Closed Issues (only when at least one session-end has `issue:`/`epic:`)
  (f) Context Gaps (top 10, frame-anchored — replaces former Step 2 conditional grep)

## Throughput

<specs completed vs planned, completion rate, velocity trend compared to previous period if available>

<partial completions and abandoned plans, if any>

## Quality

<first-run validation pass rate, rerun rate, most common failure checks>

<per-check failure distribution table>

| Check | Failures | Most Common Issue |
|-------|----------|-------------------|
| Quality Gates | N | <issue> |
| Spec Compliance | N | <issue> |
| Charter Consistency | N | <issue> |
| Constitution Compliance | N | <issue> |
| ADR Compliance | N | <issue> |
| Cross-Cutting Specs | N | <issue> |
| Specialist Review | N | <issue> |
| Boundary Compliance | N | <issue> |
| Transition Gates | N | <issue> |

## Recovery Analysis

<total recoveries, root cause distribution, MTTR, repeat offenders>

| Root Cause | Count | Avg MTTR | Affected Modules |
|------------|-------|----------|------------------|
| <category> | N | Xh | <modules> |

## Blocker Analysis

<total blockers, per-spec average, most blocked areas, average duration>

## Scope Drift

<plan adherence percentage, unplanned file count, drift patterns>

## Specialist Effectiveness

<routed vs generic task comparison, quality correlation>

## Heuristic Health

- **Total heuristics:** N (by scope: <scope1>: N, <scope2>: N, _global: N)
- **Confidence distribution:** high: N, medium: N, low: N
- **New in period:** N
- **Stale (>90d):** N (archived: N if --auto-apply)
- **Contradicted:** N
- **Duplicate candidates:** N
- **Promotion anomalies:** N

## Uncommitted Artifacts

- **Durable pending commit:** N (lifecycle-state: M, sessions: K, drift stamps: J, hygiene reports: H)
- **Transient present:** N (recommend gitignore)
- **Uncategorized:** N (human review)

(Section omitted entirely if Step 1.8 reported a clean working tree.)

## Recommendations

### High Priority
- [ ] <recommendation with supporting data reference>
- [ ] <recommendation>

### Medium Priority
- [ ] <recommendation>
- [ ] <recommendation>

### Suggested Improvements
- [ ] <golden sample candidate: file path, N references>
- [ ] <constitution clarification: section, N violations>
- [ ] <missing ADR: topic, commit reference>
- [ ] <spec template addition: criteria type, N specs affected>
- [ ] <specialist gap: domain, N failures>

## Raw Data

<summary statistics table for reference>

| Metric | Value |
|--------|-------|
| Commits | N |
| Files changed | N |
| Specs planned | N |
| Specs completed | N |
| Validation runs | N |
| First-run passes | N |
| Recoveries | N |
| Blockers | N |
```

## Step 6: Present to User

After writing the report, present a concise summary and the top 3 recommendations:

```
Retrospective complete for <start-date> to <end-date>.

Key metrics:
- Specs: N completed of M planned (N% completion rate)
- Quality: N% first-run validation pass rate
- Recoveries: N (top cause: <category>)
- Scope drift: N unplanned files changed

Top 3 recommendations:
1. <highest priority recommendation with one-line rationale>
2. <second recommendation>
3. <third recommendation>

Full report saved to <path to retro file>.

Suggested next actions:
- Review the full report for detailed analysis
- Address high-priority recommendations before the next sprint
- Run /adev:hygiene to verify context health after applying changes
- Schedule the next retrospective in 2 weeks
```

If `--auto-apply` was used, also report what was applied:

```
Auto-applied:
- Flagged N golden sample candidates (run /adev:sample to extract)
- Flagged N missing ADR topics (run /adev:brainstorm to draft)
- Updated drift-report.md with retro findings
```

## Red Flags

**Never:**
- Modify code, specs, or plans during a retrospective (retrospectives are read-only analysis, except `--auto-apply` for hygiene metadata)
- Fabricate metrics when data sources are missing (report "no data" instead of guessing)
- Skip a data source without noting it was skipped
- Generate recommendations without supporting data from the analysis
- Apply constitution amendments or specialist changes via `--auto-apply`
- Overwrite a previous retrospective report (use date-based filenames to preserve history)
- Lump durable framework artifacts (lifecycle-state, sessions, drift stamps, hygiene reports) into a "consider gitignore" recommendation. These have committed homes — the right action is `/adev:reconcile`, not `.gitignore`.
- Treat a `+drift_detected: true` frontmatter diff as a real spec edit. Run `git diff` to distinguish drift stamps from in-progress spec work.
