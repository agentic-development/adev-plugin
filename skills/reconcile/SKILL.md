---
name: adev:reconcile
description: "Interactive repair for lifecycle mismatches. Detects orphaned artifacts, stale epics, untraced code, and missing issues, then offers targeted fixes. Use when hygiene or status reveals inconsistencies, or when the user says 'reconcile', 'fix mismatches', 'clean up lifecycle', 'retroactive stamping', 'close stale epics'."
---

# Lifecycle Reconciliation

Interactive repair for mismatches between specs, plans, the issue board, and code provenance. Reads detection results from `/adev:hygiene` and `/adev:status`, then offers targeted fixes for each finding.

**Announce at start:** "I'm using the adev:reconcile skill to detect and repair lifecycle mismatches."

## Arguments

- No arguments: full reconciliation scan (all checks)
- `--check <type>`: run a single check (epics, plans, issues, manifests, untraced, lifecycle-sync)
- `--batch`: apply fixes without confirmation prompts (use with caution)
- `--dry-run`: show what would be fixed without making changes
- `--fix`: apply all detected fixes automatically without per-item confirmation (this is the **default behavior** post-`check-set-restructure.spec.md`)
- `--no-fix`: report-only mode — show findings without applying any fixes (opposite of the new default; preserves the historical "scan first, then ask" workflow for users who want it)

## Prerequisites

1. `.context-index/` must exist with `manifest.yaml`.
2. `tasks.backend` must be configured for issue board operations.
3. If a recent hygiene report exists at `.context-index/hygiene/drift-report.md`, read it for pre-computed findings. Otherwise, run detection inline.

## Process

**Default mode:** `--fix` (applies fixes automatically). Pass `--no-fix` for a report-only run. This default was flipped as part of `check-set-restructure.spec.md` so that `/adev:reconcile` is the authoritative repair tool for lifecycle drift (the previous validate-time Check 12 only warned; it never fixed). User-facing prompts still appear interactively unless `--batch` or `--no-fix` is passed.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill reconcile
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

### Step 1: Detection Scan

Run each detection check and collect findings:

#### 1a. Stale Epics
Find epics where ALL child issues are `closed` but the epic status is still `open`.

**Reality verification before closing:** For each child issue with a `spec_ref` or `plan_ref`, run `verifyIssueCompleted()` from `lib/reality-check.mjs` via inline Node.js. If ANY child issue returns `confidence: "none"` (status claims closed but no codebase evidence), flag instead of offering to close:
```
⚠ Epic <id> has children marked closed but issue <child-id> has no codebase evidence (confidence: none).
  Investigate before closing — implementation may have been reverted or never committed.
```
Only offer to close when all verified children have `confidence >= "medium"`.

If `lib/reality-check.mjs` fails to import, proceed without verification (fall back to metadata-only check).

**Fix offered:** "Close the epic? (verified: all children at medium+ confidence)"
**Action:** `updateEpic(epicId, { status: 'closed', notes: formatConfidenceNote('Reconciled', confidence, {}) })`

#### 1b. Unplanned Specs
Find specs with status `review-passed` that have no sibling `.plan.md` file.

**Fix offered:** "Create a plan? → invoke `/adev:plan`"
**Action:** Invoke `/adev:plan` on the spec (interactive, not batch-safe).

#### 1c. Per-Task Issues to Collapse
Find epics or features that violate the board-granularity invariant — Issues that carry both `planRef` and `planTask` (the legacy per-task issue pattern). These should be collapsed and their state migrated to `plan_task` events in the lifecycle log.

**Fix offered:** "Collapse per-task issues for {epicId} into lifecycle log events?"
**Action:** Invoke the `collapse-per-task-issues` operation (defined in `issue-board-granularity-cleanup.spec.md`): for each per-task issue, emit a matching `reportPlanTask` event with the issue's status, then `close()` the issue with reason `"Migrated to lifecycle log per board-granularity invariant"`. Post-migration invariant: no Issue carries both `planRef` and `planTask`.

#### 1d. Orphaned Issues
Find issues whose `planRef` points to a file that no longer exists.

**Reality verification before closing:** For each orphaned issue that has a `spec_ref`, run `verifySpecImplemented()` from `lib/reality-check.mjs`. If the spec's implementation IS found in the codebase (confidence: medium or high), the issue may not be truly orphaned — the plan file may have been moved or renamed. Flag for manual review instead of auto-closing:
```
⚠ Issue <id> has orphaned planRef but spec implementation exists (confidence: <level>).
  Plan may have been moved. Verify before closing.
```
Only offer to close when `verifySpecImplemented` returns `confidence: "none"` or `"low"` (no implementation evidence).

If `lib/reality-check.mjs` fails to import, proceed without verification.

**Fix offered:** "Close as obsolete? (verified: no implementation found)"
**Action:** `close(id, 'Closed by reconcile: planRef points to nonexistent file')`

#### 1e. Orphaned Plans
Find `.plan.md` files that have no corresponding epic on the issue board.

**Fix offered:** "Create an epic for this plan and seed plan-task events?"
**Action:** Run `adev issues create "<plan title>" --type epic --plan-ref "<plan-file-path>"` to create the epic at board-level granularity (never the backend binary directly — the verb resolves the storage root from the git common dir, so it works from a linked worktree, where a raw `br` call fails with `SYNC_CONFLICT`). Then call `reportPlanTask(projectRoot, specPath, { taskNumber, title, status: "pending" })` once per plan task to seed the lifecycle log's plan-task channel. Do NOT call `create({ planRef, planTask })` — per-task issues are forbidden by the board-granularity invariant.

#### 1f. Untraced Code
Find source files with no lifecycle trailers on any commit (post-pipeline only).

**Fix offered per file:**
- "Create a spec for this file?" → invoke `/adev:specify --extract <file>`
- "Mark as intentionally untracked?" → no action (acknowledge only)

#### 1g. Missing Source Manifests
Find specs with status `implemented` or `validated` that have no `source-manifest` in frontmatter.

**Fix offered:** "Stamp source manifest retroactively?"
**Action:** If the spec has a `.plan.md` with file lists, collect those files. If they exist, run `computeManifest()` and stamp the result in the spec frontmatter.

**Batch prioritization:** Process specs that have existing `.plan.md` files first (29 specs). Specs without plans require heuristic file matching and should be reviewed individually.

#### 1h. Lifecycle Sync

Detect spec-status, charter-capability, and epic-status drift relative to the lifecycle event log. This is the equivalent of former `/adev:validate` Check 12 (relocated by `check-set-restructure.spec.md`), now running in its proper home at reconcile-time rather than per-spec validate-time. Lifecycle reconciliation belongs here because the data is repo-level (one answer per repo), not per-spec, so emitting it from validate produced 49% WARN noise without verdict signal.

**What to check:**
- Spec `status` frontmatter vs lifecycle log `currentStep` — flag mismatches (e.g., spec says `implemented` but log shows no `implement` completed event; or spec says `review-passed` but `validate` already completed with PASS).
- Charter capability `Status` column vs lifecycle log per-spec state — flag capabilities listed as `planned` or `implementing` when all contributing specs are `validated`.
- Plan-task projection drift — flag plans whose `currentState(spec).planTasks` projection has tasks marked `pending` long past the implement event's completion timestamp (only inform; never auto-flip).
- Epic `status` on issue board vs child issue states — already covered by 1a (Stale Epics).

**Fix offered (`--fix` mode, default):** Update spec frontmatter `status` field to match lifecycle log. Update charter capability Status column. For plan-task reconciliation, emit a `reportPlanTask` event via `lib/lifecycle-state.mjs` — do NOT write `- [x]` markdown checkbox state into plan files (plan files are immutable post-authoring per `plan-task-events.spec.md`; the authoritative state lives in the lifecycle log projection).

**Fix offered (`--no-fix` mode):** Print WARN for each mismatch with the correct value side-by-side, so the operator can decide whether to apply manually.

**Structural equivalence with historic Check 12 output:** Each finding from this section carries the same fields a Check 12 WARN body previously carried (path, severity, message, evidence) so users moving between historic `.validate.md` reports and new reconcile output can map between them without information loss. This satisfies the spec's "destinations preserve structural shape" invariant.

**Prompt:** "Sync lifecycle for {spec}?" with options `[Y/n]` in default `--fix` mode; suppressed in `--batch`; printed as informational rows in `--no-fix`.

### Step 2: Present and Fix — One Category at a Time

Start with a one-line summary, then walk through each category sequentially. Present all items in a category as a numbered table, then prompt for each item individually. Apply fixes immediately after each confirmation before moving to the next item.

```
=== Lifecycle Reconciliation ===

Found N mismatches across M categories.
Walking through each category now.
```

**For each category that has findings:**

1. Print the category header and a table of all items in that category.
2. Prompt for each item one at a time (using the item's row number).
3. Apply the fix immediately on confirmation and report the result inline.
4. After all items in the category are handled, print a brief tally and move to the next category.

**Category presentation format:**

```
---
1a. Stale Epics (2)

┌───┬──────┬─────────────────────────┬──────────────┐
│ # │ Epic │ Title                   │ Children     │
├───┼──────┼─────────────────────────┼──────────────┤
│ 1 │ dqx  │ Session Orchestration   │ 4/4 closed   │
├───┼──────┼─────────────────────────┼──────────────┤
│ 2 │ z2b  │ LS-006 Integration      │ 13/13 closed │
└───┴──────┴─────────────────────────┴──────────────┘

→ Close dqx? [Y/n]
  ✓ Closed.
→ Close z2b? [Y/n]
  ✓ Closed.

Stale Epics: 2 fixed, 0 skipped.
```

**Prompt styles per category:**

| Category | Prompt | Options |
|---|---|---|
| Stale Epics | "Close {id}?" | `[Y/n]` |
| Unplanned Specs | "Plan {spec}?" | `[Y/n/skip]` — skip acknowledges without action |
| Partial Epics | "Create {N} missing issues for {epicId}?" | `[Y/n]` |
| Orphaned Issues | "Close {id} as obsolete?" | `[Y/n]` |
| Orphaned Plans | "Create epic + issues for {plan}?" | `[Y/n]` |
| Untraced Code | "Create spec for {file}?" | `[Y/n/ignore]` — ignore marks as intentional |
| Missing Source Manifests | "Stamp manifest for {spec}?" | `[Y/n]` |
| Lifecycle Sync | "Sync lifecycle for {spec}?" | `[Y/n]` — `--fix` default applies; `--no-fix` prints WARN rows |

**Skip empty categories entirely** — do not print headers for categories with zero findings.

**Numbering is continuous across categories** (item 1-2 in stale epics, 3-6 in unplanned specs, etc.) so the user can refer back to items by number.

### Step 3: Summary

```
=== Reconciliation Complete ===

Applied: N fixes
Skipped: M (user declined)
Failed: K (see errors above)

Changes:
  - Closed N stale epics
  - Created N missing issues
  - Closed N orphaned issues
  - Stamped N source manifests
  - Created N specs for untraced code

Remaining:
  - N unplanned specs (declined — run /adev:plan manually)
  - N untraced files (marked as intentional)
```

## Key Principles

- **Interactive by default.** Each fix requires user confirmation unless `--batch` is used.
- **Non-destructive.** Reconciliation never deletes files. It closes issues, creates artifacts, and stamps manifests.
- **Verify before closing.** Before auto-closing any issue or epic, verify the implementation exists in the codebase using `lib/reality-check.mjs`. Only close at medium+ confidence. Low/none confidence → flag for manual review.
- **Idempotent.** Running reconciliation twice with the same findings produces the same result.
- **Detection before repair.** Always scan first, present findings, then fix. Never fix without showing what will change.
- **Backend agnostic.** Works with any configured `tasks.backend`.

## Red Flags

**Never:**
- Delete spec files, plan files, or source code
- Modify code to match specs (that's `/adev:implement`)
- Create per-task issues (`create({ planRef, planTask })`) — board granularity is epic / feature / bug only; plan-task state lives in the lifecycle log
- Close issues that have unclosed dependencies
- Run `/adev:plan` in batch mode (planning requires review)
- Stamp a source manifest without verifying files exist

## API reference

Issue board (the reconciliation operations call into the manager, never the on-disk JSON directly):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Lifecycle event log (plan-task channel migration during `collapse-per-task-issues`):

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection.
- `reportPlanTask(projectRoot, specPath, { taskNumber, title, status })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emit a `plan_task` event to migrate per-task issue state into the lifecycle log.
- `appendEvent(projectRoot, specPath, event)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — low-level append. Reserved for explicit repair workflows that need to backfill a specific event variant; prefer the convenience writers (`reportPlanTask`, `reportReviewer`, etc.) wherever possible.

Reality check helpers:

- `verifyIssueCompleted(issueId, options)` and `verifySpecImplemented(specPath, options)` from `<ADEV_ROOT>/lib/reality-check.mjs` — confidence scoring before auto-closing or marking obsolete.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
