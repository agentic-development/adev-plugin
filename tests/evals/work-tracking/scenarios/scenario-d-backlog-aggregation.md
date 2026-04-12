# Scenario D: Backlog Aggregation

## Skill
Enhanced `/adev:status --backlog`

## Target Project
`tests/evals/work-tracking/fixture` — fixture repo with crafted git history

## Prompt
Show the complete project backlog by aggregating all sources of pending work: unplanned specs, draft specs, open issues, deferred issues, stale epics, charter out-of-scope items, v2/future capabilities, and untraced code files.

## Expected Behavior
The backlog query should scan charters (capability maps + out of scope sections), specs (by status), the issue board (by status), and code provenance to produce a unified prioritized view.

## Success Criteria
- Lists session-mgmt.md as unplanned spec (review-passed, no plan)
- Lists metrics.md as draft spec (no review)
- Lists issue-4 as open issue (with note about orphaned planRef)
- Lists issue-5 as deferred issue with staleness warning (26+ days)
- Lists epic-1 as stale (all issues closed but epic still open)
- Lists SSO Integration as v2 capability from auth charter
- Lists OAuth Providers as v2/nice-to-have from auth charter
- Lists Real-time Streaming as v2 from dashboard charter
- Lists Custom Dashboard Builder as v2 from dashboard charter
- Cross-references lib/orphan.mjs (untraced) with SSO Integration capability
- Groups findings by priority or source type
- Includes total count of backlog items
