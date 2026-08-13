# Validation Report: Gate Doctor

> **Date:** 2026-08-13
> **Spec:** .context-index/specs/features/unified-gates/gate-doctor.spec.md
> **Plan:** .context-index/specs/features/unified-gates/gate-doctor.plan.md
> **Overall Status:** PASS

---

## Check 1: Quality Gates — PASS

- Tests: PASS — `npm test` — 5532 tests, 5530 pass, 0 fail, 2 todo (57.5s).
- Baseline before this change was 5476 tests with 1 failure
  (`tests/cli/verify.test.mjs` CON-5, a 100ms performance envelope that measured 562ms under
  concurrent machine load). That test passes in the post-change run. It is a load-sensitive
  timing assertion, unrelated to this spec, and is noted here only so the test-count delta
  reconciles: +56 tests, all from this change.

## Check 1.5: Source Manifest Verification — SKIP

- No source manifest stamped. `/adev:implement` was driven manually for this spec.

## Check 2: Spec Compliance — PASS

Every acceptance criterion has a named test in `tests/lib/gates/doctor.test.mjs` or
`tests/cli/gate-doctor.test.mjs`.

| Acceptance criterion | Evidence |
|---|---|
| `**` glob under-expansion reported with correct counts | "glob under-expansion is an error finding reporting both counts" — fixture has 2 files reachable under `sh`, 5 under true recursion |
| gitignored `cd` target reported | "gate cd-ing into a gitignored directory is an error finding (the repo-C case)" |
| `{{ }}` placeholder reported | "unsubstituted placeholder in a gate command is an error finding" |
| unresolvable binary reported; `node_modules/.bin` entry not | "gate whose binary does not exist…" + "resolveBinary honours project-local node_modules/.bin" |
| gate absent from CI reported; gate present in CI not | "a gate absent from CI warns ci-gate-not-invoked (the repo-B case)" + "a gate present in CI produces no ci-gate-not-invoked finding" |
| no CI directory reported | "a project with no CI at all warns ci-config-missing (the repo-C case)" |
| unrecognised runner warns, does not pass silently | "an unrecognised runner warns rather than passing silently" + "node:test also warns runner-unknown" |
| `--execute` under `ADEV_GATE_DOCTOR` spawns nothing | "--execute with ADEV_GATE_DOCTOR already set refuses to spawn" — asserts the side-effect marker file was never created |
| `--json` envelope shape | "--json emits a single parseable envelope on stdout" |
| exit 2 on error, 0 otherwise | "exits 2 when an error-severity finding fires" + "exits 0 with no error-severity findings" |
| runs with no manifest, no git repo, no node_modules | "runs to completion with no manifest, no git repo, and no node_modules" |

Behaviors added during implementation and back-written into the spec (7a and 15), both covered:

| Behavior | Evidence |
|---|---|
| 7a — package.json script indirection | "a ** glob hidden in package.json scripts.test is still caught", "runner detection also follows the npm script body", "resolveCommandChain follows npm run <script> and stops on a cycle" |
| 15 — corrected spawn environment | "--execute diffs runner collection against disk and reports the gap" fails without the `PWD` correction; "--execute sets ADEV_GATE_DOCTOR in the spawned environment" |

**Scope expansion:** none. `package.json` indirection (7a) was discovered during implementation
rather than specified up front, and it is squarely inside the spec's stated capability — without
it the doctor would not catch the very finding named in its Motivating Evidence table. It was
added to the spec, not smuggled past it.

## Check 4: Constitutional Compliance — PASS

| Principle | Evidence |
|---|---|
| 1. Minimize external dependencies | `lib/gates/doctor.mjs` imports only `node:fs`, `node:path`, `node:child_process`, and the repo's own `lib/profiles/yaml.mjs`. `package.json` dependencies unchanged. |
| 2. Skills are primarily markdown | `skills/validate/checks/validate.check-14-gate-executability.md` and the hygiene Pass 8 edit contain no executable logic — they name `adev gate doctor --json` and interpret its output. |
| 3. Pure ESM | `.mjs`, `import`/`export` throughout. No `require`, no `module.exports`. |
| 4. Hook protocol compliance | `gate doctor` exits 0 / 1 / 2 per the documented contract; `--json` writes a single object to stdout. |
| 5. Version parity | No version bumped. Releases are automated by release-please per ADR-0008. |
| No inline-Node in SKILL.md | Hygiene Pass 8 step 6 names the CLI verb; it contains no `node -e`, no `Run inline Node.js:` heading, and no fenced JavaScript. Verified against `hooks/pre-commit-no-inline-node.sh`. |
| CLI driver surface | `lib/cli/gate.mjs` does argument parsing, formatting, and exit-code mapping only; all diagnosis lives in `lib/gates/doctor.mjs`. The module's "does NOT export LIFECYCLE_STEP" note is preserved so `tests/cli-driver-pattern.test.mjs` does not assert requireGate-first against it. |
| Commit trailers | Every commit carries `Spec:`; implementation commits carry `Plan-task:`. |

## Check 8: Governance Boundaries — PASS

No file under `.context-index/tasks/` was written. No version field was modified. No file outside
this worktree was touched.

## Check 9: Transition Gates — SKIP

`transitions:` is empty in this project's `governance/gates.yaml`.

## Dogfooding

`adev gate doctor` run against this repo:

```
## Test collection
- [ ] gate-doctor/runner-unknown: Gate 'test': no known test runner identified in
      'npm test', so test collection cannot be verified.
Summary: 0 error(s), 1 warning(s).
```

This is the correct answer and worth stating plainly. This repo's `scripts.test` is
`node scripts/run-tests.mjs` — a bespoke runner with no collect-only mode. The doctor reports
that collection was **not** verified rather than reporting success, which is exactly the
behavior Structural Architect finding SA-3 insisted on.

## Open items for a human

- The `runner-unknown` warning on this repo is permanent until either Node's test runner gains a
  collect-only mode or `scripts/run-tests.mjs` grows a `--list` flag. `npm run test:list` already
  exists and prints the discovered file set — teaching `detectRunner` to recognise a project's own
  declared list command (via a `test_collection_query` key in `gates.yaml`) would close the loop
  for every bespoke runner at once. Deliberately not built here: it is a schema change to
  `gates.yaml`, which the charter puts behind human approval.
