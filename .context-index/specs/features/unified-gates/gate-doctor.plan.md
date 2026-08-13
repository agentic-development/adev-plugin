<!-- DO NOT EDIT statuses inline — see lifecycle log gate-doctor.jsonl -->
# Implementation Plan: Gate Doctor

> **Methodology:** adev
> **Charter:** .context-index/specs/features/unified-gates/charter.md
> **Spec:** .context-index/specs/features/unified-gates/gate-doctor.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-13)
> **Platform:** Node.js, JavaScript (ESM), node:test, npm

**Goal:** Ship `adev gate doctor` — a read-only, zero-dependency diagnostic that verifies
declared gates can execute and declared test suites are collected — and wire it into
`/adev:validate` and `/adev:hygiene`.

**Architecture:** One new library module `lib/gates/doctor.mjs` holding every primitive and the
orchestrator. `lib/cli/gate.mjs` grows a `doctor` sub-verb that parses args, calls the library,
formats output, and maps findings to exit codes — the split every other verb in this repo uses
(`preflight.mjs` over `infra-preflight.mjs`, `diagnose.mjs` over `lib/diagnostics/`). No new
dependency; `node:fs`, `node:path`, `node:child_process`, `node:util` only.

---

## File Structure

**Create:**
- `lib/gates/doctor.mjs` — primitives + `runGateDoctor()`
- `tests/lib/gates/doctor.test.mjs` — primitive and orchestrator unit tests
- `tests/cli/gate-doctor.test.mjs` — subprocess CLI tests (exit codes, `--json` shape)
- `skills/validate/checks/validate.check-14-gate-executability.md` — check prompt body

**Modify:**
- `lib/cli/gate.mjs` — `doctor` sub-verb, updated `USAGE`/`help()`
- `lib/governance/validate-config.mjs` — add `validate.check-14-gate-executability` to `BUNDLED_DETERMINISTIC_IDS`
- `templates/domains/software/validate.yaml` — shipped starter registry entry
- `.context-index/governance/validate.yaml` — this project's registry entry
- `skills/hygiene/SKILL.md` — Pass 8 step 6 delegates to `adev gate doctor --json`
- `docs/cli-reference.md` — `gate` verb section documents the `doctor` sub-verb

---

## Tasks

### Task 1 — Gate loading and finding model

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** standard

Load `.context-index/governance/gates.yaml` via `parseYaml` from `lib/profiles/yaml.mjs`
(the repo's zero-dep parser). Containment-check `--gates` overrides. Define the finding
record (`id`, `severity`, `message`, `gate?`, `citation?`) and the `schema_version` envelope.
Absent/empty gates → `gate-doctor/no-gates-configured` (warning), exit 0. Covers Behavior 1.

### Task 2 — Family (d): placeholder detection

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** minimal

`extractPlaceholders(command)` returns every `{{ ... }}` occurrence. Emits
`gate-doctor/unsubstituted-placeholder` (error) per gate per placeholder. Covers Behavior 2.

### Task 3 — Family (b, static): binary resolution

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** standard

`resolveBinary(command, projectRoot)` — tokenize, skip leading `VAR=value` assignments, treat
shell builtins (`cd`, `echo`, `true`, `:`, `test`, `export`, `set`, `source`, `.`) as resolved,
walk `PATH`, and additionally probe `<projectRoot>/node_modules/.bin`. Emits
`gate-doctor/binary-not-found` (error) and `gate-doctor/empty-command` (warning, deterministic
gates only — `kind: probabilistic` is exempt). Covers Behaviors 3 and 4.

### Task 4 — Family (e): referenced-path reachability

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** standard

`extractReferencedPaths(command)` — recognise `cd <dir>` arguments and any non-flag token
containing a path separator, excluding tokens that are glob patterns (handled by Task 5).
Missing → `gate-doctor/path-missing` (error). Present but `git check-ignore`-ignored →
`gate-doctor/path-gitignored` (error). `isGitignored` degrades to `false` when there is no git
repo, so the doctor still runs on non-git projects. Covers Behaviors 5 and 6.

### Task 5 — Family (a, static): sh-globstar under-expansion

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** thorough

`expandShGlob(pattern, root)` expands a pattern under POSIX-`sh` semantics — `**` is a plain
`*` matching exactly one path segment. `walkMatching(pattern, root)` expands the same pattern
with true `**` recursion, honouring the skip set and node budget from SEC-4. When the recursive
set is strictly larger, emit `gate-doctor/glob-under-expansion` (error) with both counts and up
to ten dropped example paths. Covers Behavior 7. This is the check that would have caught the
adev-plugin finding and is tested against a fixture reproducing it.

### Task 6 — Family (a): runner detection

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** standard

`detectRunner(command)` maps a gate command to `{ runner, collectQuery, diskPatterns }` for
pytest, jest, vitest, `go test`, and `node --test`. Unrecognised runners, and recognised
runners with `collectQuery: null` (node:test), emit `gate-doctor/runner-unknown` (warning).
Covers Behavior 8.

### Task 7 — Family (c): CI wiring

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** standard

`findCiConfigs(projectRoot)` over the constant location set. None → `gate-doctor/ci-config-missing`
(warning). Present but no file contains the gate command (full string, then executable token) →
`gate-doctor/ci-gate-not-invoked` (warning) per gate. Covers Behaviors 12 and 13.

### Task 8 — `--execute`: reentrancy guard, gate smoke-run, collection diff

**Files:** `lib/gates/doctor.mjs`
**Tests:** `tests/lib/gates/doctor.test.mjs`
**Depth:** thorough

`ADEV_GATE_DOCTOR` already set → downgrade to static, emit
`gate-doctor/reentrant-execution-skipped` (warning), spawn nothing. Otherwise spawn each
deterministic gate with `ADEV_GATE_DOCTOR=1` and the `--timeout` budget; 127/ENOENT/timeout →
`gate-doctor/gate-not-executable` (error), other non-zero → `gate-doctor/gate-failed`
(warning). Where a `collectQuery` exists, run it, parse the collected file set, diff against
the disk walk: extra-on-disk → `gate-doctor/collection-gap` (error), empty-collected-with-
non-empty-disk → `gate-doctor/no-tests-collected` (error). Never echo gate output (SEC-3).
Covers Behaviors 9, 10, 11.

### Task 9 — CLI sub-verb

**Files:** `lib/cli/gate.mjs`
**Tests:** `tests/cli/gate-doctor.test.mjs`
**Depth:** standard

`adev gate doctor [--json] [--execute] [--timeout <s>] [--gates <path>]`. Human report grouped
by family; `--json` emits the envelope. Exit 2 on any error-severity finding, 1 on argument
error, 0 otherwise. Preserve the module's "does NOT export LIFECYCLE_STEP" comment so
`tests/cli-driver-pattern.test.mjs` does not assert requireGate-first. Covers Behavior 14.

### Task 10 — Validate registry wiring

**Files:** `lib/governance/validate-config.mjs`, `templates/domains/software/validate.yaml`,
`.context-index/governance/validate.yaml`, `skills/validate/checks/validate.check-14-gate-executability.md`
**Tests:** `tests/lib/gates/doctor.test.mjs` (registry-acceptance assertion)
**Depth:** standard

Add `validate.check-14-gate-executability` to `BUNDLED_DETERMINISTIC_IDS`, register the entry
(`kind: deterministic-check`, `severity: warning`, `after: [validate.check-1.5-source-manifest]`)
in both registries, and write the prompt body naming `adev gate doctor --json`.

### Task 11 — Hygiene Pass 8 delegation and docs

**Files:** `skills/hygiene/SKILL.md`, `docs/cli-reference.md`
**Tests:** none (markdown)
**Depth:** minimal

Rewrite Pass 8 step 6 to invoke `adev gate doctor --json` and surface its findings, preserving
the "do not run the command" guarantee via the static default. Document the sub-verb in
`docs/cli-reference.md` under the existing `gate` section. Re-run `scripts/sync-provider-skills.mjs`.

---

## Verification

`npm test` (full suite, via `scripts/run-tests.mjs`) must pass. `adev gate doctor` must run to
completion against a fixture project with no manifest, no git repo, and no `node_modules`.
