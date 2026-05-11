# Live Spec: Status Query Skill

---
charter: spec-lifecycle
status: validated
risk_level: medium
milestone:
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
source-manifest:
  files:
    - path: skills/status/SKILL.md
    - path: .claude-plugin/plugin.json
    - path: lib/source-manifest.mjs
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with at least one charter
- The skill is invoked as `/adev:status` with one of: `--spec <path>`, `--charter <name>`, or `--all`
- Git is available for commit history queries

### Behaviors

1. **When** `/adev:status --spec <path>` is invoked **then** the skill reads the spec's frontmatter and reports: status, revision, charter-revision (with drift warning if behind), source manifest match (if present), tracker-ref (if present), associated commits (via `git log --grep="Spec: <path>"`), session summaries referencing this spec, and plan task completion (tests passing / total).

2. **When** `/adev:status --charter <name>` is invoked **then** the skill reads the charter's frontmatter and Capability Map, and reports: charter status, revision, capability progress summary (e.g., "5/10 implemented, 2 validated, 3 not started"), per-capability status table, and list of specs with their individual statuses.

3. **When** `/adev:status --all` is invoked **then** the skill scans all charters and specs, and produces a project-wide report: total charters by status, total specs by status, capabilities progress across all charters, drifted specs (source manifest mismatch), specs needing re-review (revision > last-reviewed), and recent session summaries.

4. **When** a spec has a `source-manifest` and `verifyManifest` reports drift **then** `/adev:status` highlights it: "Source drift detected — code has changed since last validation (sha <stored> vs <current>)."

5. **When** a spec has `charter-revision` behind the charter's current `revision` **then** `/adev:status` warns: "Spec written against charter revision <N>, charter is now at revision <M>. Consider reviewing spec against updated charter."

6. **When** a spec has a `tracker-ref` **then** `/adev:status` displays it alongside the spec status: "Tracker: LINEAR-1234" or "Tracker: #42".

7. **When** no argument is provided **then** the skill defaults to `--all`.

### Postconditions

- Status report is output as formatted markdown to the conversation
- No files are modified by `/adev:status` — it is read-only
- All data sources are queried: frontmatter, source manifests, git log, session summaries, test results

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Spec path not found | Report: "Spec not found: <path>" | SPEC_NOT_FOUND |
| Charter name not found | Report: "Charter not found: <name>. Available charters: [list]" | CHARTER_NOT_FOUND |
| No charters or specs exist | Report: "No charters or specs found in .context-index/. Run /adev:brainstorm to get started." | EMPTY_PROJECT |
| Git not available | Skip commit history section, warn: "Git not available — commit history and file drift checks skipped" | GIT_UNAVAILABLE |
| Source manifest verification fails (file missing) | Report drift with details of missing files | — (reported as drift) |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — `/adev:status` is a SKILL.md file with instructions for the agent, no companion code required (though it may call `lib/source-manifest.mjs:verifyManifest`).
- **Principle:** "Minimize external dependencies" — Status queries use only git CLI, file reads, and the existing `lib/` helpers.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `skills/status/SKILL.md` | Skill instructions for spec, charter, and project-wide status queries | large |
| Register skill in plugin | Add to `.claude-plugin/plugin.json` skills list | small |
| Write tests | Test output format for each mode, drift reporting, missing data handling | medium |

## Acceptance Criteria

- [ ] `/adev:status --spec <path>` reports: status, revision, source manifest, commits, sessions, plan tasks, tracker-ref
- [ ] `/adev:status --charter <name>` reports: charter status, capability progress, spec statuses
- [ ] `/adev:status --all` reports: project-wide charter/spec/capability summary
- [ ] Source manifest drift is highlighted when detected
- [ ] Charter-revision staleness is warned about
- [ ] Tracker references are displayed when present
- [ ] No arguments defaults to `--all`
- [ ] The skill is read-only — no files modified
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
