---
name: adev:reconcile
description: "Interactive repair for lifecycle mismatches. Detects orphaned artifacts, stale epics, untraced code, and missing issues, then offers targeted fixes. Use when hygiene or status reveals inconsistencies, or when the user says 'reconcile', 'fix mismatches', 'clean up lifecycle', 'retroactive stamping', 'close stale epics'."
---

# Lifecycle Reconciliation

Interactive repair for mismatches between specs, plans, the issue board, and code provenance. Reads detection results from `/adev:hygiene` and `/adev:status`, then offers targeted fixes for each finding.

**Announce at start:** "I'm using the adev:reconcile skill to detect and repair lifecycle mismatches."

## Arguments

- No arguments: full reconciliation scan (all checks)
- `--check <type>`: run a single check (epics, plans, issues, manifests, untraced)
- `--batch`: apply fixes without confirmation prompts (use with caution)
- `--dry-run`: show what would be fixed without making changes

## Prerequisites

1. `.context-index/` must exist with `manifest.yaml`.
2. `tasks.backend` must be configured for issue board operations.
3. If a recent hygiene report exists at `.context-index/hygiene/drift-report.md`, read it for pre-computed findings. Otherwise, run detection inline.

## Process

### Step 1: Detection Scan

Run each detection check and collect findings:

#### 1a. Stale Epics
Find epics where ALL child issues are `closed` but the epic status is still `open`.

**Fix offered:** "Close the epic?"
**Action:** `updateEpic(epicId, { status: 'closed' })`

#### 1b. Unplanned Specs
Find specs with status `review-passed` that have no sibling `.plan.md` file.

**Fix offered:** "Create a plan? → invoke `/adev:plan`"
**Action:** Invoke `/adev:plan` on the spec (interactive, not batch-safe).

#### 1c. Partial Epics
Find epics where the number of child issues doesn't match the plan's task count.

**Fix offered:** "Create missing issues?"
**Action:** Read the plan, identify tasks without issues, create issues via `create()` on the adapter.

#### 1d. Orphaned Issues
Find issues whose `planRef` points to a file that no longer exists.

**Fix offered:** "Close as obsolete?"
**Action:** `close(id, 'Closed by reconcile: planRef points to nonexistent file')`

#### 1e. Orphaned Plans
Find `.plan.md` files that have no corresponding epic on the issue board.

**Fix offered:** "Create an epic and issues for this plan?"
**Action:** Create epic with `createEpic({ title, planRef })`, then create issues for each task.

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

### Step 2: Present Findings

Display all findings grouped by type:

```
=== Lifecycle Reconciliation ===

Found N mismatches across M categories:

Stale Epics (N):
  epic-1: Auth Implementation — all 3 issues closed, epic still open
    → Fix: Close the epic? [Y/n]

Unplanned Specs (N):
  auth/session-mgmt.md — review-passed, no plan
    → Fix: Run /adev:plan? [Y/n]

Orphaned Issues (N):
  issue-4: planRef → dashboard/nonexistent.plan.md (file missing)
    → Fix: Close as obsolete? [Y/n]

Missing Source Manifests (N):
  auth/login.md — status: validated, no source-manifest
    → Fix: Stamp manifest from plan file list? [Y/n]

Untraced Code (N):
  lib/orphan.mjs — no lifecycle trailers, matches SSO capability (auth charter, v2)
    → Fix: Create spec? Mark as intentional? [S/m/skip]
```

### Step 3: Apply Fixes

For each confirmed fix:
1. Execute the action.
2. Report the result.
3. If a fix fails, log the error and continue to the next finding.

### Step 4: Summary

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
- **Idempotent.** Running reconciliation twice with the same findings produces the same result.
- **Detection before repair.** Always scan first, present findings, then fix. Never fix without showing what will change.
- **Backend agnostic.** Works with any configured `tasks.backend`.

## Red Flags

**Never:**
- Delete spec files, plan files, or source code
- Modify code to match specs (that's `/adev:implement`)
- Create issues without a plan (issues need `planRef` and `planTask`)
- Close issues that have unclosed dependencies
- Run `/adev:plan` in batch mode (planning requires review)
- Stamp a source manifest without verifying files exist
