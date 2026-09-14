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
  - <charter>: <capability> (<milestone>, <priority>)

Untraced Code: <N files> (run /adev:hygiene --check provenance for details)
```
