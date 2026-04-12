# Scenario F: Issue Chain Tracing

## Skill
Enhanced `/adev:status --issue` and `/adev:status --epic`

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
Trace the full lifecycle chain for:
1. `--issue issue-2`: Show the issue, its plan task, spec, commits, files, and drift status
2. `--epic epic-1`: Show all issues, which have code, which are paper, and epic completeness
3. `--epic epic-2`: Show issues including the orphaned planRef and deferred issue

Also trace `--file lib/drifted.mjs` to show the reverse chain from file to spec to issue.

## Expected Behavior
Each query should join data from the issue board, plan files, specs, git history (trailers), and source manifests to produce a complete traceability view.

## Success Criteria

### --issue issue-2
- Shows issue-2 title: "Auth logic"
- Links to plan task 2 in login.plan.md
- Links to spec auth/login.md
- Shows commit(s) with matching Issue: issue-2 trailer
- Shows files touched (lib/login.mjs)
- Reports no post-close drift (or drift status)

### --epic epic-1
- Shows all 3 issues (issue-1, issue-2, issue-3) as closed
- Reports epic is stale (all issues closed but epic still open)
- Shows which issues have code behind them (all 3 via git trailers)
- Recommends closing the epic

### --epic epic-2
- Shows issue-4 as open with WARNING: orphaned planRef (file doesn't exist)
- Shows issue-5 as deferred with staleness warning (26+ days)
- Reports epic incomplete (1 open, 1 deferred)

### --file lib/drifted.mjs
- Maps to spec dashboard/widgets.md via reverse index
- Reports DRIFT (modified after source manifest was stamped)
- Shows the untracked commit (fix: patch metrics edge case)
- Links to epic-2 if issue chain exists (or reports no issue linkage)
