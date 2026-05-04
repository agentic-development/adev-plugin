---
name: adev:status
description: "Query project status across charters, specs, capabilities, sessions, and source manifests. Read-only dashboard view of adev lifecycle artifacts. Use when the user asks 'what is the status', 'show project progress', 'which specs are done', 'charter status', 'capability progress', or wants a summary of where things stand. In Codex, invoke with $adev:status"
---

# Project Status Dashboard

Query and display the current status of adev lifecycle artifacts. This skill is **read-only** — it never modifies files.

**Announcement:** "I'm using the adev:status skill to query project status."

**Persona adaptation:** All output formats below are defaults for the Developer persona. If a different persona is active, adapt the chat output to its output rules (e.g., Product persona: show counts and status summaries only, omit file paths and technical detail).

## Arguments

- `--spec <path>`: Show detailed status for a single spec
- `--charter <name>`: Show status for a charter and its specs/capabilities
- `--milestone <name>`: Show detailed status for a single milestone (mutually exclusive with `--spec` and `--charter`)
- `--issue <id>`: Trace full lifecycle chain for a single issue (issue → plan task → spec → commits → files → drift)
- `--epic <id>`: Show epic status with all child issues, code coverage, and completeness
- `--file <path>`: Reverse lookup — file → spec (via source manifest) → issue → commits → drift
- `--backlog`: Aggregate all pending work from charters, specs, issue board, and code provenance
- `--phase <name>`: Show all capabilities in a phase across all charters with spec/plan/issue/code status
- `--all`: Show full project status dashboard (default when no args)

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev:init` first.

## Process

### Mode: `--spec <path>`

1. Read the spec file at the given path
2. Parse YAML frontmatter and extract:
   - `status` (draft, review-pending, review-passed, review-blocked, implemented, validated)
   - `revision` (current revision number)
   - `charter-revision` (revision of charter when spec was last aligned)
   - `updated` (last update date)
   - `tracker-ref` (external tracker reference, if present)
3. If the spec has a `source-manifest` section, verify it using `lib/source-manifest.mjs`:
   - Check each listed source file exists
   - Report any missing or changed files as "drifted"
4. Query git log for commits with `Spec:` trailer matching this spec path:
   ```bash
   git log --all --format='%H %s' --grep='Spec: <spec-path>'
   ```
5. Scan `.context-index/sessions/` for session summaries that reference this spec
6. If the spec belongs to a charter, read the charter and compare:
   - If spec's `charter-revision` is behind the charter's current `revision`, flag as **charter-revision stale**
7. Check if a plan exists for this spec (look for plan files referencing the spec path)
8. Check if test files exist for this spec (look in the test directory for matching test files)
9. Display `tracker-ref` if present

**Output format:**

```
Spec: <path>
Status: <status>
Revision: <revision>
Updated: <date>
Tracker: <tracker-ref or "none">
Charter revision: <charter-revision> (current: <charter-revision>, charter: <charter-current>) [STALE if behind]

Source manifest: <N files checked>
  - <file>: OK | MISSING | DRIFTED

Git commits: <N commits>
  - <hash-short> <subject> (<date>)

Sessions: <N sessions>
  - <session-file>: <date> — <summary line>

Plan: <found | not found>
Tests: <found | not found>
```

### Mode: `--charter <name>`

1. Find the charter file by name under `.context-index/specs/features/` or `.context-index/specs/cross-cutting/`
2. Read charter frontmatter and extract:
   - `status` (draft, active, completed, archived)
   - `revision` (current revision number)
   - `updated` (last update date)
3. Read the Capability Map table from the charter body
4. Parse the Status column for each capability and compute progress:
   - Count capabilities by status: not-started, specified, implemented, validated
   - Report summary: "5/10 implemented, 2 validated, 3 not started"
5. Find all specs that belong to this charter (specs whose frontmatter references this charter)
6. For each spec, read its `status` and `revision`

**Output format:**

```
Charter: <name>
Status: <status>
Revision: <revision>
Updated: <date>

Capability Progress: <implemented>/<total> implemented, <validated> validated, <not-started> not started
  - <capability-name>: <status>
  - <capability-name>: <status>
  ...

Specs (<N total>):
  - <spec-path>: <status> (rev <revision>)
  - <spec-path>: <status> (rev <revision>)
  ...
```

### Mode: `--milestone <name>`

1. Read `tasks.backend` from `.context-index/manifest.yaml`. If not configured, print "Issue board not configured. Add `tasks.backend` to manifest.yaml." and stop.
2. Query the issue board for all epics with `milestone` matching `<name>`
3. If no epics match, print "No epics found for milestone '<name>'. Available milestones: <list of known milestones>" and stop
4. For each matching epic, list all child issues with their statuses
5. For each epic, find related specs (by matching charter or plan references) and report their statuses (draft / review-passed / implemented / validated)
6. Compute aggregate progress: total issues, issues by status, percentage complete (closed / total)
7. Display the milestone name, associated epics, issue breakdown, and spec statuses

**Output format:**

```
=== Milestone: <name> ===

Progress: <closed>/<total> issues complete (<percentage>%)

Epics:
  epic-1 — Auth Feature (open)
    Issues: 2 open, 1 in_progress, 3 closed
    Specs:
      - auth-login.md: implemented
      - auth-session.md: review-passed

  epic-4 — Payment Flow (open)
    Issues: 4 open, 0 in_progress, 0 closed
    Specs:
      - payment-checkout.md: draft

Summary:
  Total epics: 2
  Total issues: 10 (6 open, 1 in_progress, 3 closed)
  Percentage complete: 30%
```

### Mode: `--all` (default)

1. Scan all charters under `.context-index/specs/features/` and `.context-index/specs/cross-cutting/`
2. Scan all specs under the same directories
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
Flag specs where `revision` is greater than the last-reviewed revision (specs modified since last review pass).

#### Milestone Progress

If `tasks.backend` is configured in `manifest.yaml`, scan all epics for `milestone` fields. If any epics have milestones, add a "Milestone Progress" section showing per-milestone aggregation:

- **Milestone name**
- Total epics in milestone
- Total issues across those epics
- Issue counts by status: open / in_progress / closed
- Percentage complete (closed issues / total issues)

If no epics have milestones, skip this section entirely (unchanged behavior). If `tasks.backend` is not configured, skip this section silently.

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

Milestone Progress:
  v1: 3 epics, 12 issues (4 open, 5 in_progress, 3 closed) — 25% complete
  v2: 1 epic, 4 issues (4 open, 0 in_progress, 0 closed) — 0% complete

Recent sessions (last 10):
  - <date> [<type>] <summary>
```

### Mode: `--issue <id>`

Trace the full lifecycle chain for a single issue.

1. Read the issue from the issue board (via `getIssueManager(manifest)` from `lib/issues/registry.mjs`).
2. If the issue has `planRef` and `planTask`, read the plan file and extract the task details.
3. Follow the plan to its parent spec (the spec referenced in the plan frontmatter or adjacent spec with matching name).
4. Search git history for commits with `Issue: <id>` trailer: `git log --all --format='%H %s %ai' --grep='Issue: <id>'`.
5. For each commit, extract trailers and list files touched.
6. If the spec has a source manifest, run `verifyManifest()` to check drift status.
7. If the issue is closed, check for post-close changes: commits touching the same files after the issue's close date.

**Output format:**
```
Issue: <id> — <title>
Status: <status>
Epic: <epic-id> — <epic-title>
Plan: <plan-file> (Task <N> of <total>)
Spec: <spec-path> (status: <spec-status>)

Commits (via Issue: <id> trailer):
  <sha> <subject> (<Author-type>, <date>)
  ...

Files touched:
  <file> — <drift-status>

Post-close changes: <N commits after close>
```

### Mode: `--epic <id>`

Show comprehensive epic status with child issues and code coverage.

1. Read the epic and all its child issues from the issue board.
2. For each issue, determine if it has code behind it (check for commits with `Issue: <id>` trailer).
3. Flag "paper" issues (no commits found).
4. Check epic completeness: are all issues closed? If so and epic is still open, flag as stale.
5. Show issue-level summary table.

**Output format:**
```
Epic: <id> — <title> (<status>)

| Issue | Title | Status | Has Code | Commits |
|-------|-------|--------|----------|---------|
| issue-1 | ... | closed | yes | 3 |
| issue-2 | ... | open | no (paper) | 0 |

Completeness: <closed>/<total> issues closed
Recommendation: <close epic / create missing issues / review deferred>
```

### Mode: `--file <path>`

Reverse lookup from a source file to its lifecycle context.

1. Use `buildReverseIndex()` from `lib/source-manifest.mjs` to find which spec claims the file.
2. If claimed: read the spec, find the plan, find the issue, check drift via `verifyManifest()`.
3. If unclaimed: report as unclaimed, check git history for any lifecycle trailers.
4. Show recent commits touching the file with their trailer status.

**Output format:**
```
File: <path>
Claimed by: <spec-path> (source manifest) — or "Unclaimed (no spec)"
Drift: <match/drift/missing>
Issue: <id> (<status>) — or "No issue linkage"
Epic: <epic-id>

Recent commits:
  <sha> <subject> (Spec: <yes/no>, Author-type: <type>)
  ...
```

### Mode: `--backlog`

Aggregate all sources of pending work into a unified prioritized view.

1. **Unplanned specs**: Scan specs with status `review-passed` that have no sibling `.plan.md` file.
2. **Draft specs**: Scan specs with status `draft`.
3. **Open issues**: Read issue board, filter by `status: open`.
4. **Deferred issues**: Read issue board, filter by `status: deferred`. Flag staleness (> 14 days).
5. **Stale epics**: Find epics with all issues closed but epic still `open`.
6. **Charter deferred capabilities**: Scan charter Capability Map tables for entries with status `—` in phases marked v2/future/nice-to-have. Also scan "Out of Scope" sections.
7. **Untraced code**: If provenance audit results exist (`.context-index/hygiene/drift-report.md`), include untraced file count.
8. **Orphaned planRefs**: Issues whose `planRef` points to nonexistent files.

**Prioritization:**
- Critical: open issues with orphaned planRefs
- High: review-passed specs with no plan
- Medium: v2/future charter capabilities, deferred issues
- Low: draft specs, nice-to-have capabilities

**Cross-reference:** If an untraced code file's name or content matches a v2 charter capability keyword, flag it (e.g., "lib/orphan.mjs may implement SSO Integration from auth charter").

**Output format:**
```
=== Backlog Summary ===

Total items: <N>

By Priority:
  Critical: <n>
  High: <n>
  Medium: <n>
  Low: <n>

Unplanned Specs (<n>):
  - <spec-path> (status: review-passed, charter: <name>)

Draft Specs (<n>):
  - <spec-path> (charter: <name>)

Open Issues (<n>):
  - <id>: <title> (epic: <epic-id>)

Deferred Issues (<n>):
  - <id>: <title> — deferred <N> days

Stale Epics (<n>):
  - <epic-id>: <title> — all <N> issues closed, epic still open

Charter Deferred/Future Capabilities (<n>):
  - <charter>: <capability> (<phase>, <priority>)

Untraced Code: <N files> (run /adev:hygiene --check provenance for details)
```

### Mode: `--phase <name>`

Show all capabilities in a specific phase across all charters.

1. Scan all charters for Capability Map table entries.
2. Filter to rows where Phase column matches `<name>` (e.g., "v1", "v2", "Phase 1").
3. For each capability, check if a spec exists, if it has a plan, and the issue/code status.

**Output format:**
```
=== Phase: <name> ===

| Charter | Capability | Priority | Spec | Plan | Issues | Code |
|---------|-----------|----------|------|------|--------|------|
| auth | Password Login | must-have | validated | yes | 3/3 closed | traced |
| auth | SSO Integration | should-have | — | — | — | untraced (lib/orphan.mjs) |
| dashboard | Metrics Overview | must-have | draft | — | — | — |
```

### Mode: Workspace Aggregation (workspace root)

When invoked at a **workspace root** (a directory that contains `workspace.yaml` or `.workspace/` config but is not itself one of the registered repos), enter **workspace mode** to aggregate charter and spec status across all registered repos.

#### Workspace Detection

Call `detectWorkspace()` to determine whether the current directory is a workspace root. If `detectWorkspace()` returns a workspace context, enter workspace mode. Otherwise, fall through to single-repo behaviour.

#### Cross-Repo Status Aggregation

1. Call `resolveWorkspaceContext()` to obtain the list of registered repos, their local paths, and the dependency graph.
2. **Aggregate per repo:** For each registered repo, check for a `.context-index/` directory and read its charters and specs.
   - If the repo directory does not exist or has no `.context-index/`: report `<slug>: no context configured`
   - Otherwise: summarize charter and spec counts by status (same fields as `--all` mode)
3. **Group output by repo**, sorted in topological dependency order (upstream first) when a dependency graph is available.

#### Charter-Revision Staleness Across Workspace

When a workspace-level charter exists (in the workspace `.context-index/`), compare its current `revision` against the `charter-revision` field in each repo-level spec that implements it:

1. Read the workspace charter's current `revision` value.
2. For each registered repo, scan specs whose frontmatter references the workspace charter.
3. If a spec's `charter-revision` is behind the workspace charter's current `revision`, flag that spec as **stale** — its `charter-revision` does not match the workspace charter revision.
4. Include stale specs in the output under a "Stale Charter References" section per repo.

This ensures that when a workspace charter is updated, all repo-level specs tracking it are flagged for re-alignment.

**Output format:**

```
=== Workspace Status ===

repo: core
  Charters: 2 (1 active, 1 draft)
  Specs: 5 (3 implemented, 1 review-passed, 1 draft)
  Capabilities: 8/12 implemented
  Stale Charter References:
    - specs/auth-login.md: charter-revision 2 (workspace charter at 4) — STALE

repo: api
  Charters: 1 (1 active)
  Specs: 3 (2 review-passed, 1 draft)
  Capabilities: 4/9 implemented

repo: frontend
  no context configured
```

#### Repo-Mode-Inside-Workspace Advisory

**When invoked inside a repo (not workspace root):** Use existing single-repo behavior for the full status output. If `detectWorkspace()` detects an ancestor workspace, emit the following advisory to stdout once per invocation:

```
Advisory: running repo-scoped inside workspace at <workspace-path>. Run /adev:status at the workspace root for cross-repo aggregation.
```

## Important Notes

- This skill is **read-only**. It must never create, modify, or delete any file.
- If a file cannot be read (missing, corrupt YAML), report it as an error in the output and continue with the next item.
- If `.context-index/sessions/` does not exist, report "No sessions directory found" and skip session reporting.
- If `lib/source-manifest.mjs` is not available, skip source manifest checks and note "source-manifest checking unavailable".
- Use frontmatter parsing that tolerates missing fields — default to "unknown" for missing values.
