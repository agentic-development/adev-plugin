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
