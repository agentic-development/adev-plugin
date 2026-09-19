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
