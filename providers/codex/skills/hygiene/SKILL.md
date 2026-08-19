---
name: adev:hygiene
description: "Audit all context for staleness, drift, and coverage gaps. Runs twenty-three audit passes across the .context-index/ directory and source code, generating actionable reports with checklists. Use when the user wants to check context health, find stale specs, detect drift between specs and code, identify missing coverage, scan for dead code, or clean up the context index. In Codex, invoke with $adev:hygiene"
---

# Context Hygiene Audit

Audit the health of `.context-index/` and source code, generating actionable reports. Twenty-three audit passes detect staleness, drift, coverage gaps, milestone readiness, lifecycle consistency, operational patterns, code health issues, heuristic index health, kind-discriminator validity, validate config drift, platform drift, and test-suite debt so the team can fix them before they become obstacles.

## Arguments

- No arguments: full audit (all twenty-three passes)
- `--check <type>`: run a single pass (constitution, charters, adrs, samples, drift, sessions, references, governance, recoveries, blockers, milestones, lifecycle, code-health, provenance, issue-board, heuristics, code-drift, kind-validity, validate-config-drift, platform-drift, test-policy-drift, test-debt)
- `--pass <type>`: alias for `--check <type>` (accepted for symmetry with related skills; identical behavior)
- `--fix`: auto-fix issues where possible (runs /adev:sync for constitution drift, etc.)
- `--status <spec-path> <new-status>`: manually update a spec's status field in frontmatter. Useful for correcting status when automation gets out of sync. Example: `--status .context-index/specs/features/auth/login.spec.md validated`

  Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The `adev/status-enum-legal` diagnostic enforces this enum at write time.

## Prerequisites

The project must have `.context-index/` initialized. If it does not exist, suggest running `/adev:init` first.

## Process

**If `--status <spec-path> <new-status>` is provided:**

1. Validate the spec path exists and is a valid spec file
2. Validate the new status value is in `SPEC_STATUSES` (imported from `lib/spec-status.mjs`). The seven legal values are defined there; the `adev/status-enum-legal` diagnostic enforces this enum at write time. Use `assertLegalStatus(value)` from that module to validate.
3. Read the spec file
4. Parse YAML frontmatter
5. Record the old status value
6. Update the status field to the new value
7. Write the spec file back
8. Log: "Updated spec status: {old} → {new}"

Then exit (skip audit passes).

**Otherwise (normal audit mode):**

1. **Load manifest:** Read `.context-index/manifest.yaml` for configuration, sync targets, and integration settings.
2. **Run audit passes:** Execute each of the twenty-three passes below. If `--check` (or `--pass`) was provided, run only that pass.
3. **Generate report:** Write findings to `.context-index/hygiene/drift-report.md`.
4. **Print summary:** Display pass/warn/fail counts and the top-priority actions.
5. **Offer fixes:** For automatically fixable issues, offer to run the appropriate skill or command.

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill hygiene
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

<!-- BYTE BUDGET: a HARD 65,536-byte cap is enforced by
     lib/providers/copilot/skill-validator.mjs (FRONTMATTER_BYTE_LIMIT);
     overflow throws INVALID_SKILL_FRONTMATTER and breaks the copilot
     adapter. This body now sits far below it because the pass catalogue
     lives in references/audit-passes/. Add a NEW pass as a companion file
     plus one row in the table below -- never as prose in this file. -->

## Audit Passes

Twenty-three passes, each defined in its own companion under
`skills/hygiene/references/audit-passes/`.

> **Conditional loading:** Read a pass's companion file immediately before you
> run that pass, and read only the passes this invocation actually needs. A
> no-argument full audit works through all twenty-three in order; a
> `--check <type>` / `--pass <type>` run reads exactly one. Each companion
> carries that pass's goal, steps, finding table, and severity rules; none of
> them is summarized here, so do not run a pass from the table alone.

| # | Pass | `--check` slug | Companion file |
|---|------|----------------|----------------|
| 1 | Constitution Freshness | `constitution` | `pass-01-constitution-freshness.md` |
| 2 | Charter Coverage | `charters` | `pass-02-charter-coverage.md` |
| 3 | ADR Currency | `adrs` | `pass-03-adr-currency.md` |
| 4 | Golden Sample Validity | `samples` | `pass-04-golden-sample-validity.md` |
| 5 | Spec-to-Code Drift | `drift` | `pass-05-spec-to-code-drift.md` |
| 6 | Session Analysis (Conditional) | `sessions` | `pass-06-session-analysis.md` |
| 7 | External Reference Freshness | `references` | `pass-07-external-reference-freshness.md` |
| 8 | Governance Policy Health | `governance` | `pass-08-governance-policy-health.md` |
| 9 | Recovery Pattern Analysis | `recoveries` | `pass-09-recovery-pattern-analysis.md` |
| 10 | Blocker Frequency Analysis | `blockers` | `pass-10-blocker-frequency-analysis.md` |
| 11 | Milestone Coverage | `milestones` | `pass-11-milestone-coverage.md` |
| 12 | Lifecycle Audit | `lifecycle` | `pass-12-lifecycle-audit.md` |
| 13 | Code Health | `code-health` | `pass-13-code-health.md` |
| 14 | Code Provenance | `provenance` | `pass-14-code-provenance.md` |
| 15 | Issue Board Audit | `issue-board` | `pass-15-issue-board-audit.md` |
| 16 | Heuristic Index Health | `heuristics` | `pass-16-heuristic-index-health.md` |
| 17 | Code Drift | `code-drift` | `pass-17-code-drift.md` |
| 18 | Kind Validity | `kind-validity` | `pass-18-kind-validity.md` |
| 19 | Governance Registry Drift | `validate-config-drift` | `pass-19-governance-registry-drift.md` |
| 20 | Platform Drift | `platform-drift` | `pass-20-platform-drift.md` |
| 21 | Amendment Graph | — (no slug; full-audit only) | `pass-21-amendment-graph.md` |
| 22 | Test-Policy Drift | `test-policy-drift` | `pass-22-test-policy-drift.md` |
| 23 | Test Debt | `test-debt` | `pass-23-test-debt.md` |

Pass 21 has no `--check` slug: it runs only as part of a full audit. That is a
gap in the argument list, not a property of the pass.

## Test Debt

- PASS: No test-debt candidates found (or)
- SKIP: no test files discovered / disabled by manifest (or)
- FINDINGS: N candidates across M detectors (advisory)

| Code | Severity | Path | Detail |
|---|---|---|---|
| APPEND_CHAIN | warn | lib/issues/json-adapter.mjs | 23 test files reference this module |
| PLAN_TASK_STRUCTURED | warn | tests/cli/status-pipeline.test.mjs | 1 title structured around a plan task |
| PROSE_ASSERTION | info | tests/docs/workflow-guides.test.mjs | ratio 0.86 (19/22) |
```

**Actions:**
- [ ] Review the largest `APPEND_CHAIN` clusters — they are the highest-signal finding in this pass
- [ ] Rename `PLAN_TASK_STRUCTURED` tests after behavior rather than plan task
- [ ] Investigate every `DEAD_TEST_REFERENCE` — a test invoking a deleted module verifies nothing
- [ ] Treat `PROSE_ASSERTION` as a reading list, not a work queue; do not bulk-rewrite on this signal alone

**Integration with summary table:**
```
| Test Debt | WARN | 30 append chains, 18 plan-task tests, 25 prose-assertion files |
```

## Report Format

**Persona adaptation:** The report written to disk always uses the full format below. The chat summary presented to the user should follow the active persona's output rules.

The full report is written to `.context-index/hygiene/drift-report.md` with this structure:

```markdown
# Context Hygiene Report

**Generated:** [timestamp]
**Commit:** [HEAD hash]

## Summary

| Pass | Status | Issues |
|------|--------|--------|
| Constitution Freshness | WARN | 2 issues |
| Charter Coverage | WARN | 5 uncharted areas |
| ADR Currency | PASS | 0 issues |
| Golden Sample Validity | FAIL | 1 invalid sample |
| Spec-to-Code Drift | WARN | 3 drift items |
| Session Analysis | SKIP | no provider configured |
| External Reference Freshness | PASS | 0 issues |
| Governance Policy Health | PASS | 0 issues |
| Recovery Pattern Analysis | WARN | 2 repeat offenders |
| Blocker Frequency Analysis | WARN | 1 stale blocker |
| Milestone Coverage | WARN | 1 unspecified, 2 un-milestoned |
| Lifecycle Audit | WARN | 2 revision drift, 1 charter stale |
| Code Health | WARN | 2 high, 3 medium, 1 low |
| Code Provenance | WARN | 2 drifted, 3 untraced |
| Issue Board Audit | FAIL | 2 orphaned, 1 stale epic |
| Heuristic Index Health | WARN | 1 stale index entry, 2 orphan tags |
| Code Drift | PASS | 0 issues |
| Kind Validity | WARN | 3 findings (non-blocking) |
| Governance Registry Drift | INFO | 0 divergent entries |
| Platform Drift | PASS | All declared fields match |
| Test-Policy Drift | WARN | 1 task with unavailable floor_inputs |
| Test Debt | WARN | 30 append chains, 18 plan-task tests, 25 prose-assertion files |

## Priority Actions

1. [ ] Run `/adev:sync` to fix constitution drift
2. [ ] Charter src/lib/auth/ (42 changes, no charter)
3. [ ] Update service-sample.md (stale patterns)
4. [ ] Update orientation for payments module

---

[Detailed sections for each pass follow]
```

## After the Audit

Print the summary table and top 3 priority actions to the user. Then:

```
Full report saved to .context-index/hygiene/drift-report.md

Next steps:
- Fix the highest-priority items above
- Run /adev:hygiene again after fixes to verify
- Schedule monthly hygiene audits to prevent drift
```

## API reference

Lifecycle projection (used by the Lifecycle Audit pass and other staleness checks):

- `listLifecycleStates(projectRoot)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — aggregates per-spec lifecycle projections from `.context-index/lifecycle-state/*.jsonl`. Replaces the prior `.review.md` filesystem scan for revision/file-drift detection.
- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — single-spec projection (`{ status, currentStep, steps, planTasks, ... }`).
- `hasDrift(specPath)` from `<ADEV_ROOT>/lib/spec-drift.mjs` — fast drift flag read from the spec's frontmatter.
- `verifyManifest(manifest, projectRoot)` from `<ADEV_ROOT>/lib/source-manifest.mjs` — recompute the content hash for a spec's source manifest and compare; fallback when `hasDrift()` returns false.

Issue board (used by the Issue Board Audit pass and coverage scans):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.

Kind validity (used by the Kind Validity audit pass):

- `runKindValidityPass(projectRoot, options?)` from `<ADEV_ROOT>/lib/hygiene/kind-validity.mjs` — walks every `*.spec.md` and `charter.md` under `.context-index/`, validates the frontmatter `kind:` discriminator against `SPEC_KINDS` / `CHARTER_KINDS`, and emits non-blocking findings. Options: `cutover` (ISO 8601 — defaults to `2026-05-14T00:00:00.000Z`), `moduleFilter` (slug to scope the audit). Returns `{ findings, headerNotes }`. Never throws; never mutates `process.exitCode`.
- `parseSpecFrontmatter(filePath)` from `<ADEV_ROOT>/lib/meta-tools.mjs` — the underlying frontmatter discriminator parser; projects `kind`, `kindValid`, `kindResolved` sentinels onto each parsed result.
- `getCreationTimestamp(filePath)` from `<ADEV_ROOT>/lib/git-timestamp.mjs` — resolves the authoritative creation timestamp (git first-add commit, mtime fallback); used to classify `MISSING_KIND` vs `LEGACY_DEFAULTED`.
