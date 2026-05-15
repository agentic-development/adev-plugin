# Live Spec: Driver Substrate

<!-- Live Spec within the cli-driver-surface charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/cli-driver-surface/charter.md -->

---
charter: cli-driver-surface
status: validated
risk_level: medium
milestone: adev-compiler-discipline
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-14
source-manifest:
  sha: "1ac7197"
  files:
    - cli/index.mjs
    - lib/cli/gate.mjs
    - tests/cli-driver-pattern.test.mjs
    - tests/cli/dispatcher.test.mjs
    - tests/cli/gate.test.mjs
    - tests/fixtures/cli/conforming.mjs
    - tests/fixtures/cli/non-conforming-no-gate.mjs
    - tests/fixtures/cli/non-conforming-no-run.mjs
  computed-at: "2026-05-14T17:01:01.991Z"
drift_detected: true
drift_source: cli/index.mjs
drift_at: 2026-05-15T14:34:33.894Z
---

## Behavioral Contract

The driver substrate is the foundation of the compiler-driver pattern (`.context-index/research/adev-vs-compiler-dispatch-patterns.md` §2.1) for adev. It defines a uniform module convention (`lib/cli/<verb>.mjs`), a single dispatch table in `cli/index.mjs` that routes `adev <verb>` to the appropriate module, the helper-side `requireGate(state, <step>)` discipline that makes lifecycle gates uncircumventable, and one exemplar CLI verb — `adev gate require` — that simultaneously proves the pattern and ships as a usable primitive. After this spec lands, every subsequent helper extraction in the charter's scope (the `inline-node-extraction-sweep` spec) follows this template; no SKILL.md author has to design the helper signature, dispatch glue, or gate-call convention again.

### Preconditions

- Node.js runtime available; `package.json` declares `"type": "module"`.
- `.context-index/manifest.yaml` exists and is loadable by `lib/manifest.mjs::loadManifest`.
- `lib/lifecycle-state.mjs::{requireGate, currentState}` exports are present (consumed, not modified by this spec).
- The `cli` charter has been revised to rev 3 (single-file constraint dropped). This is a hard prerequisite: the first multi-file `lib/cli/` commit would otherwise violate the existing rev-2 `cli` charter constraint. The revision must land first (its own PR via `/adev:brainstorm --module cli`).

### Behaviors

1. **When** `adev <verb>` is invoked with a registered verb, **then** `cli/index.mjs` resolves the verb to its `lib/cli/<verb>.mjs` module, parses the verb-specific argv, and invokes the module's exported `run({...})` function.
2. **When** any `lib/cli/<verb>.mjs` module is loaded by the dispatcher, **then** that module exports two functions: `run` (accepts a single object parameter, returns a Promise) and `help` (accepts no arguments, returns or prints help text). Modules that do not conform fail the pattern test in `tests/cli-driver-pattern.test.mjs`. Modules bound to a lifecycle step additionally export `LIFECYCLE_STEP` (a string naming the step); `lib/cli/gate.mjs` is a query primitive, not a lifecycle step, and does NOT export `LIFECYCLE_STEP`.
3. **When** a `lib/cli/<verb>.mjs` helper is bound to a lifecycle step (declared via a per-module convention; see Postconditions), **then** the first executable statement in its `run({...})` function is a `requireGate(state, <step>, { mode })` call. The pattern test asserts this by AST-grepping each lifecycle-bound helper.
4. **When** `adev gate require --skill <skill-name> --spec <path>` is invoked, **then** the helper loads the lifecycle state for that spec via `currentState(projectRoot, spec)`, calls `requireGate(state, <step-derived-from-skill>, { mode })`, and exits 0 if the gate passes.
5. **When** `requireGate` throws a `GateError`, **then** `cli/index.mjs` catches it, prints the error message to stderr (one line, human-readable, citing the failing prerequisite), and exits with code 2 per the hook protocol.
6. **When** any other exception escapes a helper's `run()`, **then** `cli/index.mjs` catches it, prints the message and stack to stderr, and exits with code 1.
7. **When** `adev` is invoked with no verb, **then** `cli/index.mjs` prints the verb registry (one per line, with a one-line description), and exits 1.
8. **When** `adev <unknown-verb>` is invoked, **then** `cli/index.mjs` prints `"unknown verb: <verb>"` plus the verb registry, and exits 1.
9. **When** `adev <verb> --help` is invoked for a registered verb, **then** the dispatcher calls the module's exported `help()` function, and exits 0. `help()` is mandatory — every `lib/cli/<verb>.mjs` must export it; the pattern test asserts this alongside `run`. No fallback to "argv schema" is supported (removed for consistency with `adev-diagnose-cli.spec.md` Postcondition 1 and to keep the pattern uniform).

### Postconditions

- `lib/cli/gate.mjs` exists, exports `run({...})` and `help()`, and its `run()` first executable statement is `requireGate(state, ...)`.
- `cli/index.mjs` includes `gate` in the verb dispatch registry; the dispatch mechanism is a Map or object literal keyed by verb name, value is the dynamically imported module — no hardcoded `if/else if` chains.
- The verb-registration convention is documented inline in `cli/index.mjs` (a comment block above the registry, ≤30 lines, listing the contract: `run({projectRoot, argv, manifest})`, optional `help()`, exit code semantics).
- A new test file `tests/cli/gate.test.mjs` covers all 9 behaviors above for the `gate` verb.
- A new test file `tests/cli-driver-pattern.test.mjs` walks `lib/cli/*.mjs`, asserts every module exports `run` (function, accepts 1 object arg), and for any module that declares lifecycle-step binding (via a `LIFECYCLE_STEP` named export), AST-asserts that `requireGate` is the first executable statement inside `run`.
- The `cli-driver-surface` charter's "Driver substrate" and "`adev gate require` CLI verb" capability rows have `Status: implemented` (set by `/adev:implement` after this spec is validated).

### Error Cases

| Condition | Expected Behavior | Exit code |
|---|---|---|
| `adev` invoked with no verb | Print verb registry, exit | 1 |
| `adev <unknown-verb>` | Print `"unknown verb: <verb>"` + verb registry, exit | 1 |
| `adev gate require` missing `--skill` | Print usage for `gate require`, exit | 1 |
| `adev gate require` missing `--spec` | Print usage for `gate require`, exit | 1 |
| `adev gate require --skill X --spec <missing>` (spec file does not exist) | Print `"spec not found: <path>"` to stderr, exit | 1 |
| `requireGate` throws `GateError` | Print error message to stderr (one line), exit | 2 |
| Helper `run()` throws any other exception | Print message + stack to stderr, exit | 1 |
| `lib/cli/<verb>.mjs` exists but does not export `run` | Caught at dispatch import time; print `"verb <verb> missing run export"` to stderr, exit | 1 |
| Pattern test (`tests/cli-driver-pattern.test.mjs`) finds a `lib/cli/<X>.mjs` without `run` export | Test fails; CI rejects PR | n/a |
| Pattern test finds a lifecycle-bound helper whose `run()` first statement is not `requireGate` | Test fails; CI rejects PR | n/a |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies — prefer Node.js built-ins"):** All driver-substrate code uses only `node:fs`, `node:path`, `node:url`, and existing `lib/` modules. No new external dependencies. Argv parsing is hand-rolled or uses `node:util::parseArgs`.
- **Principle 2 ("Skills are primarily markdown — companion code is allowed but must not be required for the skill to function"):** This spec is the foundation that makes the constitution's spirit honor-able. After the substrate lands, SKILL.md prose names work (`adev <verb>`) and helpers do work. The current state — inline Node in SKILL.md that fires 1–4% of the time — violates this principle's intent (`.context-index/research/inline-node-extraction-scope.md` Recommendation 1).
- **Principle 3 ("Pure ESM"):** `lib/cli/gate.mjs` is `.mjs`, ESM-only, no CommonJS.
- **Principle 4 ("Hook protocol compliance"):** CLI exit codes follow the hook convention — 0 success, 2 gate-blocked. Exit 1 is reserved for fatal errors (unknown verb, missing argument, unexpected exception) and is not a "gate" in the hook protocol sense.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Define verb-registry pattern in `cli/index.mjs` | Replace the existing `cmdInstall`/`cmdStatus`/etc. dispatch with a Map-keyed registry. Document the contract inline. | Medium |
| Implement `cli/index.mjs` dispatch loop | Parse `process.argv`, resolve verb via registry, dynamic-import module, call `run({...})`, handle exit codes per behaviors 5–9. | Medium |
| Implement `lib/cli/gate.mjs` | Export `run({...})` and `help()`. `run` parses `--skill` and `--spec`, loads state, calls `requireGate`, exits 0/2. First executable line of `run` is `requireGate(...)`. | Small |
| Add `LIFECYCLE_STEP` named export convention | A `lib/cli/<verb>.mjs` that binds to a lifecycle step exports `export const LIFECYCLE_STEP = '<step>';`. The pattern test reads this to know whether to assert `requireGate` is first. | Small |
| Write `tests/cli/gate.test.mjs` | Cover all behaviors and error cases for `adev gate require`. Use node:test, no external test runner. | Medium |
| Write `tests/cli-driver-pattern.test.mjs` | Walk `lib/cli/*.mjs`, assert export shape; for `LIFECYCLE_STEP`-bound modules, AST-assert `requireGate` is the first statement of `run`. | Medium |
| Update `cli/index.mjs` `cmdHelp` for new dispatch | Print verb registry in `--help` output; preserve existing install/upgrade/uninstall/status/migrate listings. | Small |

## Acceptance Criteria

- [ ] `adev gate require --skill validate --spec <path>` exits 0 when the lifecycle state passes the gate for that step
- [ ] `adev gate require --skill validate --spec <path>` exits 2 when the gate fails (e.g., implement step not complete), with a clear stderr message
- [ ] `lib/cli/gate.mjs` exports `run({...})` and `help()`; `run`'s first executable statement is `requireGate(...)`
- [ ] `cli/index.mjs` uses a Map-keyed verb registry; adding a new verb is a one-line registration plus the `lib/cli/<verb>.mjs` module
- [ ] `tests/cli/gate.test.mjs` covers all 9 behaviors and all 10 error cases; passes
- [ ] `tests/cli-driver-pattern.test.mjs` walks `lib/cli/*.mjs`, asserts the uniform export shape, and for `LIFECYCLE_STEP`-bound modules asserts `requireGate` is the first executable statement of `run`
- [ ] Adding a non-conforming module (e.g., `lib/cli/broken.mjs` without a `run` export) makes `tests/cli-driver-pattern.test.mjs` fail
- [ ] `npm test` passes
- [ ] `adev` with no verb prints the registry and exits 1
- [ ] `adev <unknown-verb>` prints `"unknown verb"` and the registry, exits 1
- [ ] No constitutional violations introduced
- [ ] The `cli` charter has been revised to rev 3 (single-file constraint dropped), OR this spec's implementation PR includes that revision
