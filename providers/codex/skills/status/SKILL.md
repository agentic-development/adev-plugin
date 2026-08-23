---
name: adev:status
description: "Query project status across charters, specs, capabilities, sessions, and source manifests. Read-only dashboard view of adev lifecycle artifacts. Use when the user asks 'what is the status', 'show project progress', 'which specs are done', 'charter status', 'capability progress', or wants a summary of where things stand. In Codex, invoke with $adev:status"
---

# Project Status Dashboard

Query and display the current status of adev lifecycle artifacts. This skill is **read-only** — it never modifies files.

**Announcement:** "I'm using the adev:status skill to query project status."

**Persona adaptation:** All output formats below are defaults for the Developer persona; adapt the chat output to the active persona's output rules. Verbosity is resolved separately across `templates/verbosity/terse.md`, `templates/verbosity/normal.md`, and `templates/verbosity/deep.md`: when the resolved verbosity is terse and a section below carries a `**Terse form:**` block, that block is the section's declared rendering at terse verbosity.

> **Terse-form convention.** The marker `**Terse form:**` (used verbatim, never rephrased) is the last block of a governed section: its content runs from the marker line to the end of that section. A section's extent is its heading line through the line before the next heading of equal or shallower depth (depth = leading `#` count), or end of file; heading detection is fence-aware and frontmatter-aware, so a `#`-prefixed line inside a fenced code block or the leading YAML frontmatter is not a heading. Exactly one marker per governed section.
>
> **Table substitution inside a terse form (BEH-3).** A terse form contains at most one table of the section's own data. Every further table is replaced by a count plus a pointer: the repo-relative path of the artifact already holding the data, or — when no artifact holds it — the narrower invocation of the same skill that renders detail for one item. When neither exists, state the count alone with nothing named.

## Arguments

- `--spec <path>`: Show detailed status for a single spec
- `--charter <name>`: Show status for a charter and its specs/capabilities
- `--milestone <name>`: Show detailed status for a single milestone (mutually exclusive with `--spec` and `--charter`)
- `--issue <id>`: Trace full lifecycle chain for a single issue (issue → plan task → spec → commits → files → drift)
- `--epic <id>`: Show epic status with all child issues, code coverage, and completeness
- `--file <path>`: Reverse lookup — file → spec (via source manifest) → issue → commits → drift
- `--backlog`: Aggregate all pending work from charters, specs, issue board, and code provenance
- `--milestone <name>`: Show all capabilities in a milestone across all charters with spec/plan/issue/code status
- `--all`: Show full project status dashboard (default when no args)

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev:init` first.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill status
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

## Process

### Mode: `--spec <path>`

Status for exactly one spec.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/spec-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the header lines — spec path, status, revision, updated date, tracker ref, charter-revision staleness — and the source-manifest, commit, session, and plan/task-assignment counts. Substitutes the per-file source-manifest listing with the file count and `/adev:status --file <path>` for detail on any one file. Skips the per-commit and per-session listings, and the review-revisions history beyond noting whether any revision blocked.

### Mode: `--charter <name>`

Status for one Feature Charter and the specs under it.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/charter-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the charter header line and the capability-progress summary — implemented/validated/not-started counts, one line per capability, showing its status. Substitutes the per-spec listing with a count of specs and `/adev:status --spec <path>` for detail on any one spec.

### Mode: `--milestone <name>`

1. Read `tasks.backend` from `.context-index/manifest.yaml`. If not configured, print "Issue board not configured. Add `tasks.backend` to manifest.yaml." and stop.
2. **Milestone metadata:** Call `getMilestoneStatusData(projectRoot, name)` from `lib/milestones.mjs`. If `found` is true, display milestone metadata (status, target_date, ship_criteria count, defer_reason if deferred) before the epic/issue breakdown. If not found but `milestones.yaml` exists, print advisory: "Note: milestone '<name>' is not defined in milestones.yaml."
3. Query the issue board for all epics with `milestone` matching `<name>`
4. If no epics match, print "No epics found for milestone '<name>'. Available milestones: <list of known milestones>" and stop
5. For each matching epic, list all child issues with their statuses
6. For each epic, find related specs (by matching charter or plan references) and report their statuses (draft / review-passed / implemented / validated)
7. Compute aggregate progress: total issues, issues by status, percentage complete (closed / total)
8. Display the milestone name, associated epics, issue breakdown, and spec statuses

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

**Terse form:** Renders the milestone header and the aggregate progress line (closed/total issues, percentage complete). Substitutes the per-epic issue and spec breakdown with a count of epics and `/adev:status --epic <id>` for detail on any one epic.

### Mode: `--all` (default)

The default dashboard across charters, specs, and capabilities.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/all-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders one counts roll-up table — charters by status, specs by status, and capability progress — and substitutes every other grouping with a count plus a narrower pointer:

| Grouping | Counts |
|---|---|
| Charters | draft / active / completed / archived |
| Specs | draft / review-pending / review-passed / review-blocked / implemented / validated |
| Capabilities | implemented (of total) / validated |

- Drifted specs: count, then `/adev:status --spec <path>` for detail on any one spec
- Specs needing re-review: count, then `/adev:status --spec <path>` for detail on any one spec
- Milestone progress: count, then `/adev:status --milestone <name>` for detail on any one milestone
- Stale claims: count, then `/adev:status --issue <id>` for detail on any one issue
- Recent sessions: count alone

### Mode: `--issue <id>`

Status for one issue.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/issue-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the issue header line, epic reference, plan/task pointer, and spec status, plus the commit and post-close-change counts. Substitutes the files-touched listing with a count of files and `/adev:status --file <path>` for detail on any one file. Skips the per-commit listing.

### Mode: `--epic <id>`

Status for one epic and its children.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/epic-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the epic header line and the completeness summary (closed/total issues, recommendation). Substitutes the per-issue table with a count of child issues and `/adev:status --issue <id>` for detail on any one issue.

### Mode: `--file <path>`

Which lifecycle artifacts cover a given source file.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/file-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the file's claim status, drift status, and issue/epic linkage, plus a count of recent commits touching the file. Skips the per-commit listing.

### Mode: `--backlog`

The backlog view.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/backlog-mode.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the total item count and the by-priority breakdown (critical/high/medium/low). Substitutes each category listing with a count plus its narrower pointer, in the order the default output presents them:

- Unplanned and draft specs: count, then `/adev:status --spec <path>` for detail on any one spec
- Open and deferred issues: count, then `/adev:status --issue <id>` for detail on any one issue
- Stale epics: count, then `/adev:status --epic <id>` for detail on any one epic
- Charter deferred/future capabilities: count, then `/adev:status --charter <name>` for detail on any one charter
- Untraced code: count, then `.context-index/hygiene/drift-report.md`

### Mode: `--milestone <name>`

Show all capabilities in a specific milestone across all charters.

1. Scan all charters for Capability Map table entries.
2. Filter to rows where Phase column matches `<name>` (e.g., "v1", "v2", "Phase 1").
3. For each capability, check if a spec exists, if it has a plan, and the issue/code status.

**Output format:**
```
=== Milestone: <name> ===

| Charter | Capability | Priority | Spec | Plan | Issues | Code |
|---------|-----------|----------|------|------|--------|------|
| auth | Password Login | must-have | validated | yes | 3/3 closed | traced |
| auth | SSO Integration | should-have | — | — | — | untraced (lib/orphan.mjs) |
| dashboard | Metrics Overview | must-have | draft | — | — | — |
```

**Terse form:** Renders the milestone header and a count of capabilities found across charters, broken out by spec/plan/issue/code completeness state. Substitutes the per-capability table with the count plus `/adev:status --charter <name>` for detail on any one charter's capabilities.

### Mode: Workspace Aggregation (workspace root)

Cross-repo rollup when run at a workspace root.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/modes/workspace-aggregation.md` for the full instructions. Do not act on this section from the summary above.

**Terse form:** Renders the workspace header and the number of registered repos, with one line per repo naming its context status (configured or not). Substitutes the per-repo charter/spec/capability counts and the Stale Charter References listing with `/adev:status --all` run from within that repo for full single-repo detail.

## Important Notes

- This skill is **read-only**. It must never create, modify, or delete any file.
- If a file cannot be read (missing, corrupt YAML), report it as an error in the output and continue with the next item.
- If `.context-index/sessions/` does not exist, report "No sessions directory found" and skip session reporting.
- If `lib/source-manifest.mjs` is not available, skip source manifest checks and note "source-manifest checking unavailable".
- Use frontmatter parsing that tolerates missing fields — default to "unknown" for missing values.

## API reference

Library functions this skill wraps.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/status/references/api-reference.md` for the full instructions. Do not act on this section from the summary above.
