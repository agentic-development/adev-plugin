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
