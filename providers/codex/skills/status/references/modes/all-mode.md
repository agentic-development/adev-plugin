### Mode: `--all` (default)

**Optimization:** Use `adev state list --status <s>` to scan specs by status in a single call instead of reading each file individually. Loop over the lifecycle statuses:

```bash
for s in draft review-pending review-passed implemented validated; do
  adev state list --status "$s"
done
```

Each invocation emits a single-line JSON `{ status, module, count, specs }`. The verb wraps `lib/meta-tools.mjs::findSpecsByStatus` and accepts `--module <slug>` to scope to a single charter (default `*` covers all features + cross-cutting).

If the CLI call fails, fall back to the manual scan below.

1. Scan all charters under `.context-index/specs/features/` and `.context-index/specs/cross-cutting/`
2. Scan all `*.spec.md` files under the same directories
3. For each charter, read frontmatter status
4. For each spec, read frontmatter status

**Report sections:**

#### Charters by Status
Count charters grouped by status (draft, active, completed, archived).

#### Specs by Status
Count specs grouped by status (draft, review-pending, review-passed, review-blocked, implemented, validated).

#### Capability Progress
Aggregate capability counts across all charters.

#### Drifted Specs
For each spec with a `source-manifest`, check using `lib/source-manifest.mjs`. Flag any spec where source files are missing or changed.

#### Specs Needing Re-Review
For each spec, call `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` and compare the spec's `revision` frontmatter against `state.steps.review.lastReviewedRevision`. Flag specs where `revision` is greater (modified since last review pass). For the project-wide view, `listLifecycleStates(projectRoot)` returns the full set in one call.

#### Milestone Progress

If `tasks.backend` is configured in `manifest.yaml`, scan all epics for `milestone` fields. If any epics have milestones, add a "Milestone Progress" section showing per-milestone aggregation:

- **Milestone name**
- Total epics in milestone
- Total issues across those epics
- Issue counts by status: open / in_progress / closed
- Percentage complete (closed issues / total issues)
- **Milestone metadata** (from `milestones.json` via `lib/milestones.mjs`): call `getMilestoneStatusData(projectRoot, name)` for each milestone name. If found, include target_date, status, and ship_criteria count alongside the issue board aggregation.

If no epics have milestones, skip this section entirely (unchanged behavior). If `tasks.backend` is not configured, skip this section silently.

#### Stale Claims

Run `adev issues stale --json` and report any expired claim leases (`stale[]`) plus any claims that can never expire (`unexpirable[]` — an owner with no `claimed_at`). Each entry names the issue, the holder, and how long ago it was claimed; a stale claim no longer blocks work, so surfacing it tells the user which issues an abandoned session left sitting. Skip this section when both lists are empty.

#### Recent Sessions
Read the 10 most recent session summaries from `.context-index/sessions/` and display date, type, and summary line.

**Output format:**

```
=== Project Status Dashboard ===

Charters: <N total>
  draft: <n>  |  active: <n>  |  completed: <n>  |  archived: <n>

Specs: <N total>
  draft: <n>  |  review-pending: <n>  |  review-passed: <n>
  review-blocked: <n>  |  implemented: <n>  |  validated: <n>

Capabilities: <implemented>/<total> implemented, <validated> validated

Drifted specs: <N>
  - <spec-path>: <drift reason>

Specs needing re-review: <N>
  - <spec-path>: revision <current> (last reviewed: <last-reviewed>)

Stale claims: <N> (lease <ttl_minutes> min)
  - <issue-id> held by <owner>, claimed <age> ago

Milestone Progress:
  v1: 3 epics, 12 issues (4 open, 5 in_progress, 3 closed) — 25% complete
  v2: 1 epic, 4 issues (4 open, 0 in_progress, 0 closed) — 0% complete

Recent sessions (last 10):
  - <date> [<type>] <summary>
```
