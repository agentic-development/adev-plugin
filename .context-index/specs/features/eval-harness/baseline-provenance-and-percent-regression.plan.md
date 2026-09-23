# Implementation Plan: Baseline Provenance and Percent Regression

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-21, spec revision 3 — the `step_completed` event in `.context-index/lifecycle-state/baseline-provenance-and-percent-regression.jsonl`; the on-disk `.review.md` body still renders round 1's BLOCK and was not rewritten for round 3)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, `node:test`

**Goal:** Ship `lib/evals/baseline-schema.mjs` + `lib/evals/baseline.mjs` — `buildScoredRun`, `recordBaseline`, `loadBaseline`, `compareScores` — and the three CLI subverbs that wrap them, so a scored run can be committed as a baseline and a later run compared against it with a verdict that can never call judged movement a regression.

**Architecture:** A schema/executable module pair, exactly the shape `rubric-schema.mjs`/`rubric.mjs` and `score-schema.mjs`/`score.mjs` already set: `baseline-schema.mjs` holds frozen constants (the closed outcome enum, the seven Baseline fields, the RunRecord allow-list, the `rubric_id` pattern, the thirteen error codes) and has no imports and no I/O; `baseline.mjs` consumes them and never restates the contract. `compareScores` is pure arithmetic over two already-validated objects — the two malformed-input doors (`buildScoredRun` for the candidate, `loadBaseline` for the stored side) are closed upstream of it, so by the time the decision table runs, every number it divides by is finite and positive. The scoring engine is untouched: `scoreRubric`'s return shape is wrapped by the ScoredRun composite, never extended. The CLI adds three subverbs to the `switch (sub)` in `lib/cli/eval.mjs` — no `VERB_REGISTRY` entry, because `eval` is already registered at `cli/index.mjs:1978`.

**Review notes carried into this plan (PASS_WITH_NOTES, round 3):** two reviewer notes have no spec text of their own and land as plan obligations. (1) Wiring: *"`run_record` cost fields have no reader."* True and accepted — `compareScores` reads only `model_id`, `plugin_version` and `pricing_table`. Task 3's allow-list therefore validates all twelve charter RunRecord fields as **storage**, and Task 3's test pins that the nine cost fields are stored-and-unread rather than silently dropped, so the Run-cost record capability finds them present. (2) Boundary: *"deterministic half must not admit `INSUFFICIENT_EVIDENCE`."* This is BEH-15's per-half status split and is the single easiest thing to get wrong by writing one shared validator for both halves; Task 3 asserts the rejecting direction on the deterministic half specifically. Flag both in `/adev:implement` review.

---

## File Structure

**Create:**

- `lib/evals/baseline-schema.mjs` — frozen constants only: `COMPARISON_OUTCOMES`, `BASELINE_ERROR_CODES`, `REQUIRED_BASELINE_FIELDS`, `RUN_RECORD_FIELDS`, `RUBRIC_ID_PATTERN`, `BASELINE_DIR_SEGMENTS`. No imports, no functions, no I/O
- `lib/evals/baseline.mjs` — `buildScoredRun`, `recordBaseline`, `loadBaseline`, `compareScores`, plus the two named helpers Task 5 exports for direct test (`computeHalfDelta`, `computeDeltas`)
- `tests/lib/evals/baseline-schema-contract.test.mjs` — the constants, the charter-enum parity check, and the source-level determinism scan
- `tests/lib/evals/baseline-path-containment.test.mjs` — `BASELINE_INVALID_RUBRIC_ID`, `UNSAFE_BASELINE_PATH`, `BASELINE_NO_PROJECT_ROOT`, both symlink shapes
- `tests/lib/evals/baseline-scored-run.test.mjs` — `buildScoredRun`, `SCORED_RUN_INVALID`, the BEH-15 half-shape validator on both halves
- `tests/lib/evals/baseline-record-load.test.mjs` — the round trip, `BASELINE_EXISTS`, `--promote`, atomicity, the four read-path error codes
- `tests/lib/evals/baseline-deltas.test.mjs` — percent-of-attainable-max, `null` for status halves, the two precondition throws, `COMPARE_INVALID_INPUT`, determinism
- `tests/lib/evals/baseline-decision-table.test.mjs` — the six rows, `findings`, both verdict tables, the no-spread assertion
- `tests/cli/eval-baseline.test.mjs` — `adev eval baseline record` / `baseline show`
- `tests/cli/eval-compare.test.mjs` — `adev eval compare`, the exit-code matrix, and the docs-section assertion

**This Create list is the single source of the test-file count: eight test files — six under `tests/lib/evals/`, two under `tests/cli/`.** Every pinned literal path array in this plan and every count stated elsewhere refers to this list and to nothing else. Both bounded sweeps live in Task 8 and both pin their arrays against this list: the no-zero predicate takes all eight, and the registry-liveness scan takes all eight **minus `baseline-schema-contract.test.mjs`**, for the reason Task 8 states. An implementer who builds a shorter array than the one named has silently exempted a suite from a sweep, which is the failure both sweeps exist to prevent.

**Modify:**

- `lib/cli/eval.mjs` — `switch (sub)` gains `baseline` and `compare`; `USAGE`; `help()`
- `docs/cli-reference.md` — the `eval` section (`:922`) gains the three subverb signatures; the index row at `:64` gains them
- `.gitignore` — `.context-index/evals/baselines/*.tmp`, spliced beside the existing `.context-index/tasks/tasks.json.*.tmp` entry

**Reference (read, do not modify):**

- `lib/evals/score.mjs:480-571` — the exact half shape (`{status, points, max}`, key order load-bearing) and the four-key return `buildScoredRun` wraps
- `lib/evals/score-schema.mjs` — `HALF_STATUS_NOT_SCORED`, `HALF_STATUS_INSUFFICIENT_EVIDENCE`; import them, never re-spell the literals
- `lib/evals/rubric-schema.mjs:22-35` — `REQUIRED_TOP_LEVEL_KEYS`, where `rubric_id` and `version` come from
- `lib/evals/rubric.mjs:118,827` — `UNSAFE_RUBRIC_PATH` and `loadRubric`'s realpath-the-root-first containment sequence
- `lib/cli/eval.mjs:53-105` (the `absRoot` derivation at `:53`, `unsafeScorePathError` at `:75`, `containPath` at `:97`) and `lib/cli/eval.mjs:237-318` (`cmdScore`, whose contain-both-paths-before-reading-either ordering is at `:276-301`) — two ranges, because `cmdScore` sits well below the helpers it uses
- `lib/extensions/exec-payload.mjs::payloadDir` — pattern-before-`join`, containment-after
- `lib/path-safety.mjs` — `resolveContained`, `lenientRealpath`, `isContained`
- `lib/errors.mjs:25` — `codedError`
- `tests/lib/evals/rubric-path-containment.test.mjs` — the house symlink-containment test, and the symlinked-**file** case Task 2 extends with the symlinked-**directory** shape
- `tests/lib/evals/score-schema-contract.test.mjs` — the house shape for a frozen-constants contract test

---

## Context Packets

### Task 1 Context (schema module)
- Spec: Interface preamble, Error Cases (all thirteen rows), the Outcome Decision Procedure's enum, BEH-1's seven fields
- Charter: `eval-harness/charter.md:69,71,72,74` — the RunRecord, Baseline, ScoredRun and ScoreComparison entity rows
- Source: `lib/evals/score-schema.mjs` (full — the shape to imitate, and the constants to import rather than restate)
- Sample: `tests/lib/evals/score-schema-contract.test.mjs`
- Heuristic: "A universal coverage claim must ship with the predicate that checks it" — the determinism source scan is a universal, and its file glob and non-vacuity pin are what make it discharge anything

### Task 2 Context (path containment)
- Spec: BEH-14, and the `UNSAFE_BASELINE_PATH` / `BASELINE_INVALID_RUBRIC_ID` / `BASELINE_NO_PROJECT_ROOT` rows
- Source: `lib/evals/rubric.mjs` (containment sequence), `lib/extensions/exec-payload.mjs::payloadDir`, `lib/path-safety.mjs` (full)
- Sample: `tests/lib/evals/rubric-path-containment.test.mjs`
- Constraint: pattern before `join`, realpath the base **first**, `lenientRealpath` (the destination legitimately does not exist yet)

### Task 3 Context (ScoredRun + half validation)
- Spec: "The ScoredRun — what a comparison actually takes", BEH-15 in full (both paragraphs), `SCORED_RUN_INVALID`
- Source: `lib/evals/score.mjs:480-571`, `lib/evals/score-schema.mjs`
- Charter: `:69` — the twelve RunRecord fields, verbatim, as the allow-list
- Constraint: the deterministic and judged halves admit **different** status sets

### Task 4 Context (record / load)
- Spec: BEH-1, BEH-2, and the `BASELINE_NOT_FOUND` / `BASELINE_PARSE_ERROR` / `BASELINE_INCOMPLETE` / `BASELINE_EXISTS` / `BASELINE_NO_TIMESTAMP` rows; "Score baselines do not live beside trace baselines"
- Source: Task 2's resolver; `.gitignore:76` (the `tasks.json.*.tmp` precedent)
- Helpers: `tests/helpers.mjs` — `createTempDir`, `cleanupTempDir`, `writeFixture`
- Constraint: `{flag: 'wx'}`, temp derived from the **contained destination**, `renameSync`

### Tasks 5–6 Context (deltas + decision table)
- Spec: BEH-3 to BEH-13, the Outcome Decision Procedure and all three prose notes below it, Postconditions
- Source: `lib/evals/score.mjs` (half shape), Task 3's validator (already ran — do not re-validate, consume)
- Constraint: BEH-10 — no clock, no randomness; row 5's is-a-number clause; row 1 before row 3 with row 3's finding still recorded

### Tasks 7–8 Context (CLI)
- Spec: the three Interface table rows and their flags, the exit-code contract, Visual Expectations
- Source: `lib/cli/eval.mjs` (full), `docs/cli-reference.md:64,922-980`
- Sample: `tests/cli/eval-score.test.mjs`, `tests/cli/eval-default-rubric-e2e.test.mjs`
- Constraint: `1` is reserved for a fault and must not overlap any verdict code

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces and exclude directories that archive review artifacts.
- **Anti-pattern:** Widening the assertion to "no occurrence anywhere in the repository". An unbounded universal followed by a bounded list of examples cannot be discharged, and reads as coverage while providing none.
- **Applies to:** two criteria in this spec are phrased as universals and are the two most likely to ship as decoration. The determinism scan ("no module under `lib/evals/baseline*.mjs` references `Date.now`, `new Date`, `Math.random`") gets its glob, its match list, and a pinned matched-file count in Task 1. The unscored-half claim ("no test anywhere asserts `0` for an unscored half") gets a bounded path list — the eight test files named in the File Structure Create list, enumerated as a literal array in Task 8 — rather than a repo-wide sweep that no one can discharge. It is hosted in Task 8 rather than in Task 5 because only five of the eight files exist by the end of Task 5; an every-file-exists predicate run there would fail on three paths that no task has yet created.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8

There is no concurrency in this plan, and the group line says so rather than manufacturing one. Tasks 2 through 6 all extend the single file `lib/evals/baseline.mjs`, and Tasks 7 and 8 both extend the single file `lib/cli/eval.mjs`; running any two concurrently is a merge conflict rather than a speedup. The dependency edges are real as well as file-level: Task 3's validator is what Task 4 calls on the load path, Task 5's `computeDeltas` is what Task 6's decision table branches on, and Task 8's docs assertion covers all three subverbs, two of which Task 7 registers.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `baseline-schema.mjs` + contract, charter-enum parity, determinism scan | small | unit | — | 2 create, 0 modify |
| 2 | Baseline path resolution and containment | medium | unit | Task 1 | 1 create, 1 modify |
| 3 | `buildScoredRun` + the BEH-15 half-shape validator | medium | unit | Task 2 | 1 create, 1 modify |
| 4 | `recordBaseline` / `loadBaseline` round trip and atomicity | large | unit | Task 3 | 1 create, 2 modify |
| 5 | Percent deltas, precondition throws, determinism | medium | unit | Task 4 | 1 create, 1 modify |
| 6 | `compareScores` — the six-row decision table and `findings` | large | unit | Task 5 | 1 create, 1 modify |
| 7 | `adev eval baseline record` / `baseline show` | medium | unit | Task 6 | 1 create, 2 modify |
| 8 | `adev eval compare` + the exit-code matrix + docs | medium | unit | Task 7 | 1 create, 2 modify |

All eight tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `lib/**` and `tests/**` paths). Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:` and no task carries a non-unit strategy, so the Test Infrastructure Requirements section is omitted as well. Tasks 7 and 8 fork the CLI as a child process and write under `os.tmpdir()`; both are process-local and need no network, credential, or external system, so they are unit tests that happen to fork.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). Sixteen behaviours, thirteen error codes and six decision rows across the eight suites the File Structure Create list names; each behaviour, code and row is its own `test()`.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`. No routing tags are available to assign.

**Constitution boundary check:** no task adds a dependency (Node built-ins only — `node:fs`, `node:path`, `node:util`), creates a service, touches auth, changes the hook protocol, alters the CLI installation path structure, or changes the plugin registration format. Adding two subverbs to an **already-registered** verb's internal `switch` is not a change to the registration format; no `.claude-plugin/plugin.json` edit is in scope. **No task bumps `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json`** — release-please owns those (ADR-0008). No task touches a `skills/**/SKILL.md`, so the inline-Node pre-commit hook is a no-op here. Every new `.mjs` file is ESM.

**Falsification is a required step, not a nicety.** Eleven of this spec's acceptance criteria are of the form "X rather than Y" where Y is what a plausible wrong implementation returns — a corrupted baseline reporting `no-regression`, an unscored judged half reporting `judge-attributable`, an absolute-difference delta passing every percentage test but one. Each task below therefore names the perturbations that must turn its assertions red, and each perturbation names the assertion. A guard whose perturbation still passes is a defect in the guard.

---

### Task 1: `baseline-schema.mjs` + contract, charter-enum parity, determinism scan [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/evals/baseline-schema.mjs`
- Create: `tests/lib/evals/baseline-schema-contract.test.mjs`
- Test: `tests/lib/evals/baseline-schema-contract.test.mjs`

**Tests:** the contract test for a frozen-constants module, plus the two repository-level universals that have to be hosted somewhere and belong beside the constants they range over.

**Context to load:** the Task 1 Context Packet above.

- [ ] **Write failing test**

Create `tests/lib/evals/baseline-schema-contract.test.mjs`, following `score-schema-contract.test.mjs`:

1. **`BASELINE_ERROR_CODES`** is a frozen array holding exactly the **thirteen** codes the spec's Error Cases table names, no more and no fewer: `BASELINE_NOT_FOUND`, `BASELINE_PARSE_ERROR`, `BASELINE_INCOMPLETE`, `BASELINE_EXISTS`, `BASELINE_NO_TIMESTAMP`, `BASELINE_NO_PROJECT_ROOT`, `BASELINE_INVALID_RUBRIC_ID`, `BASELINE_SCORE_HALF_MALFORMED`, `SCORED_RUN_INVALID`, `UNSAFE_BASELINE_PATH`, `BASELINE_RUBRIC_MISMATCH`, `BASELINE_VERSION_MISMATCH`, `COMPARE_INVALID_INPUT`. Assert membership as a set, both ways, and `Object.isFrozen`. A code declared here and never thrown is the defect this charter exists to catch, so this array is also what Task 8's registry-liveness assertion iterates.
2. **`COMPARISON_OUTCOMES`** is a frozen array holding exactly `regression`, `judge-attributable`, `no-regression`, `incomparable`, `TRACE_FIXTURE_STALE` — five members. Assert `indistinguishable` is **absent**: it is a v2 member and this is the assertion that makes "no `indistinguishable` field while sampling is deferred" checkable at the enum rather than only per-result.
3. **Charter-enum parity.** Read `.context-index/specs/features/eval-harness/charter.md`, locate the `| ScoreComparison |` row, assert the row was found (a `null` match must fail, not skip), and assert each of the five `COMPARISON_OUTCOMES` members occurs in it. This is the executable half of the acceptance criterion that the charter carries `no-regression`; without the found-the-row assertion the check passes on a renamed charter.
4. **`REQUIRED_BASELINE_FIELDS`** holds exactly the seven BEH-1 fields: `rubric_id`, `rubric_version`, `run_record`, `score`, `recorded_at`, `model_id`, `plugin_version`.
5. **`RUN_RECORD_FIELDS`** holds exactly the twelve charter RunRecord fields (`duration_ms`, `input`, `output`, `cache_creation`, `cache_read`, `cost`, `total_turns`, `tool_turns`, `subagent_rollup`, `model_id`, `plugin_version`, `pricing_table`). Assert the three `compareScores` actually reads — `model_id`, `plugin_version`, `pricing_table` — are members, so the allow-list cannot be narrowed to the read set by a later "cleanup".
6. **`RUBRIC_ID_PATTERN`** is a `RegExp` whose source is `^[a-z][a-z0-9-]*$`. Assert it rejects `../escape`, `a/b`, `A`, `1x`, the empty string, and accepts `orders-rubric`.
7. **No status literals are re-declared.** The module's source contains neither the string `NOT_SCORED` nor `INSUFFICIENT_EVIDENCE` — those live in `score-schema.mjs` and are imported by `baseline.mjs`. A second copy is the duplication the charter's Naming attribute prohibits.
8. **Determinism source scan.** Glob `lib/evals/baseline*.mjs` from the repo root, assert the matched set is **non-empty and equal to the pinned list** (`['baseline-schema.mjs']` at this task; Task 3 raises it to `['baseline-schema.mjs','baseline.mjs']` in the same commit that creates the second file), and for each matched file assert its source contains none of `Date.now`, `new Date`, `Math.random`. The pinned list is the non-vacuity predicate: a glob that silently matches nothing passes a for-each over an empty set, which is exactly the coverage-shaped nothing this plan's heuristic names.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-schema-contract.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/evals/baseline-schema.mjs'`, and the glob assertion fails on an empty match set.

- [ ] **Implement**

Write `lib/evals/baseline-schema.mjs`: a module docstring stating that this module IS the schema and that `baseline.mjs` consumes it without restating it, then the six `Object.freeze` exports, each with a one-line comment tying it to its spec anchor (BEH-1 for the field list, the Error Cases row for each code, the charter entity row for `RUN_RECORD_FIELDS`). No imports. No functions. No I/O.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-schema-contract.test.mjs`
Expected: PASS.

- [ ] **Falsify each guard**

| Guard | Perturbation | Assertion that must go red |
|---|---|---|
| 1 | delete `COMPARE_INVALID_INPUT` from the array | the both-ways set comparison |
| 1 | add `BASELINE_SOMETHING` | the both-ways set comparison (the extra-member direction, separately) |
| 2 | add `indistinguishable` | the absent-member assertion |
| 3 | point the charter read at a nonexistent path | the row-found assertion, **not** a silent pass |
| 3 | rename `no-regression` to `no_regression` in `COMPARISON_OUTCOMES` | the parity assertion |
| 5 | narrow `RUN_RECORD_FIELDS` to the three read fields | the twelve-field equality |
| 6 | relax the pattern to allow slashes and dots | the `../escape` rejection |
| 7 | paste a local `NOT_SCORED` constant into the schema module | the no-re-declaration assertion |
| 8 | add a `Date.now()` call to the schema module | the determinism scan |
| 8 | change the glob to `lib/evals/baseline-nonexistent*.mjs` | the pinned-list equality — this is the one that proves the scan is not vacuous |

Revert each. Record the ten confirmations in the commit body.

- [ ] **Commit**

`feat(eval-harness): add baseline schema constants and their contract test`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 1`

---

### Task 2: Baseline path resolution and containment [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/evals/baseline-path-containment.test.mjs`
- Modify: `lib/evals/baseline.mjs` — created here, holding `resolveBaselinePath` and nothing else
- Test: `tests/lib/evals/baseline-path-containment.test.mjs`

**Tests:** BEH-14 in isolation, before any file is written or read. Landing containment first means every later task inherits a base that is already pinnable and already proven against both symlink shapes.

**Context to load:** the Task 2 Context Packet above.

- [ ] **Write failing test**

`resolveBaselinePath(rubricId, { projectRoot })` returns the real, contained absolute path `<projectRoot>/.context-index/evals/baselines/<rubric_id>.json`. Assert, each in its own `test()`, using `createTempDir` for the root:

- A conforming id resolves to exactly that path, and the returned value is the `lenientRealpath` form — on macOS a temp root under `/var` realpaths to `/private/var`, so asserting the raw join would pass for the wrong reason.
- `projectRoot` absent, `undefined`, `null`, or empty throws `BASELINE_NO_PROJECT_ROOT`. Assert on `err.code`, not on message text. **No test in this file constructs a path from `process.cwd()`** — assert that too, as a source-level match over this one file, which is the bounded predicate for the "no test relies on `process.cwd()`" criterion.
- `../../etc/passwd`, `a/b`, `.`, `..`, `A-rubric`, `1rubric`, `rubric_id`, and the empty string each throw `BASELINE_INVALID_RUBRIC_ID`. Prove the **ordering** with a deep-traversal id — `../../../../../../etc/passwd` — asserted on `err.code`, not merely on "it threw". Pattern-first yields `BASELINE_INVALID_RUBRIC_ID`; a build that runs the pattern test only after the `join` escapes the root and yields `UNSAFE_BASELINE_PATH`, so the two orderings are distinguishable by code. A shallow `../../etc/passwd` will **not** serve here: `join(root, '.context-index/evals/baselines', '../../etc/passwd.json')` normalises to `<root>/.context-index/etc/passwd.json`, which is still contained, and `lenientRealpath` (`lib/path-safety.mjs:77`) is lenient by design — a missing component makes it append the remainder literally and return rather than throw — so a pattern-after-`join` build would produce the same code as the correct one and the guard could not redden.
- **Symlinked file:** create `baselines/escapee.json` as a symlink to a file outside the root; `resolveBaselinePath('escapee', …)` throws `UNSAFE_BASELINE_PATH` reporting the offending value verbatim.
- **Symlinked directory:** replace `baselines/` itself with a symlink to a directory outside the root; a conforming id throws `UNSAFE_BASELINE_PATH`. This is the shape `tests/lib/evals/rubric-path-containment.test.mjs` does not cover and the criterion calls out by name.
- **A contained path is accepted on macOS:** a root that is itself reached through a symlink (a `createTempDir` under `/var`) resolves rather than being rejected. This is the regression the realpath-the-base-first ordering exists to prevent, and without it a "safer" refactor to a raw `startsWith` passes every rejection test above.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-path-containment.test.mjs`
Expected: FAIL — `Cannot find module '../../../lib/evals/baseline.mjs'`.

- [ ] **Implement**

Create `lib/evals/baseline.mjs` with `resolveBaselinePath` only. The ordered sequence is the whole point of the task: assert `projectRoot` is a non-empty string (`BASELINE_NO_PROJECT_ROOT`); test `rubricId` against `RUBRIC_ID_PATTERN` (`BASELINE_INVALID_RUBRIC_ID`) **before any `join`**; take `rootReal = lenientRealpath(resolve(projectRoot))`; `join` the four segments; then require `isContained(lenientRealpath(abs), rootReal)` or throw `UNSAFE_BASELINE_PATH` naming the caller-supplied `rubricId` verbatim. `lenientRealpath` rather than `realpathSync`, because Task 4's destination legitimately does not exist yet.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-path-containment.test.mjs`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| move the pattern test to after the `join` | the `../../../../../../etc/passwd` case's `err.code` assertion — it flips from `BASELINE_INVALID_RUBRIC_ID` to `UNSAFE_BASELINE_PATH` |
| replace the containment check with a bare `startsWith` on the unrealpathed root | the macOS contained-path acceptance test |
| drop the `lenientRealpath` on the candidate | both symlink tests — run them separately, since a file-only implementation still passes the directory case |
| relax the pattern to allow underscores | the `rubric_id` rejection |
| default `projectRoot` to `process.cwd()` | the `BASELINE_NO_PROJECT_ROOT` test |

Revert each.

- [ ] **Commit**

`feat(eval-harness): add contained baseline path resolution`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 2`

---

### Task 3: `buildScoredRun` + the BEH-15 half-shape validator [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/evals/baseline-scored-run.test.mjs`
- Modify: `lib/evals/baseline.mjs` — `buildScoredRun` and the internal `assertScoreHalves` / `assertRunRecord`
- Modify: `tests/lib/evals/baseline-schema-contract.test.mjs` — raise the determinism scan's pinned glob list to two files
- Test: both files

**Tests:** the composite and the shape gate. BEH-15 is the most consequential validator in this spec — it is what stops `NaN` from reaching the decision table and landing on row 6 as `no-regression` — and it is stated per field and per half, which is how it must be tested.

**Context to load:** the Task 3 Context Packet above.

- [ ] **Write failing test**

`buildScoredRun({rubric, score, runRecord, traceDrift})` returns `{rubric_id, rubric_version, score, run_record, trace_drift}`. Assert:

- **Happy path** — given a `loadRubric` result and a real `scoreRubric` result, the returned object carries `rubric_id` and `rubric_version` from the rubric (`rubric.rubric_id`, `rubric.version`), `score` **verbatim and deep-equal** to the `scoreRubric` output, `run_record` allow-listed, and `trace_drift: null` when omitted.
- **`scoreRubric`'s return shape is unchanged** — score a real rubric and assert the result's own keys are exactly `verdicts`, `deterministic`, `judged`, `total`, and that `rubric_id` is **not** among them. This is the criterion that the composite wraps rather than extends, and it belongs here because this is the task that would be tempted to extend it.
- **RunRecord allow-list** — a record carrying an unknown key throws `SCORED_RUN_INVALID` naming the key. A record carrying all twelve fields round-trips all twelve, including the nine cost fields nothing reads yet (the wiring reviewer's carry-forward: stored and unread, not dropped). A record missing `model_id`, `plugin_version`, or `pricing_table` throws — those three have readers in Task 6.
- **`SCORED_RUN_INVALID`** for: a non-object argument; a missing `rubric`; a missing `score`; a missing `runRecord`; and a `traceDrift` that is neither `null` nor `{fixture: string, drifted_pointers: string[]}` — the two fields BEH-12's message reads, asserted by shape, not by presence.
- **BEH-15, per half, per field.** The deterministic half accepts `status: null` (finite non-negative `points`, finite `max` greater than zero) and `status: NOT_SCORED` (`points: null`, `max: null`), and **rejects `INSUFFICIENT_EVIDENCE`** with `BASELINE_SCORE_HALF_MALFORMED` — the boundary reviewer's carry-forward, and the case a single shared validator gets wrong. The judged half accepts all three statuses. Both halves reject: a zero `max`; a negative `max`; a numeric-string `points`; a negative `points`; a `NaN` `points`; a non-object half; a `NOT_SCORED` half carrying a numeric `points`; and an unknown status string.
- **Well-formed `NOT_SCORED` is accepted** — `{status: NOT_SCORED, points: null, max: null}` passes on both halves. Asserted explicitly, because an unconditional finite-`max` check passes every rejection above while making decision row 2 unreachable.
- Statuses are compared against the imported `HALF_STATUS_*` constants; assert the test file itself imports them rather than spelling the literals.

Raise the Task 1 determinism glob pin to `['baseline-schema.mjs','baseline.mjs']` in this same commit, so the pinned-list equality does not start failing on an unregistered file.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-scored-run.test.mjs`
Expected: FAIL — `buildScoredRun` is not exported.

- [ ] **Implement**

Add `buildScoredRun`, a private `assertScoreHalves(score, side)` and a private `assertRunRecord(runRecord)` to `lib/evals/baseline.mjs`. Keep the allow-list check in its own function from the outset — Task 4's `recordBaseline` calls it directly, and a copy of the field list in two places is the drift this schema/executable split exists to prevent. `assertScoreHalves` takes the admitted status set **per half** rather than one shared set, and the `status === null` branch is the only one that requires finite numbers — a `null` `max` is the legal companion of every status half. `side` is threaded only into the message so a failure names which side was malformed. Pure assembly, no I/O.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-scored-run.test.mjs tests/lib/evals/baseline-schema-contract.test.mjs`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| share one status set across both halves | the deterministic-rejects-`INSUFFICIENT_EVIDENCE` test |
| make the finite-`max` check unconditional (drop the `status === null` scope) | the well-formed-`NOT_SCORED`-accepted test |
| accept a zero `max` | the zero-`max` rejection |
| test `points` for presence instead of finiteness | the numeric-string rejection |
| turn the RunRecord allow-list into a delete-list | the unknown-key rejection |
| drop the three read fields from the required set | the missing-`pricing_table` rejection |
| have `buildScoredRun` copy `rubric_id` onto the score object | the `scoreRubric`-shape-unchanged test |

Revert each. The first two are the pair that matters: they must fail on **different** perturbations, or one validator is doing both jobs and one of the two criteria is unproven.

- [ ] **Commit**

`feat(eval-harness): add buildScoredRun and the per-half score shape validator`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 3`

---

### Task 4: `recordBaseline` / `loadBaseline` round trip and atomicity [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/evals/baseline-record-load.test.mjs`
- Modify: `lib/evals/baseline.mjs` — `recordBaseline`, `loadBaseline`
- Modify: `.gitignore` — add `.context-index/evals/baselines/*.tmp`
- Test: `tests/lib/evals/baseline-record-load.test.mjs`

**Tests:** BEH-1, BEH-2 and the five storage error codes. Every case runs against a `createTempDir` root; none reads or writes this repository's own `.context-index/`.

**Context to load:** the Task 4 Context Packet above.

- [ ] **Write failing test**

- **Round trip** — `recordBaseline(scoredRun, {recordedAt, projectRoot})` writes `<root>/.context-index/evals/baselines/<rubric_id>.json`; `loadBaseline(rubricId, {projectRoot})` returns an object deep-equal on all **seven** fields. Assert each field individually as well as the deep-equal, so a field dropped by the writer names itself. Assert `trace_drift` is **absent** from the stored record — a Baseline is a ScoredRun minus `trace_drift`, and storing it would make the round trip return a shape `compareScores` reads on the wrong side.
- **`model_id` and `plugin_version` are copied from `run_record`** and equal it. Assert both the top-level pair and the nested pair are present, since Task 6 reads only the nested one.
- **`BASELINE_EXISTS`** — a second `recordBaseline` without `promote` throws, and the on-disk bytes are byte-identical to before the attempt (read and compare the content; do not settle for an `mtime` check). With `promote: true` it overwrites and the round trip returns the new content.
- **`BASELINE_NO_TIMESTAMP`** — `recordedAt` absent, `null`, or empty throws. No fallback, no clock read.
- **`BASELINE_NO_PROJECT_ROOT`** on both functions.
- **`BASELINE_NOT_FOUND`** — `loadBaseline` for an id with no file throws, naming the id and the path searched.
- **`BASELINE_PARSE_ERROR`** — a file of malformed JSON throws, and the code is **distinct** from `BASELINE_NOT_FOUND`; assert both codes inside one test so a shared catch cannot satisfy both.
- **`BASELINE_INCOMPLETE`** — a JSON file missing each of the seven fields in turn throws, naming the missing field. Seven sub-cases, driven off `REQUIRED_BASELINE_FIELDS` so the loop cannot drift from the constant.
- **`loadBaseline` runs the BEH-15 validator** — a stored file whose deterministic half carries a zero `max` throws `BASELINE_SCORE_HALF_MALFORMED` on **load**, before any caller sees it. This is the stored-side half of the two-door criterion; Task 3 proved the candidate side.
- **`recordBaseline` refuses a hand-built ScoredRun with a bad `run_record`** — pass an object assembled by hand (never through `buildScoredRun`) whose score halves are perfectly well formed but whose `run_record` carries an unknown key, and separately one whose `run_record` is missing `pricing_table`: each throws `SCORED_RUN_INVALID`, naming the offending or missing key. This is what actually makes `buildScoredRun` the only path in. `assertScoreHalves` alone does not close the door — it validates score halves and nothing else, so a hand-built object with good halves and a malformed `run_record` would otherwise be written to disk unchallenged.
- **Atomicity** — the temp name is derived from the contained destination (`<dest>.tmp`), never from caller input. Assert the temp path's dirname equals the destination's dirname, and that after a successful write no file matching `*.tmp` survives in `baselines/`. Then simulate an interrupted promote: pre-create `<dest>.tmp` as a **directory** so the write or rename fails, call `recordBaseline` with `promote: true`, and assert it throws **and** the prior baseline's bytes are unchanged.
- **The `wx` flag on the temp write** — pre-create the temp file as a regular file and assert the write fails loudly rather than clobbering it.
- **`.gitignore`** — read `.gitignore` and assert it contains `.context-index/evals/baselines/*.tmp`; assert it contains **no** pattern that would ignore `baselines/*.json`, since baselines are committed on purpose (spec: "Score baselines do not live beside trace baselines").

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-record-load.test.mjs`
Expected: FAIL — `recordBaseline` is not exported, and the `.gitignore` assertion fails on the missing line.

- [ ] **Implement**

Add both functions to `lib/evals/baseline.mjs`, each calling `resolveBaselinePath` first. `recordBaseline`: require `recordedAt`; run `assertScoreHalves` on the incoming ScoredRun **and** re-run the same `run_record` allow-list gate `buildScoredRun` applies (factor it out of `buildScoredRun` as a private `assertRunRecord` in Task 3's commit rather than duplicating the field list) — score halves alone are not the whole ScoredRun contract; `mkdirSync(dirname, {recursive: true})`; refuse an existing destination unless `promote`; write `<dest>.tmp` with `{flag: 'wx'}`; `renameSync` onto the destination; unlink the temp on any failure. `loadBaseline`: read, parse, check `REQUIRED_BASELINE_FIELDS`, run `assertScoreHalves`, return. Splice the `.gitignore` line beside the existing `.context-index/tasks/tasks.json.*.tmp` entry with a comment naming this spec.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-record-load.test.mjs`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| write directly to the destination (drop temp-plus-rename) | the interrupted-promote prior-content assertion |
| derive the temp name from `rubricId` rather than from the contained destination | the temp-dirname-equals-destination-dirname assertion |
| drop the `wx` flag for a plain write | the pre-created-temp test |
| default `recordedAt` to a generated ISO timestamp | `BASELINE_NO_TIMESTAMP` **and** Task 1's determinism scan — both must go red |
| let `promote` default to true | the `BASELINE_EXISTS` bytes-unchanged assertion |
| catch a parse failure and rethrow `BASELINE_NOT_FOUND` | the distinct-codes assertion |
| skip `assertScoreHalves` on the load path | the stored zero-`max` test |
| have `recordBaseline` run `assertScoreHalves` **only**, dropping the `run_record` gate | the hand-built-bad-`run_record` `SCORED_RUN_INVALID` tests, both of them, while every score-half test stays green — the pair is what proves the two gates are distinct |
| store `trace_drift` on the record | the absent-field assertion |

Revert each.

- [ ] **Commit**

`feat(eval-harness): add recordBaseline and loadBaseline with atomic write`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 4`

---

### Task 5: Percent deltas, precondition throws, determinism [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/evals/baseline-deltas.test.mjs`
- Modify: `lib/evals/baseline.mjs` — `computeHalfDelta`, `computeDeltas`, `assertComparableInputs`
- Test: `tests/lib/evals/baseline-deltas.test.mjs`

**Tests:** the arithmetic half of `compareScores`, landed and proven before any outcome branches on it. `computeHalfDelta` and `computeDeltas` are named exports so the percentage rule can be tested directly rather than only through an outcome — the same reason `score.mjs` exports `resolveHalfStatus`.

**Context to load:** the Tasks 5–6 Context Packet above.

- [ ] **Write failing test**

`computeHalfDelta(baselineHalf, candidateHalf)` returns a number or `null`. `computeDeltas(baseline, candidate)` returns `{deterministic_delta, judged_delta}`.

- **Percent of the baseline side's attainable maximum (BEH-8).** Baseline `{points: 8, max: 10}` against candidate `{points: 6, max: 10}` returns `-20`, not `-2`. Assert the exact number, not merely the sign.
- **The rubric-grew case, which is the whole point of BEH-8.** Baseline `{points: 8, max: 10}` against candidate `{points: 16, max: 20}` — every verdict unchanged, the element count doubled — returns exactly `0`. An absolute-difference implementation returns `8` here and passes every other assertion in this file.
- **The denominator is the baseline side's max, never the candidate's.** Baseline `{points: 5, max: 10}` against candidate `{points: 5, max: 20}` returns `-25` (candidate is 25% of the baseline scale, so the drop is measured against 10), and swapping the two arguments returns a different number. This is what makes "of the baseline side's" a testable phrase rather than prose.
- **Sign and direction.** An improvement returns a positive number; a drop returns a negative one. Assert both, so an operand swap cannot pass.
- **BEH-9 — a status half yields `null`, never `0`.** Every combination in which either side's half carries `NOT_SCORED` or `INSUFFICIENT_EVIDENCE` returns `null`. Assert `strictEqual(delta, null)` and, separately, `notStrictEqual(delta, 0)` so a coerced falsy value cannot pass.
- **The bounded no-zero predicate is *not* hosted here.** The "no test anywhere asserts `0` for an unscored half" criterion needs a pinned array over all eight of this plan's test files with an every-file-exists assertion, and only five of the eight exist at the end of this task — `baseline-decision-table`, `eval-baseline` and `eval-compare` arrive in Tasks 6 to 8. Hosting it here would either fail on three not-yet-created paths or ship a five-entry array that silently exempts three suites. It is therefore hosted **whole in Task 8**, beside the registry-liveness scan, which needs the same complete file set for the same reason. The behavioural half of BEH-9 — a status half yields `null`, never `0` — stays here, above.
- **The three precondition throws are asserted through `computeDeltas`**, the exported surface a caller actually uses. `assertComparableInputs` is private and is not exported for direct test; `computeDeltas` calls it before any arithmetic, so the throws surface there and the tests below assert on `computeDeltas(...)`:
  - **`BASELINE_RUBRIC_MISMATCH`** — two sides with different `rubric_id` throw, naming both ids. Not `incomparable`; assert the throw, and assert no result object is returned.
  - **`BASELINE_VERSION_MISMATCH`** — same `rubric_id`, different `rubric_version`, throws naming both versions. Reachable only because `rubric_version` is persisted; assert it through a **real `loadBaseline` round trip** rather than a hand-built object, since that is the path the criterion says makes it reachable.
  - **`COMPARE_INVALID_INPUT`** — a non-object on either side; a side missing its `score` half; a side whose `score` is present but not an object. Each throws.
- **BEH-10 determinism** — `computeDeltas` called twice on the same inputs returns deep-equal results, and the module reads no clock (Task 1's scan already covers the source; this is the behavioural half).

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-deltas.test.mjs`
Expected: FAIL — `computeDeltas` is not exported.

- [ ] **Implement**

Add the three functions. `computeHalfDelta` returns `null` when either side's `status` is non-null, and otherwise `((candidate.points / candidate.max) - (baseline.points / baseline.max)) * 100` — normalised on each side against **its own** attainable maximum and expressed as a percentage-point difference, which is what makes the rubric-grew case exactly zero. `assertComparableInputs` runs the two precondition throws and `COMPARE_INVALID_INPUT` before any arithmetic; it does **not** re-run `assertScoreHalves`, which both input doors already ran.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-deltas.test.mjs`

- [ ] **Falsify each guard** — this is the task's most load-bearing step, because a delta function that returns a constant satisfies a surprising number of sign-only assertions

| Perturbation | Assertion that must go red |
|---|---|
| `return 0` unconditionally from `computeHalfDelta` | the exact `-20` assertion, the improvement-is-positive assertion, and the drop-is-negative assertion — all three, and if any stays green that assertion was only testing the sign of a constant |
| `return -1` unconditionally | the exact `-20` assertion and the improvement-is-positive assertion |
| return the absolute point difference (`candidate.points - baseline.points`) | the rubric-grew exactly-zero assertion |
| divide by the **candidate's** max on both terms | the different-maxima `-25` assertion |
| swap the operands (`baseline - candidate`) | the sign assertions |
| return `0` instead of `null` for a status half | the `strictEqual(delta, null)` assertions |
| return `incomparable` instead of throwing on a version mismatch | the `BASELINE_VERSION_MISMATCH` throw asserted through `computeDeltas` |
| have `computeDeltas` skip its `assertComparableInputs` call | all three precondition throws, together |

Revert each. Record all eight in the commit body.

- [ ] **Commit**

`feat(eval-harness): add percent-normalised half deltas and comparison preconditions`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 5`

---

### Task 6: `compareScores` — the six-row decision table and `findings` [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/lib/evals/baseline-decision-table.test.mjs`
- Modify: `lib/evals/baseline.mjs` — `compareScores`
- Test: `tests/lib/evals/baseline-decision-table.test.mjs`

**Tests:** one `test()` per decision row whose inputs match **only** that row, plus the reporting postconditions. The row-exclusivity requirement is the hard part: a fixture that matches two rows proves nothing about ordering.

**This task is not to be split, and that was adjudicated rather than overlooked.** `large` here reflects assertion count, not blast radius: the task is 1 create plus 1 modify, far under the 5-file threshold that would call for a split. More decisively, the outcome enum is closed and the mapping from inputs to outcome must be total, so there is no honest seam. A `compareScores` carrying only rows 1 to 3 has no value to return for the ordinary case and no row-6 fallthrough; it would be a function that cannot be tested against its own contract, and the "half" delivered would need throwing away when the rest landed. A later reader should not relitigate this.

**Context to load:** the Tasks 5–6 Context Packet above.

- [ ] **Write failing test**

`compareScores(baseline, candidate)` returns `{outcome, deterministic_delta, judged_delta, findings, baseline_verdicts, candidate_verdicts}`.

**The six rows, each matched by exactly one fixture.** Every fixture's two deltas are pinned numerically below, and each test asserts those two numbers alongside the outcome. Row exclusivity is then checkable by reading this list rather than taken on trust: no two rows whose conditions are delta-driven share a delta pair.

1. **Row 1 — `incomparable`** on a differing `run_record.model_id`, and separately on a differing `pricing_table`. Both read from `run_record` on **both** sides, never the Baseline's top-level copies: assert this by handing a baseline whose top-level `model_id` disagrees with its own `run_record.model_id` and confirming the verdict follows the nested value. The result names which field diverged. **Pinned: `deterministic_delta: null`, `judged_delta: null`** — the fixture's halves are otherwise identical, so provenance divergence is the only reason it is not row 6, and the `null` pair is what "reports no deltas" means concretely.
2. **Row 2 — `incomparable`** when either side's deterministic half is `NOT_SCORED`. Two fixtures, one per side. **Pinned: `deterministic_delta: null`, `judged_delta: 0`** — the judged halves are identical, so this fixture cannot also satisfy row 5's judged-movement clause.
3. **Row 3 — `TRACE_FIXTURE_STALE`** when the **candidate's** `trace_drift` is non-null, naming the fixture and the drifted pointers. Assert the message carries both `trace_drift.fixture` and every entry of `drifted_pointers`. Assert also that a **baseline** carrying a `trace_drift` field cannot reach this row — a stored Baseline has none, and Task 4 asserts it is not stored. **Pinned: `deterministic_delta: 5`, `judged_delta: 5`** — both positive, so rows 4 and 5 are excluded by the numbers. Row 3 is *not* delta-exclusive against row 6, and cannot be: a stale fixture says nothing about the scores. Its precedence over row 6 is an ordering property, proven by the both-problems fixture below rather than by these two numbers.
4. **Row 4 — `regression`** on a negative deterministic delta. The row's own fixture pairs it with a judged **improvement**, which is the criterion "deterministic regression plus judged improvement returns `regression`, not `judge-attributable`". **Pinned: `deterministic_delta: -20`, `judged_delta: 10`** — the negative deterministic value excludes rows 5 and 6, and the positive judged value is what makes the pairing load-bearing.
5. **Row 5 — `judge-attributable`** on identical deterministic halves plus judged movement, in **both** directions: a judged drop and a judged improvement each return `judge-attributable`, never `regression` and never `no-regression`. **Pinned: `deterministic_delta: 0` with `judged_delta: -15` (the drop fixture) and `deterministic_delta: 0` with `judged_delta: 15` (the improvement fixture)** — the zero deterministic value excludes row 4, and the non-zero judged value excludes row 6.
6. **Row 6 — `no-regression`** when neither half moved negatively. **Pinned: `deterministic_delta: 0`, `judged_delta: 0`** (the unmoved fixture) and **`deterministic_delta: 10`, `judged_delta: 10`** (the improved-on-both-halves fixture) — a zero judged delta excludes row 5, and two non-negative deltas exclude row 4.

**The two truthiness holes, each its own test:**

- **`null != 0` (row 5's is-a-number clause).** A rubric declaring **no `quality_dimensions`**: judged half `NOT_SCORED` on both sides, `judged_delta: null`, deterministic halves identical. Returns `no-regression`, **not** `judge-attributable`. A row-5 implementation missing the is-a-number clause passes every other test in this file and fails only this one.
- **`INSUFFICIENT_EVIDENCE` on the judged half** yields `judged_delta: null` and does **not** produce `incomparable` — rows 4 to 6 proceed on the deterministic half alone.

**Ordering and `findings`:**

- **Row 1 precedes row 3, and does not hide it.** One fixture carrying **both** a model mismatch and a non-null candidate `trace_drift`: `outcome` is `incomparable`, and `findings` still carries a staleness entry naming the fixture. This is the postcondition that one round trip surfaces every problem.
- **Row 2 precedes rows 4 to 6.** A fixture with a `NOT_SCORED` deterministic half **and** a judged movement returns `incomparable`, not `judge-attributable`.
- `findings` is an array on every result, empty when nothing else was detected — never `undefined`, never omitted.

**Reporting postconditions:**

- Every result carries `deterministic_delta` and `judged_delta` as **separate** fields whatever the outcome, including `incomparable` (where both are `null`) — assert the keys are present, not merely that they are correct when populated. Neither is ever summed into the other — and that is asserted **structurally**, by the pinned six-key both-ways comparison below, which already forbids any additional combined-score field from existing at all. Do **not** assert "no field equals their sum": with `deterministic_delta: -20` and `judged_delta: null`, `-20 + null === -20`, so `deterministic_delta` equals the sum and such a guard fails a correct implementation.
- Every result carries `baseline_verdicts` and `candidate_verdicts`, deep-equal to the respective `score.verdicts` (BEH-11 and the charter invariant).
- **BEH-13** — the result has **no** `spread`, `variance`, `stddev`, `samples`, or `indistinguishable` key. Assert over the result's own key set as a both-ways comparison against the pinned six-key list, so a new key added later fails here rather than shipping unnoticed.
- **A differing `plugin_version` alone is NOT `incomparable`** — same `model_id`, same `pricing_table`, different `plugin_version`, everything else identical: `no-regression`. The criterion calls this out as the case most likely to be "fixed" into a bug.
- **Determinism** — `compareScores` called twice on the same two inputs returns deep-equal results.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/baseline-decision-table.test.mjs`
Expected: FAIL — `compareScores` is not exported.

- [ ] **Implement**

Add `compareScores`. It calls `assertComparableInputs`, collects findings first (provenance divergence, `NOT_SCORED` deterministic halves, candidate trace drift) into one `findings` array, computes both deltas via `computeDeltas`, then walks the six rows top to bottom and returns the first match — with the full `findings` array attached whatever the outcome. Outcome literals come from `COMPARISON_OUTCOMES`, never spelled inline. Row 5's condition is `deterministic_delta === 0 && typeof judged_delta === 'number' && judged_delta !== 0`. Key order on the returned object is fixed and commented as part of the determinism postcondition, matching the convention `score.mjs` already documents.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/baseline-decision-table.test.mjs`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| drop the `typeof judged_delta === 'number'` clause from row 5 | the no-`quality_dimensions` test — and **only** that test; if another also goes red, one of the two fixtures is not row-exclusive |
| move row 3 above row 1 | the both-problems fixture's `incomparable` assertion |
| move row 1 above nothing but stop recording row 3's finding | the `findings` staleness-entry assertion, while the outcome assertion stays green — the pair proves ordering and disclosure are separate properties |
| delete row 2 | the `NOT_SCORED`-deterministic tests, both sides |
| let row 4 read `judged_delta < 0` as well | the deterministic-regression-plus-judged-improvement test and the row-5 both-directions test |
| return `regression` when only the judged half dropped | the row-5 judged-drop test |
| add `plugin_version` to row 1's provenance comparison | the differing-`plugin_version` test |
| read `model_id` from the Baseline's top-level copy | the disagreeing-top-level-copy fixture |
| add a `spread: null` key to the result | the pinned six-key both-ways comparison |
| return `findings: undefined` when empty | the always-an-array assertion |

Revert each.

- [ ] **Commit**

`feat(eval-harness): add compareScores and the six-row outcome decision table`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 6`

---

### Task 7: `adev eval baseline record` and `adev eval baseline show` [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/eval-baseline.test.mjs`
- Modify: `lib/cli/eval.mjs` — the `baseline` case in `switch (sub)`, `cmdBaselineRecord`, `cmdBaselineShow`, `USAGE`, `help()`
- Modify: `docs/cli-reference.md` — the two subverb signatures in the `eval` section
- Test: `tests/cli/eval-baseline.test.mjs`

**Tests:** the two write/read verbs end to end as a forked process, following `tests/cli/eval-score.test.mjs`. No new `VERB_REGISTRY` entry: `eval` is already registered at `cli/index.mjs:1978`, and the surfaces are the internal `switch`, `help()`, and the docs.

**Context to load:** the Tasks 7–8 Context Packet above.

- [ ] **Write failing test**

- **`baseline record`** with `--rubric <path> --score <path> --run-record <path> --recorded-at <iso8601>` reads all three files, assembles the ScoredRun through `buildScoredRun`, and writes the baseline. Assert the file lands at the contained path and round-trips through `loadBaseline`. Assert every library-required argument has a flag: omitting each of the four in turn exits non-zero with a message naming the missing flag, and `--recorded-at` in particular is **required** — no clock substitution, which is the CLI-side half of BEH-10.
- **`--trace-drift <path>`** is optional; supplied, it lands on the ScoredRun's `trace_drift`; omitted, `trace_drift` is `null`. A stored baseline never carries it either way.
- **`--promote`** overwrites; without it a second record exits non-zero with `BASELINE_EXISTS` in the message.
- **Containment** — a `--score` or `--run-record` path escaping the project root is refused by `containPath` before either file is opened, exiting non-zero with `UNSAFE_SCORE_PATH` (the existing code for a caller-supplied CLI path; `UNSAFE_BASELINE_PATH` is the derived-destination code and belongs to the library).
- **`baseline show --rubric-id <id>`** prints `rubric_id`, `rubric_version`, **`recorded_at`**, `model_id`, `plugin_version`, and both score halves. Assert `recorded_at` appears in stdout with its stored value — this is the criterion that gives `recorded_at` a reader. `--json` emits the loaded Baseline object; assert it parses and deep-equals `loadBaseline`'s return.
- **`baseline show`** for a missing id exits non-zero with `BASELINE_NOT_FOUND`.
- **`help()`** output names both subverbs, and the top-level `USAGE` string lists `baseline` — assert on the process output, not on the source.

- [ ] **Verify test fails**

Run: `node --test tests/cli/eval-baseline.test.mjs`
Expected: FAIL — `unknown subverb: baseline`, exit 1.

- [ ] **Implement**

Add `case "baseline":` to `switch (sub)`, dispatching on `argv[1]` to `cmdBaselineRecord` / `cmdBaselineShow` and rejecting any other third token with the usage banner. Both use `parseArgs` with `allowPositionals: false` and the existing `containPath` for every caller-supplied path, contained **before** any file is opened, matching `cmdScore`'s ordering. Neither restates a library contract: they read files, call the library, and render. Update `USAGE`, `help()`, and the `eval` section of `docs/cli-reference.md` (both the index row at `:64` and the section at `:922`).

- [ ] **Verify test passes**

Run: `node --test tests/cli/eval-baseline.test.mjs`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| default `--recorded-at` to a generated timestamp | the missing-flag exit test |
| drop `recorded_at` from `baseline show`'s rendering | the stdout `recorded_at` assertion |
| open `--score` before containing it | the containment test (point `--score` at a symlink escaping the root) |
| make `--promote` the default | the second-record `BASELINE_EXISTS` test |
| write `trace_drift` into the stored baseline | Task 4's absent-field assertion **and** the `--trace-drift` round-trip test |

Revert each.

- [ ] **Commit**

`feat(eval-harness): add adev eval baseline record and show`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 7`

---

### Task 8: `adev eval compare` + the exit-code matrix + docs [specialist: none]

**Charter capability:** Baseline provenance and percent-regression
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/cli/eval-compare.test.mjs`
- Modify: `lib/cli/eval.mjs` — the `compare` case, `cmdCompare`, `USAGE`, `help()`
- Modify: `docs/cli-reference.md` — the `compare` signature and the exit-code table
- Test: `tests/cli/eval-compare.test.mjs`

**Tests:** the gating surface. The exit-code contract is the capability's whole point in CI, and the fault code must not overlap a verdict — a gate that read a crash as `regression` is the broken-harness-reports-a-verdict failure this spec exists to prevent.

**Context to load:** the Tasks 7–8 Context Packet above.

- [ ] **Write failing test**

- **The exit-code matrix, one forked run per row**, asserting the exact numeric exit code:

  | Situation | Exit |
  |---|---|
  | `no-regression` | 0 |
  | `judge-attributable` | 0 |
  | `regression` | 2 |
  | `incomparable` | 3 |
  | `TRACE_FIXTURE_STALE` | 3 |
  | `BASELINE_NOT_FOUND` | 1 |
  | `BASELINE_PARSE_ERROR` | 1 |
  | `SCORED_RUN_INVALID` | 1 |
  | `BASELINE_SCORE_HALF_MALFORMED` | 1 |

  Assert **as a set** that no fault exits with a verdict code and no verdict exits with `1`: collect the nine observed codes and assert the fault rows are all `1` and no verdict row is `1`. A per-row assertion alone permits a later edit that turns one verdict into `1` and still passes eight rows.
- **Default rendering (Visual Expectations).** Without `--json`, stdout carries the verdict table, both deltas, **and** the `findings` list. Assert `findings` is rendered even when the outcome is `incomparable` and the finding is not the outcome — the postcondition that one round trip surfaces every problem, on the surface most users see.
- **`--json`** emits the ScoreComparison object verbatim; assert it parses and deep-equals `compareScores`'s return for the same inputs.
- **`--candidate` is caller-supplied JSON and gets the same guard as the stored side.** A `--candidate` file whose deterministic half carries a zero `max` exits `1` with `BASELINE_SCORE_HALF_MALFORMED`. This is the CLI-level proof of the two-door criterion.
- **Containment** on `--rubric`, `--candidate`, `--run-record`, and `--trace-drift`, all before any file is opened.
- **Error-code registry liveness.** Import `BASELINE_ERROR_CODES` and assert every one of the thirteen is asserted as a thrown code at least once across a pinned literal path array, with an assert that every path in the array exists. Two things make this predicate non-vacuous, and both are load-bearing:

  - **The array is the File Structure Create list minus `baseline-schema-contract.test.mjs` — seven paths — and that exclusion is pinned explicitly**, as a named constant with a comment giving the reason, plus an assertion that the excluded path is *not* a member. Task 1's guard 1 requires the contract test to enumerate all thirteen codes verbatim for its both-ways set comparison. If that file were scanned, every code would be found there whether or not any code path ever throws it, and the sweep would report full liveness over a registry of thirteen dead codes. Leaving the exclusion implicit invites a later "why is one file missing from this list?" edit that re-adds it and silently guts the check.
  - **A match counts only in an `err.code` assertion position** — `assert.strictEqual(err.code, "X")` or `assert.equal(err.code, "X")`, matched as such — never a bare textual occurrence of the code anywhere in the file. A code named only in a comment, a fixture string, an import list or a test title is not evidence that anything throws it.

  All thirteen are reachable under those two constraints: `BASELINE_INVALID_RUBRIC_ID`, `UNSAFE_BASELINE_PATH` and `BASELINE_NO_PROJECT_ROOT` from Task 2's suite; `SCORED_RUN_INVALID` and `BASELINE_SCORE_HALF_MALFORMED` from Task 3's and Task 4's; `BASELINE_NOT_FOUND`, `BASELINE_PARSE_ERROR`, `BASELINE_INCOMPLETE`, `BASELINE_EXISTS` and `BASELINE_NO_TIMESTAMP` from Task 4's; `BASELINE_RUBRIC_MISMATCH`, `BASELINE_VERSION_MISMATCH` and `COMPARE_INVALID_INPUT` from Task 5's. This is the executable predicate behind "a code declared and never emitted is the defect this charter exists to catch"; a repo-wide token grep would match the schema module's own declaration and prove nothing.
- **The bounded no-zero predicate, relocated here from Task 5.** Host the executable check for the "no test anywhere asserts `0` for an unscored half" criterion: read **all eight** test files from the File Structure Create list as a pinned literal array — this array takes the full eight, unlike the liveness array above, since the contract test is as capable of holding a bad assertion as any other — assert every one exists (a missing path fails rather than being skipped), and assert none of them contains an assertion binding a `NOT_SCORED` or `INSUFFICIENT_EVIDENCE` fixture to a `0` delta. It lives in Task 8 rather than beside BEH-9 in Task 5 because three of the eight files do not exist until Tasks 6 to 8; an every-file-exists assertion run at Task 5 could only pass by shrinking the array to five and exempting three suites. A repo-wide sweep for the token `0` is the alternative and cannot be discharged.
- **Docs.** Assert `docs/cli-reference.md` contains a signature line for each of `eval baseline record`, `eval baseline show`, and `eval compare`. `tests/docs/reference-section.test.mjs` derives its expectations from `VERB_REGISTRY` **top-level** verbs only and cannot see a subverb, so this assertion is the only thing standing between the three verbs and undocumented shipping.

- [ ] **Verify test fails**

Run: `node --test tests/cli/eval-compare.test.mjs`
Expected: FAIL — `unknown subverb: compare`, exit 1 for every row including the verdict rows.

- [ ] **Implement**

Add `case "compare":`. `cmdCompare` contains all four paths, reads the rubric, the candidate score, the run record and the optional trace drift, calls `buildScoredRun`, `loadBaseline` and `compareScores`, renders, and maps the outcome to an exit code through a single frozen lookup declared beside `COMPARISON_OUTCOMES`'s five members — not an inline `if` chain, so a future sixth outcome is a missing-key failure rather than a silent `0`. Every `catch` exits `1`. Update `USAGE`, `help()`, and `docs/cli-reference.md` with the signature and the exit-code table.

- [ ] **Verify test passes**

Run: `npm test`

- [ ] **Falsify each guard**

| Perturbation | Assertion that must go red |
|---|---|
| map `regression` to `1` | the set-level no-verdict-is-a-fault assertion **and** the `regression` row |
| map a fault to `2` | the set-level fault-rows-are-all-1 assertion |
| map `TRACE_FIXTURE_STALE` to `0` | its row |
| omit `findings` from the default rendering | the default-rendering findings assertion, while `--json` stays green |
| skip the candidate-side half validation in the CLI | the zero-`max` candidate row |
| delete one subverb line from `docs/cli-reference.md` | the docs assertion |
| delete the sole `assert.strictEqual(err.code, "BASELINE_INCOMPLETE")` from Task 4's suite, leaving the code mentioned only in that test's title | the registry-liveness assertion — the non-vacuity proof, and the one that shows the scan reads assertion positions rather than raw text. A textual sweep stays green here because the title still spells the code |
| re-add `baseline-schema-contract.test.mjs` to the liveness array | the pinned-exclusion assertion — this is why the exclusion is a checked constant rather than a convention |
| point the eight-entry no-zero array at a nonexistent path | its every-file-exists assertion — the non-vacuity proof for the no-zero predicate |

Revert each.

**Not a usable perturbation, and recorded so no one tries it:** "add an unemitted code to `BASELINE_ERROR_CODES`" cannot redden the liveness scan, because Task 1 guard 1's both-ways set comparison forces any new member into `baseline-schema-contract.test.mjs` in the same edit — and that file is excluded from the scan, so nothing changes on either side. The perturbation that actually exercises liveness is the first row above: remove the *emission*, not the declaration.

- [ ] **Commit**

`feat(eval-harness): add adev eval compare with the gating exit-code matrix`
Trailers: `Spec: .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`, `Plan-task: 8`

---

## Visual Expectations

**CLI output, not a UI surface.** The spec's Visual Expectations section reads "Not applicable — no UI surface"; the rendering it specifies is `adev eval compare`'s stdout — a verdict table, the two deltas, and the `findings` list, with `--json` emitting the ScoreComparison verbatim. No task in this plan creates or modifies an HTML, CSS, JSX, TSX, Vue, or Svelte file, and no browser is involved.

Consequently **`/adev:validate` Check 11 (visual verification) does not apply and must not be expected to run.** That check requires Playwright MCP and **BLOCKS** when UI files are touched without it; here no UI file is touched, so it should report as not-applicable. If a later reader sees "Visual Expectations" in the spec and concludes a screenshot is owed, that conclusion is wrong — the verifiable artifact is Task 8's stdout assertion, which is a hosted test rather than a manual look.

## Spec Coverage Map

Every acceptance criterion in spec revision 3, in spec order, with the task that discharges it. Criteria the plan does **not** discharge with a test are marked and say why. This table exists so a reviewer can check coverage by reading rather than by re-deriving it, and so a later spec revision shows up here as an unmapped row.

| # | Criterion (abbreviated) | Task |
|---|---|---|
| 1 | `recordBaseline` writes all seven fields; round trip returns them unchanged | 4 |
| 2 | `BASELINE_EXISTS` without `promote`, writes nothing; `promote: true` overwrites | 4 |
| 3 | A path outside the project root raises `UNSAFE_BASELINE_PATH` | 2 |
| 4 | Traversal `rubric_id` refused before any `join`; symlinked **file** and symlinked **directory** both refused | 2 |
| 5 | `BASELINE_NO_PROJECT_ROOT` on both functions; no test relies on `process.cwd()` | 2 (both codes), 4 (both functions); the `process.cwd()` half is a bounded source predicate in Task 2 |
| 6 | An interrupted `--promote` leaves the prior baseline intact | 4 |
| 7 | Every stored baseline names `model_id` and `plugin_version` | 4 |
| 8 | Each of the six decision rows covered by a row-exclusive test, including row 3 | 6 |
| 9 | `scoreRubric`'s return shape unchanged (carries no `rubric_id`) | 3 |
| 10 | `buildScoredRun` is the only path by which `recordBaseline` receives a ScoredRun | 3 (allow-list + `SCORED_RUN_INVALID`), 4 (the hand-built-ScoredRun-with-a-bad-`run_record` tests: an unknown key and a missing `pricing_table` each throw `SCORED_RUN_INVALID` at `recordBaseline`). `assertScoreHalves` alone is **not** what discharges this — it validates score halves only, and a hand-built object with well-formed halves and a malformed `run_record` passes it; the `assertRunRecord` re-run on the record path is the actual closure |
| 11 | `SCORED_RUN_INVALID` exercised by a missing-field input | 3 |
| 12 | `BASELINE_VERSION_MISMATCH` on a differing `rubric_version`, via a real round trip | 5 |
| 13 | `adev eval baseline show` prints `recorded_at` | 7 |
| 14 | A differing `plugin_version` alone does **not** produce `incomparable` | 6 |
| 15 | Deterministic regression plus judged improvement returns `regression` | 6 |
| 16 | Deterministic identity plus judged improvement returns `judge-attributable` | 6 |
| 17 | A `NOT_SCORED` deterministic half on either side returns `incomparable` | 6 |
| 18 | No `quality_dimensions` returns `no-regression`, not `judge-attributable` (the `null != 0` case) | 6 |
| 19 | An `INSUFFICIENT_EVIDENCE` judged half yields `null` and does not produce `incomparable` | 6 (outcome), 5 (`judged_delta: null`) |
| 20 | A **baseline** with a zero/negative `max` or numeric-string `points` raises `BASELINE_SCORE_HALF_MALFORMED` | 4 (load path), 3 (the validator itself) |
| 21 | A **candidate** with the same corruption raises it too, proven separately | 3 (library), 8 (CLI end-to-end) |
| 22 | A well-formed `NOT_SCORED` half is **accepted** | 3 |
| 23 | Every result carries both deltas as separate fields and both verdict tables | 6 |
| 24 | Deltas are percentages of the baseline side's attainable maximum; a rubric that gains elements produces `0` | 5 |
| 25 | A status half reports `null`; no test asserts `0` for an unscored half | 5 (the behavioural half — `computeHalfDelta` returns `null`), 8 (the source predicate — a **bounded** sweep over the eight pinned test-file paths of the File Structure Create list, hosted in Task 8 because three of the eight do not exist until Tasks 6 to 8) |
| 26 | No result carries a spread, variance, or `indistinguishable` field | 6 (per-result key set), 1 (the enum has no `indistinguishable` member) |
| 27 | A finding not selected as the outcome still appears in `findings` | 6 |
| 28 | `compareScores` called twice returns deep-equal results | 6 (whole function), 5 (`computeDeltas`) |
| 29 | No `Date.now`, `new Date`, `Math.random` under `lib/evals/baseline*.mjs`, asserted at source | 1, with the pinned-glob non-vacuity check raised in 3 |
| 30 | `npm test` passes | Quality Gates |
| 31 | The charter (revision 6) carries the enum, the attributes, and the signatures; the spec stamps `charter-revision: 6` | 1 discharges the **enum-parity** half with an executable check against `charter.md`'s `ScoreComparison` row. The remaining halves — the `findings` / `baseline_verdicts` / `candidate_verdicts` attributes, `rubric_version` on the Baseline entity, the ScoredRun entity, the four signatures, the three verbs in Interface Contracts, and the spec's own `charter-revision: 6` stamp — are **already true on disk today** (verified while planning) and are governance state rather than behaviour; they are re-verified as a Quality Gates checklist item, not as a hosted assertion |
| 32 | All three subverbs appear in `docs/cli-reference.md`'s `eval` section, asserted by a test | 8 |
| 33 | `adev eval compare` exits 0 / 2 / 3 per outcome and 1 for a fault, end to end | 8 |
| 34 | No constitutional violations introduced | Quality Gates |

**Thirty-two of the thirty-four criteria are discharged by a hosted test in a named task.** The two that are not are #30 and #34, which are the gate suite itself. #31 is split: its enum half is hosted in Task 1, and its remaining halves are a checklist re-verification of governance state that is already correct — recorded here rather than silently assumed.

Nine rows are split across tasks and say so above: #5, #10, #19, #20, #21, #25, #26, #28 and #31. Each split names which task owns which half, because in every one of those cases a single task's assertion would leave the other half unproven — and #21 in particular is a criterion the spec itself flags as passing every other check when only one door is guarded.

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (`node scripts/run-tests.mjs`) — the project's single gate, and the `id: test, tier: fast` entry in `.context-index/governance/gates.yaml`
- All **eight** new suites appear in the default bucket — the count and the paths come from the File Structure Create list, which is this plan's single source for both: `node scripts/run-tests.mjs --list` lists the six `tests/lib/evals/baseline-*.test.mjs` files (`baseline-schema-contract`, `baseline-path-containment`, `baseline-scored-run`, `baseline-record-load`, `baseline-deltas`, `baseline-decision-table`) and the two `tests/cli/` files (`eval-baseline.test.mjs`, `eval-compare.test.mjs`)
- Every guard has been proven able to fail: each task's falsification table is executed and the confirmations recorded in that task's commit body
- Zero new external dependencies (constitution Principle 1); Node built-ins only
- Pure ESM, `.mjs`, for both new library modules and all eight new test files (constitution Principle 3)
- **The review sidecar is refreshed to the current spec revision before validation runs.** `.context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.review.md` carries frontmatter reading `verdict: BLOCK` and `last-reviewed-revision: 1`, while the spec is at revision 3 and the lifecycle JSONL records five `PASS_WITH_NOTES` events. `/adev:validate` and `/adev:hygiene` read that frontmatter, not the JSONL, so as it stands they will report a stale and blocking review against work that was in fact passed. Update the sidecar's frontmatter to `verdict: PASS_WITH_NOTES` and `last-reviewed-revision: 3`, and rewrite its body for round 3, before validation is run — otherwise the gate result is an artefact of unrefreshed governance state rather than of the implementation
- No version bump in `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` (ADR-0008 — release-please owns those); `plugin.json` version parity therefore holds unchanged
- No inline Node added to any SKILL.md: `.githooks/pre-commit` → `hooks/pre-commit-no-inline-node.sh` (exit 2 = policy violation). No task touches a SKILL.md, so this gate is expected to be a no-op — recorded so a surprise is visible
- Source manifest complete and stamped: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/baseline-provenance-and-percent-regression.spec.md`
- Governance boundaries: `adev boundaries check` — no CommonJS, no `~/.claude/` literal, no inline-Node pattern in any file this plan creates
- Charter-revision checklist (criterion #31's unhosted halves): confirm `charter.md` still carries the ScoredRun entity, the `findings` / `baseline_verdicts` / `candidate_verdicts` attributes, `rubric_version` on Baseline, and the four function signatures, and that the spec still stamps `charter-revision: 6`, so `/adev:hygiene` raises no `CHARTER_STALE`
- Visual verification (`/adev:validate` Check 11): **not applicable** — see the Visual Expectations section above. No UI file is touched and Playwright MCP is not required
- All acceptance criteria from spec revision 3 satisfied

`.context-index/governance/gates.yaml` exists; where its definitions differ from the constitution's Quality Gates block, `gates.yaml` wins. Probabilistic gates with no command are noted as skipped by `/adev:validate` rather than run here.

**Not gated here, deliberately:** `collectRunRecord` does not exist (the spec's first Open Question). Every task in this plan builds and tests against **synthetic** RunRecords conforming to the charter's pinned twelve-field entity, which is what makes the library half shippable now. `adev eval baseline record` therefore cannot be pointed at a real session until the Run-cost record capability lands; no gate here asserts that it can, and the CLI's `--run-record <path>` flag is exactly the seam that keeps the two capabilities independently deliverable.

**Recording this as a Quality-Gates note rather than as a task was adjudicated, and is correct.** No acceptance criterion in spec revision 3 requires a real session: every criterion that touches a RunRecord is satisfied by the charter's pinned twelve-field entity, which synthetic fixtures conform to exactly. `--run-record <path>` is a genuine seam rather than a placeholder — it is the same flag a real collector would write into — and deferring `collectRunRecord` leaves nothing in this plan undischargeable. A later reader should not relitigate this into a ninth task.
