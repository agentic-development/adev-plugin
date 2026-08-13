---
charter: unified-gates
status: draft
kind: behavioral
risk_level: medium
milestone:
revision: 1
charter-revision: 2
created: 2026-08-13
updated: 2026-08-13
charter-extension: true
affects:
  - validation
  - maintenance
  - cicd
---

# Live Spec: Gate Doctor — Verify Declared Gates Run and Tests Get Collected

<!-- Live Spec within the unified-gates charter.
     Parent Charter: .context-index/specs/features/unified-gates/charter.md

     CHARTER EXTENSION: the charter declares the invariant "Every gate with a non-empty
     `command` and `kind: deterministic` is executable by skills" but ships nothing that
     verifies it. This spec adds the verifier. Charter revision 3 lands in the same change:
     one capability row and two qualified Out-of-Scope lines (CI config is *read*, never
     written; test *collection* is verified even though test *authoring* stays out of scope).
     `charter-revision:` stays at 2 — the charter's current revision — per repo convention;
     it is bumped when the charter edit lands, not before.

     Origin: issue-552, the highest-leverage finding of the 2026-08-10 three-repo audit
     (adev-plugin, alteryx_migration, ambev accelerator). All three repos wrote tests that
     never executed and adev never noticed. adev rigorously verifies test AUTHORSHIP
     (RED-state verification, immutable handoff hashes, gaming detection) and never once
     verifies test COLLECTION or EXECUTION. -->

## Capability

A deterministic diagnostic — `adev gate doctor` — that answers one question the framework has
never asked: **do the gates a project declares actually run, and do the tests a project wrote
actually get collected?**

It is a *doctor*, not a *gate*: it reports findings and never mutates project state.

## Motivating Evidence

| Repo | Failure | Detected by adev before this spec |
|---|---|---|
| adev-plugin | `npm test` glob `tests/**/*.test.mjs` under-expanded (`sh` has no globstar), silently skipping 77 of 416 test files | No |
| alteryx_migration | CI ran 19% of test files and **zero** Python tests — ~3,000 test functions across 70k LOC never executed | No |
| ambev accelerator | No CI at all; `pytest` not a declared dependency; declared gates `cd` into a **gitignored** directory, so they cannot execute anywhere | No |

Every one of these is statically detectable from files already on disk.

## Behavioral Contract

`adev gate doctor` loads `.context-index/governance/gates.yaml` — the charter's single source
of truth — walks five diagnostic families, and emits a finding list.

**Static by default.** The doctor performs no subprocess execution unless `--execute` is
passed. This is not conservatism for its own sake: this repo's own `test` gate command is
`npm test`, and the doctor is reachable from `/adev:validate` and `/adev:hygiene`, both of
which are reachable from a test run. Executing by default would be reentrant. Every check
that catches a real audit finding is available statically; `--execute` only adds runner
collection queries and gate smoke-runs.

### Diagnostic families

| # | Family | Finding IDs | Needs `--execute` |
|---|---|---|---|
| a | Test collection | `gate-doctor/glob-under-expansion`, `gate-doctor/collection-gap`, `gate-doctor/no-tests-collected`, `gate-doctor/runner-unknown` | Only for the runner query; glob analysis is static |
| b | Gate executability | `gate-doctor/binary-not-found`, `gate-doctor/empty-command`, `gate-doctor/gate-not-executable`, `gate-doctor/gate-failed` | Only the last two |
| c | CI wiring | `gate-doctor/ci-config-missing`, `gate-doctor/ci-gate-not-invoked` | No |
| d | Placeholders | `gate-doctor/unsubstituted-placeholder` | No |
| e | Path reachability | `gate-doctor/path-missing`, `gate-doctor/path-gitignored` | No |

### Preconditions

- `projectRoot` contains `.context-index/governance/gates.yaml`. Its absence is a finding
  (`gate-doctor/no-gates-configured`, warning), not an error — matching the charter's
  Backward Compatibility quality attribute.
- The doctor never requires `.context-index/manifest.yaml`, a git repository, a CI provider,
  or any specific language runtime. It must run against downstream projects that are not
  this repo; nothing about adev-plugin's own layout is hardcoded.

### Behaviors

1. **When** `gates.yaml` is absent or parses to an empty gate list **then** the doctor emits
   `gate-doctor/no-gates-configured` (warning) and exits 0. A project that has not configured
   gates is un-diagnosable, not broken.

2. **When** a gate's `command` contains an unsubstituted mustache placeholder (`{{ ... }}`)
   **then** the doctor emits `gate-doctor/unsubstituted-placeholder` (error) naming the gate
   and the literal placeholder text. A template that was scaffolded and never filled in is
   indistinguishable from a working gate until it runs.

3. **When** a gate's `command` is empty or absent and its `kind` is `deterministic` (the
   schema default) **then** the doctor emits `gate-doctor/empty-command` (warning). Gates
   with `kind: probabilistic` legitimately carry no command and are exempt — the charter's
   own invariant.

4. **When** the first executable token of a gate's `command` is neither a shell builtin nor
   resolvable on `PATH` **then** the doctor emits `gate-doctor/binary-not-found` (error).
   Resolution walks `PATH` directly and honours project-local `node_modules/.bin`, because a
   gate command of `jest` is satisfiable by a devDependency that is never on the operator's
   global `PATH`.

5. **When** a gate's `command` references a filesystem path (a `cd <dir>` argument, or any
   token containing a path separator that is not an option flag) **and** that path does not
   exist under `projectRoot` **then** the doctor emits `gate-doctor/path-missing` (error).

6. **When** such a referenced path exists **and** `git check-ignore` reports it ignored
   **then** the doctor emits `gate-doctor/path-gitignored` (error). This is the ambev finding
   verbatim: a gate that `cd`s into a gitignored directory passes locally for whoever created
   that directory and cannot execute for anyone else, including CI.

7. **When** a gate's `command` contains a glob whose pattern includes `**` **then** the doctor
   compares two expansions of that pattern rooted at `projectRoot`: the POSIX-`sh` expansion
   (where `**` degrades to a single `*` and therefore matches exactly one path segment) and a
   true recursive walk. **When** the recursive walk yields strictly more files **then** the
   doctor emits `gate-doctor/glob-under-expansion` (error) reporting both counts and up to ten
   example paths that `sh` would drop. This is the adev-plugin finding, and it is the check
   that would have caught it: it is runner-agnostic, needs no execution, and depends on
   nothing but the pattern and the tree.

8. **When** the doctor can identify the test runner behind a gate command **then** it records
   the runner and its collection-query command. Recognised runners and queries:

   | Runner | Detected from | Collection query |
   |---|---|---|
   | pytest | `pytest`, `python -m pytest` | `pytest --collect-only -q` |
   | jest | `jest` | `jest --listTests` |
   | vitest | `vitest` | `vitest list` |
   | go test | `go test` | `go test -list .` |
   | node:test | `node --test` | *none — the runner has no collect-only mode* |

   **When** the runner is unrecognised, **or** is recognised but has no collection query
   **then** the doctor emits `gate-doctor/runner-unknown` (warning) naming the gate and
   stating that collection could not be verified. It does **not** pass silently. A doctor that
   reports success on a runner it does not understand reproduces the exact failure mode it
   exists to catch.

9. **When** `--execute` is passed **and** a runner collection query is available **then** the
   doctor runs the query, parses the collected file set, and diffs it against a recursive
   on-disk walk for that runner's conventional test-file patterns. Files on disk that the
   runner does not collect are reported as `gate-doctor/collection-gap` (error) with counts
   and up to ten examples. A collected set that is empty while the disk set is non-empty is
   reported as the more pointed `gate-doctor/no-tests-collected` (error).

10. **When** `--execute` is passed **then** each deterministic gate command is run with a
    timeout (`--timeout <seconds>`, default 120) and its outcome classified. Exit status 127,
    or a spawn `ENOENT`, is `gate-doctor/gate-not-executable` (error) — the gate *cannot run*.
    Any other non-zero exit is `gate-doctor/gate-failed` (warning) — the gate ran and the
    project has a failing gate, which is a real signal but a different one, and not the
    doctor's business. Timeout is `gate-doctor/gate-not-executable`.

11. **When** `--execute` is requested **and** the environment variable `ADEV_GATE_DOCTOR`
    is already set **then** the doctor refuses to execute, downgrades to static mode, and
    emits `gate-doctor/reentrant-execution-skipped` (warning). The doctor sets `ADEV_GATE_DOCTOR=1`
    in the environment of every command it spawns. This makes the `npm test` → doctor →
    `npm test` cycle terminate at depth one by construction rather than by convention.

12. **When** no CI configuration is found **then** the doctor emits `gate-doctor/ci-config-missing`
    (warning). Recognised locations are `.github/workflows/*.yml|*.yaml`, `.gitlab-ci.yml`,
    `.circleci/config.yml`, `azure-pipelines.yml`, `Jenkinsfile`, and `.travis.yml`. The set is
    a constant, extensible without touching the diff logic.

13. **When** CI configuration exists **and** no CI file contains a gate's command **then** the
    doctor emits `gate-doctor/ci-gate-not-invoked` (warning) for that gate. Matching is a
    substring test against the raw CI text, first on the full command and then on its
    executable token — deliberately permissive, because a false *positive* here ("your gate
    isn't in CI" when it is, via a make target) costs an operator thirty seconds while a false
    negative reproduces the alteryx finding.

14. **When** `--json` is passed **then** stdout is a single JSON object carrying
    `schema_version`, `findings`, `runners`, and `summary`. Otherwise stdout is a
    human-readable report grouped by family. Exit code is 0 when no error-severity finding
    fired, 2 when one or more did, and 1 for argument errors — the hook protocol every other
    verb in this repo follows.

### Postconditions

- No file under `projectRoot` is created, modified, or deleted. The doctor is read-only.
- Every finding carries `id`, `severity`, `message`, and — where one exists — `gate` and
  `citation` (a `path:line` into `gates.yaml` or a CI file).

## Interface

`adev gate doctor [--json] [--execute] [--timeout <seconds>] [--gates <path>]`

A sub-verb of the existing `gate` verb rather than a new top-level `gates` verb. issue-552
proposed `adev gates doctor`; a `gates` verb sibling to the shipped `gate` verb is a standing
footgun (`adev gate require` vs `adev gates doctor` differ by one character and neither
suggests the other). `gate doctor` reuses the sub-dispatcher `gate` already has.

`lib/gates/doctor.mjs` exports `runGateDoctor({ projectRoot, execute, timeoutMs, gatesPath })`
plus the individually-testable primitives the behaviors above describe: `expandShGlob`,
`walkMatching`, `detectRunner`, `findCiConfigs`, `extractPlaceholders`,
`extractReferencedPaths`, `resolveBinary`, `isGitignored`.

## Wiring

- **`/adev:validate`** — a new registry check `validate.check-14-gate-executability`
  (`kind: deterministic-check`, severity `warning`) in the shipped software-domain starter and
  in this project's `governance/validate.yaml`. It is `warning`, not `error`: a project can
  legitimately have gates that are not in CI. `lib/governance/validate-config.mjs` gates
  `deterministic-check` behind a bundled ID allowlist, so the new ID joins that set.
- **`/adev:hygiene` Audit Pass 8** — step 6 today reads *"check that the binary exists on
  PATH … Do not run the command."* It delegates to `adev gate doctor --json`, which
  subsumes that check and adds the other four families. The "do not run" instruction is
  preserved by the doctor's static default.

## Acceptance Criteria

- [ ] `adev gate doctor` on a fixture whose gate command is `pytest tests/**/*_test.py` in a
      tree with two-level nesting reports `glob-under-expansion` with the correct file counts.
- [ ] A gate command of `cd build && npm test` where `build/` is gitignored reports
      `path-gitignored`.
- [ ] A gate command of `{{ test_command }}` reports `unsubstituted-placeholder`.
- [ ] A gate whose binary is `definitely-not-a-real-binary` reports `binary-not-found`; a gate
      whose binary is a project-local `node_modules/.bin` entry does not.
- [ ] A project with `.github/workflows/ci.yml` that never mentions the gate command reports
      `ci-gate-not-invoked`; one that does, does not.
- [ ] A project with no CI directory reports `ci-config-missing`.
- [ ] An unrecognised runner reports `runner-unknown` rather than passing silently.
- [ ] `--execute` with `ADEV_GATE_DOCTOR=1` already set reports
      `reentrant-execution-skipped` and runs no subprocess.
- [ ] `--json` output parses and carries `schema_version`, `findings`, `runners`, `summary`.
- [ ] Exit code is 2 when an error-severity finding fires, 0 otherwise.
- [ ] The doctor runs to completion against a fixture project that has no manifest, no git
      repository, and no `node_modules`.

## Out of Scope

- **Fixing** any finding. The doctor diagnoses; remediation is the operator's.
- **Writing or generating CI configuration.** CI files are read as text and never modified —
  the `cicd` charter owns their content.
- **Test authoring, TDD enforcement, gaming detection.** Owned by `write-test` and
  `implementation`. This spec verifies that authored tests are *collected*, which is the gap
  between those charters and `unified-gates`, and belonged to neither.
- **Probabilistic gate evaluation.** `kind: probabilistic` gates carry no command; the doctor
  skips them, as the charter requires.
- **The `npm test` glob bug in this repo.** Already fixed on `main` by `scripts/run-tests.mjs`,
  which replaced the shell glob with an in-Node recursive walk. issue-560 tracked it
  separately and has landed. This spec makes the *class* of bug detectable for downstream
  projects; it does not re-litigate the instance.

## Known Limitations

- **`node --test` collection cannot be verified by query.** Node's test runner has no
  collect-only mode. For node projects the doctor's coverage of family (a) is the glob
  analysis plus `runner-unknown`, not a true disk-vs-runner diff. This is honest reporting of
  a runner limitation, not a gap in the doctor — and it is precisely why behavior 8 mandates a
  visible `runner-unknown` finding rather than a silent pass.
- **CI invocation matching is textual.** A gate invoked in CI through an indirection the
  doctor cannot follow (a `make` target, a composite action, a script the workflow calls)
  produces a false `ci-gate-not-invoked` warning. Chosen deliberately: see behavior 13.
- **Path extraction from shell commands is heuristic.** The doctor does not implement a POSIX
  shell parser. It recognises `cd <dir>` and tokens containing a path separator. A gate that
  computes its own paths at runtime is not analysable statically.
- **Collection diffing under `--execute` trusts the runner's own output format.** A runner
  that changes its `--collect-only` output shape will degrade to `runner-unknown`, not to a
  false pass.
