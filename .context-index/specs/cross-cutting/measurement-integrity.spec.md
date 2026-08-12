
# Live Spec: Measurement Integrity — trustworthy lifecycle telemetry and regression-visible test runs

<!-- Cross-cutting spec. Affects the report CLI, review/validate artifact writers,
     hygiene, the sessions post-commit hook, the gate CLI, and the test runner config.
     Source analysis: .context-index/research/harness-simplification-study.md (Phase 0). -->

---
mode: cross-cutting
affects: [lifecycle-state, validation, review, hygiene, sessions, gate-cli, ci]
kind: behavioral
status: review-blocked
risk_level: medium
tracker-ref: epic-101
revision: 1
created: 2026-08-12
updated: 2026-08-12
---

## Behavioral Contract

The harness simplification study (2026-08-12) found that the framework's own telemetry cannot be trusted as a measurement base: 77 of 415 test files are silently skipped by the CI glob, review/validate reports destroy per-attempt history on re-run, check IDs are free-text (4 spellings of the same check), one zero-information diagnostic accounts for 52% of event volume, 82 specs claim `validated` with no backing report, 85% of session files carry an empty `specs-touched`, and two gate mappings pass unconditionally. This spec makes measurement trustworthy before any loop-automation or simplification work builds on it (issues 560–565 under epic-101).

### Preconditions

- `.context-index/` exists with `lifecycle-state/` event logs and `governance/validate.yaml` (the live check registry).
- Report artifacts follow the current naming convention: `<spec-stem>.review.md` / `<spec-stem>.validate.md` co-located with the spec.
- The `.githooks/post-commit` chain is installed (for session capture behaviors).

### Behaviors

1. **When** `npm test` runs (locally or in CI) **then** every `tests/**/*.test.mjs` file at any directory depth executes, except files matched by an explicit, documented exclusion list (fixture projects' own suites, infra-dependent integration tests) — exclusion is never a side effect of shell glob semantics.
2. **When** `/adev:review-specs` or `/adev:validate` writes a report for a spec that already has a report at the canonical path **then** the existing report is first rotated to `<spec-stem>.review.<rev>.md` / `<spec-stem>.validate.<rev>.md` (monotonically increasing `<rev>`, never overwritten) and the new report is written to the canonical path — the canonical path always holds the latest attempt, so downstream gates are unaffected.
3. **When** `adev report --type validator` receives a `--validator` ID that is not in the canonical check-ID enum **then** the verb exits non-zero with `UNKNOWN_CHECK_ID`, appends no event, and prints the closed list of legal IDs. The enum has a single source of truth in `lib/` derived from the governance check registry.
4. **When** a lifecycle event is emitted for an artifact whose frontmatter is present and well-formed **then** no `adev/frontmatter-present` diagnostic payload is attached; the diagnostic (renamed `adev/frontmatter-missing`) is emitted only when frontmatter is absent or malformed.
5. **When** `/adev:hygiene` runs and a spec has `status: validated` with no co-located validate report (canonical or rotated) **then** hygiene raises a `VALIDATED_WITHOUT_REPORT` finding at error severity identifying the spec path.
6. **When** the post-commit session hook writes a session file **then** `specs-touched` is populated from the union of (a) changed `.context-index/specs/**/*.spec.md` paths in the commit and (b) `Spec:` commit trailers; **and when** a commit touches only self-referential paths (`.context-index/sessions/`, `.context-index/lifecycle-state/`) **then** no session file is written.
7. **When** `adev gate require` is invoked for a skill whose mapped step is not present in `STEP_ORDER` **then** the verb fails with `UNKNOWN_GATE_STEP` instead of passing unconditionally; the `brainstorm` and `retro` entries in `SKILL_STEP_MAP` are removed or mapped to real steps.
8. **When** any behavior above rejects an input (`UNKNOWN_CHECK_ID`, `UNKNOWN_GATE_STEP`) **then** the exit code and stderr message follow the existing CLI error contract (exit 1 for usage/validation errors, exit 2 for policy blocks) and are covered by unit tests.

### Postconditions

- A fresh clone running `npm test` executes the full recursive test suite; test-file count in CI output matches the on-disk count minus the documented exclusion list.
- For any spec with N review/validate attempts, all N reports are recoverable from the filesystem without git archaeology.
- The lifecycle event corpus contains no free-text check IDs going forward and no presence-only diagnostic payloads.
- Every `status: validated` spec is backed by at least one on-disk validate report, or is flagged by hygiene.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--validator` ID not in enum | Reject, print legal IDs, no event appended | `UNKNOWN_CHECK_ID` |
| Gate lookup for step absent from `STEP_ORDER` | Fail closed, name the offending skill/step mapping | `UNKNOWN_GATE_STEP` |
| Report rotation target already exists (rev collision) | Pick next free rev; never overwrite an existing rotated report | `ROTATION_COLLISION` (internal, auto-resolved) |
| `validated` spec with no report found by hygiene | Error-severity finding with spec path and remediation hint | `VALIDATED_WITHOUT_REPORT` |
| Session hook cannot derive any `specs-touched` and commit touches specs | Write the session file with the derivable subset and a `derivation: partial` marker — never silently `[]` | — |

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Applies because every change here (glob handling, file rotation, enum validation, hook edits) must use Node.js built-ins (`fs`, `path`, `child_process`) and POSIX shell only; no test-runner or glob library may be added.
- **Principle 4: "Hook protocol compliance"** — Applies because the post-commit session hook changes must preserve the stdin/env/exit-code contract and must never turn a capture failure into a failing commit.
- **Coding standard: Commit Trailers (`Spec:`)** — Applies because behavior 6 makes the `Spec:` trailer a machine-read input to `specs-touched`; the trailer format documented in the constitution is now load-bearing.
- **Quality gate: `npm test`** — Applies because behavior 1 changes what the single quality gate actually executes; the gate's meaning ("all tests pass") is restored to match its wording.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| lifecycle-state / report CLI (`lib/cli/report.mjs`, `lib/lifecycle-state.mjs`) | High | Check-ID enum enforcement; diagnostic rework (presence → missing-only) |
| review-specs + validate skills (`skills/review-specs/`, `skills/validate/`) | High | Report rotation before write; prose updated to name the rotation contract |
| hygiene (`skills/hygiene/`) | Medium | New `VALIDATED_WITHOUT_REPORT` audit pass |
| sessions hook (`.githooks/post-commit`, `hooks/`) | Medium | `specs-touched` derivation; self-referential-commit skip |
| gate CLI (`lib/cli/gate.mjs`) | Low | Remove/fix the two no-op mappings; fail closed on unknown steps |
| test runner config (`package.json`, `.github/workflows/ci.yml`) | Low | Recursive test discovery + explicit exclusion list |

## Integration Points

1. **report CLI ↔ governance check registry:** the check-ID enum is derived from `.context-index/governance/validate.yaml` check IDs plus the lib-defined step-scoped IDs — one source of truth, imported by both the CLI validation and the tests.
2. **report rotation ↔ lifecycle gates:** `requireGate` and review/validate verdict resolution read only the canonical report path; rotation must complete before the new canonical write so a crash never leaves zero reports on disk.
3. **hygiene ↔ rotated reports:** the `VALIDATED_WITHOUT_REPORT` pass accepts either the canonical report or any rotated revision as backing evidence.
4. **sessions hook ↔ commit trailers:** the `Spec:` trailer format defined in the constitution is parsed by the hook; a malformed trailer degrades to path-derived `specs-touched` (never a hook failure).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Fix test discovery | Replace the `sh`-truncated `**` glob in `package.json` with recursive discovery + explicit exclusion list; assert file-count parity in a meta-test | small |
| Fix gate mappings | Remove/remap `brainstorm` and `retro` in `SKILL_STEP_MAP`; fail closed on unknown steps; unit tests | small |
| Check-ID enum | Extract canonical ID list to lib; enforce in `adev report`; unit tests for reject path | medium |
| Diagnostic rework | Invert `adev/frontmatter-present` to missing-only emission; migration note for event consumers | small |
| Report rotation | Rotation-before-write in review-specs and validate write paths (lib helper + skill prose update); crash-safety ordering | large |
| Hygiene pass | `VALIDATED_WITHOUT_REPORT` audit over specs + rotated reports | medium |
| Sessions capture | `specs-touched` derivation from paths + trailers; self-referential skip; hook tests | medium |

## Acceptance Criteria

- [ ] A meta-test asserts the number of test files discovered by `npm test` equals on-disk `tests/**/*.test.mjs` count minus the documented exclusion list (behavior 1)
- [ ] Re-running validate on a spec with an existing report leaves both attempts on disk, latest at the canonical path (behavior 2)
- [ ] `adev report --type validator --validator bogus-id` exits non-zero, appends nothing, lists legal IDs (behavior 3)
- [ ] No `adev/frontmatter-present` payloads are emitted for well-formed artifacts; malformed frontmatter emits the renamed diagnostic (behavior 4)
- [ ] Hygiene flags a fixture spec with `status: validated` and no report; accepts one with only a rotated report (behavior 5)
- [ ] A fixture commit touching a spec file plus a `Spec:` trailer yields a session file with both entries in `specs-touched`; a sessions-only commit yields no session file (behavior 6)
- [ ] `adev gate require` for an unmapped step fails with `UNKNOWN_GATE_STEP` (behavior 7)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
