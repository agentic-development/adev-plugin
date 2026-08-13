# Architecture Review: gate-doctor

> **Date:** 2026-08-13
> **Spec:** .context-index/specs/features/unified-gates/gate-doctor.spec.md
> **Charter:** .context-index/specs/features/unified-gates/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (blocker, Interface): issue-552 proposes a top-level `adev gates doctor`. A `gates`
  verb sibling to the shipped `gate` verb differs by one character and neither name suggests
  the other. **FIXED:** spec adopts `adev gate doctor` as a sub-verb of the existing `gate`
  dispatcher, and records the deviation from the issue text with its reason.
- **SA-2** (blocker, Behavior 10/11): this repo's own `test` gate is `npm test`, and the
  doctor is reachable from `/adev:validate` and `/adev:hygiene`, both reachable from a test
  run. Execution-by-default is reentrant. **FIXED:** static is the default; `--execute` is
  opt-in and carries an `ADEV_GATE_DOCTOR` environment reentrancy guard that terminates the
  cycle at depth one by construction.
- **SA-3** (blocker, Behavior 8): a doctor that silently passes on a runner it does not
  recognise reproduces the exact failure mode it exists to catch. **FIXED:** unrecognised and
  collect-only-less runners emit an explicit `runner-unknown` warning. `node --test` — the
  runner this repo uses — is in that category, stated in Known Limitations.
- **SA-4** (warning, Behavior 7): the glob check is the one that would actually have caught
  the adev-plugin finding, and it is the only family-(a) check that needs no execution.
  Accepted as specified; noted here so it is not later "simplified" into the `--execute` path.
- **SA-5** (warning, Behavior 10): "gate cannot run" and "gate ran and failed" are different
  signals. Conflating them would make the doctor a second test runner. **FIXED:** exit 127 /
  ENOENT / timeout → `gate-not-executable` (error); any other non-zero → `gate-failed`
  (warning, explicitly not the doctor's business).
- **SA-6** (suggestion, Wiring): validate check numbering. Highest historical ID is 13
  (heuristic extraction, relocated); 10 was removed and resurrecting it emits
  `RESURRECTED_CHECK_ID`. **RESOLVED:** new check takes the fresh number 14.
- **SA-7** (suggestion): `lib/governance/validate-config.mjs` restricts `kind:
  deterministic-check` to a bundled ID allowlist (`BUNDLED_DETERMINISTIC_IDS`). The new ID
  must join that set or the registry entry is rejected with `DETERMINISTIC_PROJECT`. Carried
  into the plan as an explicit task.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (blocker, command-injection): gate commands come from a VCS-tracked YAML file and
  the doctor may spawn them under `--execute`. **FIXED:** spawns use `execFile`-style argv
  arrays where the command is a single token, and `sh -c` only for commands the operator
  already declared as shell commands — the same trust boundary `runQualityGate` already
  operates under (SEC-1 of the unified-gate-system review: gate commands execute with local
  user permissions by design). The doctor adds no new trust boundary; it only makes an
  existing one visible earlier.
- **SEC-2** (warning, path-traversal): `--gates <path>` accepts an operator-supplied path.
  **FIXED:** resolved against `projectRoot` and rejected when it escapes, matching the
  containment guard in `gate.mjs` and `preflight.mjs`.
- **SEC-3** (warning, data-exposure): gate stdout/stderr under `--execute` may contain
  secrets. **FIXED:** the doctor records exit status and a truncated first line only; it never
  echoes full gate output. Findings carry messages the doctor composed, not runner output.
- **SEC-4** (suggestion, resource-exhaustion): the recursive walk could traverse
  `node_modules` on a large monorepo. **FIXED:** the walk carries a skip set
  (`node_modules`, `.git`, `dist`, `build`, `coverage`, `.venv`, `__pycache__`) and a node
  budget, mirroring `scripts/run-tests.mjs`.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning): Hygiene Pass 8 step 6 currently instructs "check that the binary exists
  on PATH … Do not run the command." Delegating to the doctor must not silently start running
  commands. **RESOLVED:** the doctor's static default preserves the instruction exactly; Pass
  8 invokes it without `--execute`.
- **CON-2** (warning): `skills/hygiene/SKILL.md` is subject to the per-H3-section both-forms
  rule (inline-Node and `adev <verb>` may not coexist in one section). Pass 8 has no
  inline-Node block, so adding the `adev gate doctor` invocation is clean. Verified against
  `.githooks/pre-commit-no-inline-node`.
- **CON-3** (suggestion): `.context-index/governance/validate.yaml` and
  `templates/domains/software/validate.yaml` must both gain the entry or downstream `/adev:init`
  scaffolds diverge from this project's own registry. Carried into the plan.
- **CON-4** (suggestion): the spec's Out of Scope must state that this repo's own glob bug is
  already fixed on `main` by `scripts/run-tests.mjs`, so a future reader does not re-open
  issue-560. **FIXED:** stated, with the mechanism named.

## Aggregate

No unresolved blockers. Proceed to `/adev:plan`.
