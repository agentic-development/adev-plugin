# Architecture Review: json-issue-board-adapter

> **Date:** 2026-05-11
> **Spec:** .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
> **Charter:** .context-index/specs/features/agent-reliable-state-artifacts/charter.md
> **Verdict:** BLOCK

last-reviewed-revision: 1
file-sha: 54b8168eabe56a7620ec933ee3b02d3a7aa6c048

## Reviewers Dispatched

| ID | Name | Mode | Profile | Prompt |
|----|------|------|---------|--------|
| structural-architect | Structural Architect | subagent | reviewer-reasoning | plugin:review-specs/structural-architect-prompt.md |
| security-reviewer | Security Reviewer | subagent | reviewer-capable | plugin:review-specs/security-reviewer-prompt.md |
| consistency-analyzer | Consistency Analyzer | subagent | reviewer-fast | plugin:review-specs/consistency-analyzer-prompt.md |

## Structural Architect (structural-architect)

**Verdict:** PASS_WITH_NOTES — no blockers, 3 warnings, 4 suggestions

- **SA-1** · suggestion · Postconditions: temp-file naming convention not specified; the architectural "no direct writes" CI test is well-defined but the symmetric "no orphan temp files between runs" cannot be asserted without a name shape.
- **SA-2** · warning · Behaviors/AC: granularity invariant rejects both-set, but is silent on `planTask`-only writes. Clarify whether solo `planTask` (without `planRef`) is also rejected.
- **SA-3** · warning · Behaviors/AC: legacy-read fallback reaches into `FileAdapter._read()` (private method of a sibling adapter). Either extract the markdown parser into a shared helper, or declare a public read method on `FileAdapter` that this spec contractually depends on.
- **SA-4** · warning · Behaviors: changing the default backend from `"file"` to `"json"` flips behavior silently for existing projects that omit the field. Add a behavior describing the first-read and first-write transition (advisory? auto-migrate? leave both files?).
- **SA-5** · suggestion · AC: "writers always emit current version" is in the Task Map but not pinned in AC. Add explicit AC: writes emit `version: 2` regardless of read version.
- **SA-6** · suggestion · Cross-spec: `BOARD_GRANULARITY_VIOLATION` references `reportPlanTask` — confirmed correct, no action needed (positive alignment).
- **SA-7** · suggestion · Error Cases: `ARCH_VIOLATION_DIRECT_WRITE` is build-time, not runtime — mixing it into the runtime error table can mislead implementers. Annotate or separate.

## Security Reviewer (security-reviewer)

**Verdict:** PASS_WITH_NOTES — no blockers, 2 warnings, 2 suggestions

- **SEC-1** · warning · input-validation: `MALFORMED_BOARD` surfaces "underlying JSON.parse error location" verbatim, potentially embedding raw file content from a malformed cloned-repo `tasks.json`. Truncate parser context to a fixed-length prefix and strip non-printables in the thrown message.
- **SEC-2** · warning · input-validation: `init()` and writes use caller-supplied `projectRoot` without normalization. A `projectRoot` containing `../../` would create directories outside the project boundary. Normalize via `path.resolve()` and assert `resolvedWritePath.startsWith(resolvedProjectRoot)` before any fs op. CWE-22.
- **SEC-3** · suggestion · secrets: advisory/deprecation log lines should be constrained to static strings + enum values; never interpolate raw manifest field values (e.g., `db_path` containing credentials).
- **SEC-4** · suggestion · input-validation: `UNSUPPORTED_BOARD_VERSION` error message could embed a crafted `version` string. Coerce to number and validate before interpolation.

**Cross-spec drift:** SEC-2 mirrors SEC-1 (lifecycle-event-log spec) — both should adopt the same `projectRoot` normalization contract to avoid drift.

## Consistency Analyzer (consistency-analyzer)

**Verdict:** BLOCK — 2 blockers, 3 warnings, 2 suggestions

- **CON-1** · warning · naming: same drift as the sibling spec — `planRef`/`planTask` (camelCase) vs `plan_ref`/`plan_task` (snake_case in task-management charter and event schema). Resolve via the same "Naming Conventions" note recommended for the sibling.
- **CON-2** · warning · naming: error-code family naming (`BOARD_GRANULARITY_VIOLATION`, `MALFORMED_BOARD`) vs sibling spec's `EVENT_SCHEMA_INVALID`, `GATE_BLOCKED`. Not necessarily wrong (the adapter is a different domain), but worth documenting the conventions for cross-spec consistency.
- **CON-3** · **blocker** · contract: legacy-issue tolerance window not explicit. Spec says legacy issues with both `planRef`+`planTask` are tolerated on read but cannot be re-validated into existence — but the AC and Behaviors don't pin this clearly. Add an explicit AC and a tolerance-window duration.
- **CON-4** · suggestion · terminology: no change required — `epicId` is internally consistent with the existing WorkItem convention.
- **CON-5** · **blocker** · contract: spec contradicts charter on `"file"` backend behavior. Spec says writes continue to work with a deprecation warning. Charter says `"file"` is "read-only-deprecated for one release cycle." Reconcile: align spec with charter (write rejection or auto-upgrade), or amend charter if writes-with-warning is the actual intent.
- **CON-6** · warning · domain-model: temp-file cleanup deferred without mirroring `lib/build-state.mjs`'s actual cleanup semantics. Either inherit exemplar's behavior explicitly or justify the deferral.
- **CON-7** · suggestion · naming: mixed snake_case/camelCase within `tasks.json` schema (`spec_ref` + `next_action` snake; `epicId` camel). This is the existing FileAdapter convention; document explicitly.

---

## Summary

**Total findings:** 17 (2 blockers, 8 warnings, 7 suggestions)

**Blockers (must resolve before planning):**
- CON-3: Legacy-issue tolerance window not explicit in AC/Behaviors
- CON-5: Spec contradicts charter on `"file"` backend (writes vs read-only)

**Action required:** Revise spec to resolve CON-3 (add explicit legacy-issue AC) and CON-5 (align with charter's read-only-deprecated intent OR amend the charter). Strongly consider warnings SA-2 (planTask-only writes), SA-3 (FileAdapter coupling), SA-4 (default flip behavior), SEC-1/SEC-2 (input validation + path traversal). Re-run `/adev:review-specs` after revision.
