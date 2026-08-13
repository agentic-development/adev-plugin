---
mode: cross-cutting
affects: [lifecycle-state, validation, review, hygiene, sessions, gate-cli, ci]
kind: behavioral
status: superseded
risk_level: medium
tracker-ref: epic-101
revision: 2
created: 2026-08-12
updated: 2026-08-13
superseded-by: "dissolved 2026-08-13 — see Disposition below"
---

# Live Spec: Measurement Integrity — trustworthy lifecycle telemetry and regression-visible test runs

<!-- Cross-cutting spec. Affects the report CLI, hygiene, the sessions writer,
     the gate CLI, and the test runner.
     Source analysis: .context-index/research/harness-simplification-study.md (Phase 0).
     Frontmatter precedes the H1 deliberately: `adev specify revise` cannot parse a
     spec whose frontmatter is not the first non-blank content. See epic-104. -->

## DISSOLVED 2026-08-13 — disposition of every behavior

This spec is **superseded**. It grouped seven fixes by a shared *motivation* ("make measurement trustworthy") rather than by a shared *contract* — different files, different modules, different failure modes. Reviewers evaluate contracts, so it fragmented under review: revision 1 blocked on report rotation, revision 2 blocked on the check-ID enum, and both were resolved by removing them rather than by revising in place. What remained was three small independent fixes already owned by other specs.

The review records are the durable artifact and are retained: `measurement-integrity.review.md` (rev 2) and `measurement-integrity.blockers.md`. Together they hold 32 findings across two rounds, four of which changed decisions materially.

| Behavior | Went to |
|---|---|
| 1 — full test discovery | **Landed.** PR #216 (`scripts/run-tests.mjs`, three-bucket partition, meta-test). Tracked by issue-560. |
| 2, 3 — check-ID enum | **`check-id-enum.spec.md`** (draft, blocked on the ADR-0010 boundary question). Carries blockers SA-9 and CON-6 plus five warnings as constraints. Tracked by issue-562. |
| *(withdrawn)* — `adev/frontmatter-present` rework | **Withdrawn as factually mistaken** (CON-1). The diagnostic fires only on missing/malformed frontmatter at severity `error`; its 52% event share counts ~400 real violations caused by the spec templates. Root cause tracked by `epic-104`; the study artifact carries the retraction. |
| 4 — hygiene `VALIDATED_WITHOUT_REPORT` | **Issue-563**, as a direct fix. `skills/hygiene/SKILL.md` is already owned by `spec-file-suffixes.spec.md`. Note reviewer finding SA-11: ADR-0010 may route this to `diagnostics.yaml` Tier 2 rather than a hygiene pass. |
| 5, 6 — sessions `specs-touched` + untrusted-input contract | **Issue-564**, as a direct fix. The executable-source half landed in PR #214 (merged). `.githooks/post-commit` and `lib/session-summary.mjs` are already owned by `session-summary-persistence.spec.md`. Reviewer findings SEC-6 and SEC-7 (unowned YAML-escaping obligation; deny-list rather than `assertWithin` containment) carry to that issue. |
| 7 — gate mappings fail closed | **Issue-565**, as a direct fix. `lib/cli/gate.mjs` is already owned by `driver-substrate.spec.md`. |
| *(split earlier)* — report rotation | **`report-rotation.spec.md`** (draft, blocked on an ADR-0012 amendment). Carries eight rotation-specific findings. Tracked by issue-561. |

**Why dissolved rather than revised a third time.** Each remaining behavior touches files another spec's source manifest already claims, so this spec added a competing ownership claim without adding traceability. Of its ten acceptance criteria one was met, and that one was implemented from its issue before this spec passed review. It drove no implementation. Its value was as a review trigger — and that value is preserved in the review records and in the two specs promoted out of it.

## Behavioral Contract (historical — superseded)

The harness simplification study (2026-08-12) found that the framework's own telemetry cannot be trusted as a measurement base: 77 of 416 test files were silently skipped by the `sh`-truncated CI glob, check IDs are free-text (four spellings of the same check), 82 specs claim `validated` with no backing report, 85% of session files carry an empty `specs-touched`, and two gate mappings pass unconditionally. This spec makes measurement trustworthy before any loop-automation or simplification work builds on it (epic-101).

**Scope note (revision 2).** Two behaviors were removed after architecture review rather than revised:

- *Report rotation* moved to `report-rotation.spec.md`. Rotated filenames conflict with ADR-0012's closed sidecar peer set, so that work requires an ADR amendment first. Keeping it here would have held the five remaining measurement fixes behind an architecture decision they do not depend on.
- *The `adev/frontmatter-present` rework* was **withdrawn as factually mistaken.** The diagnostic already returns `{ fired: false }` for well-formed frontmatter; it fires only on missing or malformed frontmatter at severity `error`, so its 52% share of lifecycle events counts ~400 genuine violations rather than noise. The root cause — six spec templates placing an H1 above the frontmatter delimiter — is tracked under `epic-104`. The study artifact carries the retraction.

### Preconditions

- `.context-index/` exists with `lifecycle-state/` event logs and `governance/validate.yaml` (the live check registry).
- Report artifacts follow the current naming convention: `<spec-stem>.review.md` / `<spec-stem>.validate.md` co-located with the spec.
- The `.githooks/post-commit` chain is installed (for session capture behaviors).

### Behaviors

1. **When** `npm test` runs (locally or in CI) **then** every `tests/**/*.test.mjs` file at any directory depth is accounted for — either executed, or placed in a named bucket whose membership rule is documented and asserted by a test. Exclusion is never a side effect of shell glob semantics, and the partition is reported on every run.
2. **When** `adev report --type validator` receives a `--validator` ID that is not in the canonical check-ID enum **then** the verb exits non-zero with `UNKNOWN_CHECK_ID`, appends no event, and prints the closed list of legal IDs. The canonical ID form is the **namespace-qualified** one used by `.context-index/governance/validate.yaml` (`validate.check-2-spec-compliance`); the loader normalises legacy unqualified IDs (`check-2-spec-compliance`, as documented in `lib/cli/report.mjs`) to the qualified form rather than rejecting them.
3. **When** the enum is consulted for an ID that was legal historically but has since been removed from the registry (`check-3`, `check-7`, `check-10`, `check-12-*`, retired by `check-set-restructure.spec.md`) **then** the ID is accepted for *reading* existing events and rejected for *emitting* new ones, so event replay and backfill over the historical corpus never hard-fail.
4. **When** `/adev:hygiene` runs and a spec has `status: validated` with no co-located `.validate.md` **then** hygiene raises a `VALIDATED_WITHOUT_REPORT` finding at error severity identifying the spec path.
5. **When** the post-commit session hook writes a session file **then** `specs-touched` is populated from the union of (a) changed `.context-index/specs/**/*.spec.md` paths in the commit and (b) `Spec:` commit trailers; **and when** a commit touches only self-referential paths (`.context-index/sessions/`, `.context-index/lifecycle-state/`) **then** no session file is written; **and when** a commit touches neither specs nor carries trailers **then** an empty `specs-touched` is the correct, non-anomalous outcome.
6. **When** any value derived from a commit message or a path reaches the session writer **then** it is treated as untrusted input: never interpolated into executable source, emitted as an escaped YAML scalar, and rejected if absolute or containing a `..` segment. The executable-source half of this contract is satisfied in code by PR #214 (`ADEV_PC_*` environment passing); this spec asserts the contract and the path-containment half, and does not re-specify the mechanism.
7. **When** `adev gate require` is invoked for a skill whose mapped step is not present in `STEP_ORDER` **then** the verb fails with `UNKNOWN_GATE_STEP` instead of passing unconditionally; the `brainstorm` and `retro` entries in `SKILL_STEP_MAP` are removed or mapped to real steps. The `specify` step (index 0, no predecessor) and `route` (in `OPTIONAL_GATE_STEPS`) keep their existing behaviour unchanged.
8. **When** any behavior above rejects an input (`UNKNOWN_CHECK_ID`, `UNKNOWN_GATE_STEP`) **then** the exit code and stderr message follow the existing CLI error contract (exit 1 for usage/validation errors, exit 2 for policy blocks), the rejected value is stripped of control/ANSI characters and truncated before being echoed, and each path is covered by unit tests.

### Postconditions

- A fresh clone running `npm test` accounts for every `*.test.mjs` on disk: each file is either executed or in a named, rule-documented bucket, and the buckets provably partition the tree with no overlap.
- Newly emitted `validator_report` events carry only namespace-qualified check IDs drawn from the registry; historical events with retired IDs remain readable.
- Every `status: validated` spec is backed by an on-disk validate report, or is flagged by hygiene.
- No value derived from a commit message reaches an executable-source position, and none can express an absolute or traversing path in `specs-touched`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `--validator` ID not in enum | Reject, print legal IDs, no event appended; echoed value stripped of control characters and truncated | `UNKNOWN_CHECK_ID` |
| `--validator` ID legal historically but retired from the registry | Accepted when reading existing events; rejected when emitting new ones | `REMOVED_CHECK_ID` (existing code, `lib/governance/validate-config.mjs`) |
| Gate lookup for step absent from `STEP_ORDER` | Fail closed, name the offending skill/step mapping | `UNKNOWN_GATE_STEP` |
| `validated` spec with no report found by hygiene | Error-severity finding with spec path and remediation hint | `VALIDATED_WITHOUT_REPORT` |
| Trailer value is absolute or contains `..` | Entry dropped from `specs-touched`; hook still exits 0 (capture failure must never fail a commit) | — |
| Commit touches specs but only some are derivable | Write the derivable subset with a `derivation: partial` marker | — |
| Commit touches no specs and carries no trailers | Empty `specs-touched` — the correct outcome, not an anomaly | — |

## System Constitution Reference

- **Principle 1: "Minimize external dependencies"** — Applies because every change here (glob handling, file rotation, enum validation, hook edits) must use Node.js built-ins (`fs`, `path`, `child_process`) and POSIX shell only; no test-runner or glob library may be added.
- **Principle 4: "Hook protocol compliance"** — Applies because the post-commit session hook changes must preserve the stdin/env/exit-code contract and must never turn a capture failure into a failing commit.
- **Coding standard: Commit Trailers (`Spec:`)** — Applies because behavior 6 makes the `Spec:` trailer a machine-read input to `specs-touched`; the trailer format documented in the constitution is now load-bearing.
- **Quality gate: `npm test`** — Applies because behavior 1 changes what the single quality gate actually executes; the gate's meaning ("all tests pass") is restored to match its wording.

## Module Impact Map

| Module | Impact | Changes Required |
|--------|--------|-----------------|
| report CLI (`lib/cli/report.mjs`) + registry loader (`lib/governance/validate-config.mjs`) | High | Check-ID enum enforcement, qualified-form normalisation, retired-ID read/emit split |
| hygiene (`skills/hygiene/`) | Medium | New `VALIDATED_WITHOUT_REPORT` audit pass |
| sessions writer (`.githooks/post-commit`, `lib/session-summary.mjs`) | Medium | `specs-touched` derivation from changed paths; path containment. Escaping mechanism already landing via PR #214 — coordinate, do not duplicate |
| gate CLI (`lib/cli/gate.mjs`) | Low | Remove/fix the two no-op mappings; fail closed on unknown steps |
| test runner (`package.json`, `scripts/run-tests.mjs`, `.github/workflows/ci.yml`) | Low | Node-side discovery + asserted bucket partition |

## Integration Points

1. **report CLI ↔ governance check registry:** `.context-index/governance/validate.yaml` is the single authority for check IDs; the CLI imports the same list the registry loader reads, so there is one source of truth rather than two overlapping ones. Per ADR-0010 the governance file is an override slot, not a second registry.
2. **report CLI ↔ historical event corpus:** retired IDs must stay readable, so the enum is consulted with a read/emit distinction rather than a single membership test.
3. **hygiene ↔ validate reports:** the `VALIDATED_WITHOUT_REPORT` pass reads the canonical `.validate.md` path only. If report rotation later lands (see `report-rotation.spec.md`), that spec owns extending this pass to accept rotated revisions as evidence.
4. **sessions writer ↔ commit trailers:** the `Spec:` trailer format defined in the constitution is parsed by the hook; a malformed or rejected trailer degrades to path-derived `specs-touched` and never fails the hook.
5. **this spec ↔ `report-rotation.spec.md`:** per-attempt report history was removed from this spec's scope because rotated filenames conflict with ADR-0012's closed sidecar peer set. That work, and the ADR amendment it requires, is specified separately and does not gate the behaviors here.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Fix test discovery | Replace the `sh`-truncated `**` glob with Node-side discovery; assert the bucket partition in a meta-test | small — **landed, PR #216** |
| Fix gate mappings | Remove/remap `brainstorm` and `retro` in `SKILL_STEP_MAP`; fail closed on unknown steps; unit tests | small |
| Check-ID enum | Import the registry's ID list in `adev report`; normalise legacy unqualified IDs; read/emit split for retired IDs; unit tests for both reject paths | medium |
| Hygiene pass | `VALIDATED_WITHOUT_REPORT` audit over specs and their canonical validate reports | medium |
| Sessions derivation | `specs-touched` from changed paths ∪ trailers; path containment; self-referential skip; hook tests. Sequence after PR #214 merges | medium |

## Acceptance Criteria

- [x] A meta-test asserts the discovery buckets partition every `*.test.mjs` on disk with no overlap, that depth ≥ 3 files are found, and that the npm script contains no shell glob (behavior 1 — landed, PR #216)
- [ ] `adev report --type validator --validator bogus-id` exits non-zero, appends nothing, and lists legal IDs with the echoed value sanitised (behaviors 2, 8)
- [ ] An unqualified but valid ID (`check-2-spec-compliance`) is normalised and accepted, matching the CLI's own documented example (behavior 2)
- [ ] A retired ID (`check-7-*`) is readable in an existing event and rejected on emit (behavior 3)
- [ ] Hygiene flags a fixture spec with `status: validated` and no `.validate.md` (behavior 4)
- [ ] A fixture commit touching a spec file plus a `Spec:` trailer yields a session file carrying both entries; a sessions-only commit yields no file; a commit with neither yields an empty `specs-touched` without a warning (behavior 5)
- [ ] A trailer containing an absolute path, a `..` path, and shell/JS metacharacters yields a well-formed session file, drops the unsafe entries, and executes nothing (behavior 6)
- [ ] `adev gate require` for an unmapped step fails with `UNKNOWN_GATE_STEP`, while `specify` and `route` keep their existing behaviour (behavior 7)
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
