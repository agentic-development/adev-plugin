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
8. Run `adev state current --spec <path>` and read the returned `planTasks` and `testDepthAssignments` projections. For each `planTasks` entry, check for a matching `testDepthAssignments` entry keyed on `plan` + `task_id`, where the projection folds `plan_task` and `test_depth_assigned` events and the most recent assignment per plan+task_id wins. Report `<N>/<total> tasks with a recorded assignment`. This counts lifecycle events rather than filesystem presence, since under any granularity other than `per-task`, multiple tasks can share one suite path and a raw file-existence probe no longer maps 1:1 to per-task completion.
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
Tasks: <N>/<total> with a recorded test-depth assignment

Review revisions (when present):
  - rev 1: <verdict>  (<completed_at>)  [<N blockers>]
  - rev 2: <verdict>  (<completed_at>)  [<N blockers>]
  - rev 3: <verdict>  (<completed_at>)  [<N blockers>]
```

**Review revisions section** — only render when `currentState(spec).steps.review.byRevision` is populated with more than one revision (i.e., the BLOCK→revise auto-retry loop ran at least once for this spec). The per-revision projection is produced by `lib/lifecycle-state.mjs` Task 3 of review-block-auto-retry; consume `byRevision[N]` directly without re-folding the log. Each entry carries `verdict`, `completed_at`, and a `blockers[]` list of canonical `blocker_id`s. Order by ascending revision integer. If only one revision exists, the standard `Revision: <N>` line covers it — no separate section needed (non-breaking output for specs that never blocked).
