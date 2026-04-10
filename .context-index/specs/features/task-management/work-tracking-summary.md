---
type: research-summary
title: Work Tracking Research — Executive Summary & Implementation Plan
status: draft
created: 2026-04-10
parent: work-tracking-gaps-research.md
---

# Work Tracking Research — Executive Summary & Implementation Plan

## The Problem

Work gets lost in the adev lifecycle because:

1. **Forward tracking is strong, backward auditing is nonexistent.** Specs flow to plans to issues to code, but nobody checks the reverse — code that was written without specs, issues without plans, specs without issues.

2. **Code drifts outside the lifecycle.** Agents frequently write code directly without following brainstorm→specify→review→plan→implement→validate. When this happens, all top-down artifacts (specs, plans, issues) become stale. ~50% of specs have no plan file, 3 epics have all issues closed but are still marked open.

3. **The backlog is scattered across 7+ artifact types.** Deferred work lives in charter "Out of Scope" sections, v2 capability map entries, unplanned specs, open issues, draft specs, untraced code files, and hygiene findings — with no aggregation.

4. **No way to answer "what's left?" in one command.** Finding unfinished work requires manually scanning charters, specs, plans, the issue board, and git history across different skills and formats.

## The Core Insight

**Git history is the only artifact that can never go stale.** Every line of code permanently knows which commit created it. If commits carry lifecycle metadata (trailers), the provenance chain is embedded in immutable history. Commits *without* trailers are the signal for lifecycle bypass — no heuristics needed.

The existing `prepare-commit-msg` hook already injects `Spec:`, `Plan-task:`, and `Session:` trailers — but it's inactive because `core.hooksPath` isn't configured. The infrastructure is 80% built.

## What We Propose: 9 Improvements

### Foundation Layer (CRITICAL)

**1. Activate the trailer pipeline + commit-msg enforcement**

Close the full provenance chain: `file:line → git blame → commit → trailers → session → issue → spec → charter`

- Fix `core.hooksPath` in `/adev:init` so existing git hooks actually fire
- Enrich `session-capture.sh` JSONL with `issue`/`epic` fields (read from `.execution-state.md`)
- Add `Issue:` trailer to `prepare-commit-msg` (extracted from enriched JSONL)
- Add `Author-type:` trailer (`agent/claude-code`, `agent/codex`, `human` — based on `session_id` presence)
- Add `commit-msg` validation hook with **selective blocking**: files claimed by a source manifest require a `Spec:` trailer; unclaimed files pass through with `Lifecycle: untracked` marker
- Every commit in history becomes self-classifying: lifecycle-tracked or explicitly untracked

Full trailer set for a lifecycle-tracked commit:
```
Spec: .context-index/specs/features/task-management/lifecycle-integration.md
Plan-task: 3
Session: 2026-04-06T18:11-a1b2c3d
Issue: issue-15
Author-type: agent/claude-code
```

**Lifecycle to implement:** Modify existing hooks (no new skills needed). Changes to `session-capture.sh`, `.githooks/prepare-commit-msg`, and `cli/index.mjs`. Add new `.githooks/commit-msg` script. Use `/adev:specify` for the commit-msg hook behavioral contract, then direct implementation.

**2. Reverse file→spec index**

`buildReverseIndex()` function in `lib/source-manifest.mjs` — scans all spec frontmatter, builds a `{file → spec}` Map on demand. Needed by the commit-msg hook (to check if staged files are manifest-claimed), provenance audit, and all `--file`, `--issue`, `--spec` queries.

**Lifecycle to implement:** Small library addition. `/adev:specify` → `/adev:plan` → `/adev:implement` → `/adev:validate`. Tests with `node:test`.

### Detection Layer (HIGH)

**3. Code Provenance hygiene pass (new Pass 14)**

Scans source files and classifies them by git provenance:
- **Fully traced**: all commits have `Spec:` + `Plan-task:` trailers
- **Partially traced**: some commits have trailers, later ones don't (post-implementation drift)
- **Untraced**: no commits have lifecycle trailers (written entirely outside lifecycle)

Cross-references untraced files against charter capability keywords to flag potential matches with deferred/v2 capabilities.

**Lifecycle to implement:** Enhancement to existing skill. Modify `skills/hygiene/SKILL.md` directly (skill is markdown — autonomous update per constitution). No new spec needed for adding a hygiene pass.

**4. Enhanced `/adev:status` with new query modes**

Add to the existing `/adev:status` skill:

| Mode | What it shows |
|------|--------------|
| `--issue <id>` | Issue → plan task → spec → commits → files → drift status → post-close changes |
| `--epic <id>` | All issues in epic, which have code behind them, which are paper |
| `--file <path>` | File → reverse index → spec → issue → commits → drift |
| `--backlog` | Aggregated backlog from all 7+ sources, prioritized |
| `--phase <name>` | All capabilities in that phase across all charters, with spec/plan/issue/code status |
| `--all` (enhanced) | Add: issue board summary, deferred work, stale items, unplanned specs, epic completeness, code provenance counts |

**Lifecycle to implement:** Enhancement to existing skill. `/adev:specify` for the new modes → `/adev:review-specs` → update `skills/status/SKILL.md` (skill is markdown). Companion code for issue board queries and provenance lookups may need `lib/` additions.

**5. Issue Board Audit hygiene pass (new Pass 15)**

Cross-references specs, plans, and the issue board:
- Orphaned plans (no epic on board)
- Orphaned issues (planRef points to deleted file)
- Partial epics (issue count ≠ plan task count)
- Stale deferred (deferred > 14 days, no update)
- Epic completeness (all issues closed but epic still open)
- Plan-spec consistency (spec modified after plan was created)

**Lifecycle to implement:** Same as #3 — modify `skills/hygiene/SKILL.md` directly.

**6. Structured Deferred Capabilities table in charter template**

Add a `## Deferred Capabilities` table to the charter template (like the Capability Map but for explicitly deferred items). Makes backlog extraction reliable vs parsing free-text "Out of Scope" sections.

```markdown
## Deferred Capabilities

| Capability | Reason | Target Phase | Depends On |
|-----------|--------|-------------|------------|
| Orientation migration | Low priority, manual workaround exists | Phase 2 | — |
| Incremental updates | Requires diff engine | Phase 3 | Phase 2 migration |
```

**Lifecycle to implement:** Template update + charter migration. Update `templates/charter-template.md` (autonomous per constitution). For existing charters, either migrate manually or use `/adev:reconcile` to extract from Out of Scope sections.

### Repair Layer (MEDIUM)

**7. `/adev:reconcile` skill**

Interactive repair for mismatches found by hygiene and status:

| Detection | Fix offered |
|-----------|------------|
| Spec at `review-passed` with no plan | "Create a plan?" → invoke `/adev:plan` |
| Plan has 6 tasks but only 4 issues | "Create missing issues?" |
| Issue's `planRef` points to deleted spec | "Close as obsolete?" |
| All issues in epic closed, epic still open | "Close the epic?" |
| Untraced code files | "Create specs or mark as intentionally untracked?" |
| Code matches plan file structure but no source manifest | "Stamp manifest retroactively?" |

**Lifecycle to implement:** New skill. Requires human approval (adding new skill to lifecycle order, per constitution). Full lifecycle: `/adev:brainstorm` → `/adev:specify` → `/adev:review-specs` → `/adev:plan` → `/adev:implement` → `/adev:validate`.

**8. Implementation probe in `/adev:implement`**

Before dispatching a subagent for a task, check if target files already exist and tests pass. If they do → mark issue as closed with "Already implemented" instead of re-doing work.

**Lifecycle to implement:** Enhancement to existing skill. Modify `skills/implement/SKILL.md` (autonomous update). No new spec needed.

**9. Feature completeness DoD in `/adev:implement`**

At end of implementation, verify:
- All epic issues closed
- Source manifest stamped on spec
- Spec status updated to `implemented`
- Charter capability status updated
- Epic closed if all issues done

**Lifecycle to implement:** Same as #8 — modify `skills/implement/SKILL.md` directly.

## Implementation Order

```
Phase 1: Foundation (enables everything else)
  ├── #1 Trailer pipeline + commit-msg hook
  └── #2 Reverse file→spec index (buildReverseIndex)

Phase 2: Detection (uses foundation to surface problems)
  ├── #3 Code Provenance hygiene pass
  ├── #4 Enhanced /adev:status (new modes)
  ├── #5 Issue Board Audit hygiene pass
  └── #6 Structured Deferred Capabilities in charters

Phase 3: Repair (uses detection to fix problems)
  ├── #7 /adev:reconcile skill
  ├── #8 Implementation probe
  └── #9 Feature completeness DoD
```

### What requires human approval (per constitution)

- **#7 `/adev:reconcile`**: New skill added to lifecycle → requires human approval
- **#1 `commit-msg` hook**: Changes hook protocol (adds blocking behavior) → requires human approval
- **#6 Charter template change**: Modifying template format → autonomous, but migrating existing charters should be reviewed

### What can be done autonomously

- **#2, #3, #4, #5, #8, #9**: All are modifications to existing skills, library code, or hygiene passes — autonomous per constitution
- **#1 partially**: Adding trailers to existing `prepare-commit-msg` and enriching JSONL are autonomous; the new blocking `commit-msg` hook needs approval

## Scenario Coverage Matrix

| Scenario | Description | Covered by |
|----------|-------------|------------|
| A | Full lifecycle (brainstorm → validate) | #1 (trailers flow automatically) |
| B | Code changes without following process | #1 (selective blocking + untracked marker), #3 (provenance audit) |
| C | Verify if code follows specs | #2 (reverse index), #3 (provenance audit), #4 (`--spec` enhanced) |
| D | Find missing/deferred/v2 work vs codebase | #4 (`--backlog`, `--phase`), #6 (structured deferred table), #3 (cross-ref untraced files) |
| E | Implementation status when code is ahead | #8 (implementation probe), #7 (retroactive manifest stamping), #2 (reverse index) |
| F | Map issues to work done + generate missing issues | #4 (`--issue`, `--epic`, `--spec` modes), #7 (reconcile), #5 (issue board audit) |

## Key Data Points from Research

- **50 specs** have no `.plan.md` file (out of ~65 feature specs)
- **3 epics** have all issues closed but are still marked `open`
- **12 charters** have deferred/out-of-scope work in free-text sections
- **12+ capabilities** are marked v2/future/nice-to-have across charters
- **0 deferred issues** currently (infrastructure exists but unused)
- **~50%** of specs have no source manifest (never went through `/adev:implement`)
- `prepare-commit-msg` hook exists but is **inactive** (`core.hooksPath` not set)
- Session JSONL captures `session_id` but **not** `issue` or `epic`

## Files

- Full research: `.context-index/specs/features/task-management/work-tracking-gaps-research.md`
- This summary: `.context-index/specs/features/task-management/work-tracking-summary.md`
