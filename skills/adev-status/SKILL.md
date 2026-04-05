---
name: adev-status
description: "Query project status across charters, specs, capabilities, sessions, and source manifests. Read-only dashboard view of adev lifecycle artifacts. Use when the user asks 'what is the status', 'show project progress', 'which specs are done', 'charter status', 'capability progress', or wants a summary of where things stand."
---

# Project Status Dashboard

Query and display the current status of adev lifecycle artifacts. This skill is **read-only** — it never modifies files.

**Announcement:** "I'm using the adev-status skill to query project status."

## Arguments

- `--spec <path>`: Show detailed status for a single spec
- `--charter <name>`: Show status for a charter and its specs/capabilities
- `--milestone <name>`: Show detailed status for a single milestone (mutually exclusive with `--spec` and `--charter`)
- `--all`: Show full project status dashboard (default when no args)

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev-init` first.

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

## Important Notes

- This skill is **read-only**. It must never create, modify, or delete any file.
- If a file cannot be read (missing, corrupt YAML), report it as an error in the output and continue with the next item.
- If `.context-index/sessions/` does not exist, report "No sessions directory found" and skip session reporting.
- If `lib/source-manifest.mjs` is not available, skip source manifest checks and note "source-manifest checking unavailable".
- Use frontmatter parsing that tolerates missing fields — default to "unknown" for missing values.
