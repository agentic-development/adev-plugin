<!-- partial_schema: plan@1 -->

# Implementation Plan: Rubric scoring engine and adev eval score verb

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/scoring-engine.spec.md
> **Review:** PASS (2026-08-20) — revision 5, rounds 1-4 blocked; round 5 clean with one cosmetic suggestion (SA-4)
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test` — no framework, zero external dependencies

**Goal:** Build `lib/evals/score.mjs` — `scoreRubric(rubric, verdicts)` and `buildJudgeContext(criterion)` — and expose it as `adev eval score`, so the Layer 3 arithmetic that currently lives as prose in `skills/eval/SKILL.md` exists in exactly one executable place, and so a half that could not be scored says so by name instead of reporting a `0` that reads as a result.

**Architecture:** The result contract is data; the engine is its executable expression — the same split the already-shipped sibling uses (`lib/evals/rubric-schema.mjs` beside `lib/evals/rubric.mjs`). `lib/evals/score-schema.mjs` holds the two half statuses and the error-code vocabulary as frozen constants, so the CLI renderer can name a status without importing the engine. `lib/evals/score.mjs` composes ordered passes over an already-loaded Rubric: rubric-origin and threshold validation → verdict-set validation → per-half tally with denominator exclusion → status assignment → result assembly. Validation completes before any arithmetic runs, which is how "a rejected verdict set produces no partial score" becomes structural rather than a discipline. The engine reads no file, parses nothing, spawns nothing, and reads no clock: `loadRubric` is its sole upstream and the caller supplies the verdicts. `lib/cli/eval.mjs` wraps it behind `adev eval score`, reusing `lib/path-safety.mjs` for containment on `--rubric`/`--input` exactly as the shipped loader does for `UNSAFE_RUBRIC_PATH`, and errors are built with `lib/errors.mjs::codedError` so both consumers branch on `.code`.

**Critical implementation constraint carried from review round 5 — do not let an implementer "simplify" this away:**

> **BEH-10 does NOT make BEH-3's first clause redundant.** BEH-10 validates that `insufficient_evidence_threshold_percent` is numeric and within `[0, 100]` — and `100` is explicitly *in range*. At `threshold: 100`, BEH-3's second clause ("`unknown` share **exceeds** the threshold") can never fire, because a share of 100 does not exceed 100. BEH-3's **first** clause ("every declared criterion resolved `unknown` → `INSUFFICIENT_EVIDENCE`, regardless of threshold") is therefore the *sole* path that catches an all-`unknown` judged half at that threshold. An implementer reasoning "the threshold is validated now, so the threshold-independent clause is belt-and-braces" would delete it and reopen the exact zero-denominator defect that blocked review round 3. Task 5 carries this as a comment at the implementation site and its suite includes a `threshold: 100` case.

**The verified partition the implementation must preserve** (re-derived twice during review; `N_j` = declared criteria, `U` = `unknown` count, `N_d` = declared elements, `NA` = `not_applicable` count, `t` = threshold):

| Half | Precondition | Outcome |
|---|---|---|
| Judged | `N_j == 0` | `NOT_SCORED` (BEH-4) |
| Judged | `N_j >= 1` and `U == N_j` | `INSUFFICIENT_EVIDENCE` (BEH-3 clause 1) |
| Judged | `N_j >= 1`, `U < N_j`, `unknown share > t` | `INSUFFICIENT_EVIDENCE` (BEH-3 clause 2) |
| Judged | otherwise | numeric; denominator `N_j - U >= 1` |
| Deterministic | `N_d == 0` or `NA == N_d` | `NOT_SCORED` (BEH-4) |
| Deterministic | otherwise | numeric; denominator `N_d - NA >= 1` |

The preconditions are disjoint and exhaustive over the zero-denominator case: no half satisfies two rows, and no half reaches a numeric row with nothing to divide by. Task 7 asserts that property directly rather than trusting the ordering of `if` branches.

**Review-note disposition:**

- **SA-4** (BEH-10 is engine-level but sits after CLI-level BEH-9 — a topic break in the Behaviors list) — **declined, no plan action.** The Behaviors list is deliberately unordered per the spec convention, and behaviour ids are never renumbered once assigned, so the ordering carries no meaning that reordering would improve. Renumbering to satisfy a reading-order preference would break every reference to BEH-9 and BEH-10 in this plan, in the review, and in the test suite names below, for no correctness gain.

---

## File Structure

**Create:**

- `lib/evals/score-schema.mjs` — frozen result-contract constants: `HALF_STATUSES` (`INSUFFICIENT_EVIDENCE`, `NOT_SCORED`), `SCORE_ERROR_CODES`, `VERDICT_KINDS`
- `lib/evals/score.mjs` — `scoreRubric(rubric, verdicts)`, `buildJudgeContext(criterion)`, and the named passes they compose
- `lib/cli/eval.mjs` — the `adev eval score` verb (`run({ projectRoot, argv })` / `help()`), table and `--json` rendering, path containment
- `tests/lib/evals/score-schema-contract.test.mjs` — the constants are the single source of truth
- `tests/lib/evals/score-rubric-and-threshold.test.mjs` — BEH-10 + `SCORE_INVALID_RUBRIC`
- `tests/lib/evals/score-verdict-validation.test.mjs` — BEH-5, BEH-6, `SCORE_INVALID_VERDICT`, `SCORE_DUPLICATE_VERDICT`
- `tests/lib/evals/score-tally.test.mjs` — BEH-2
- `tests/lib/evals/score-insufficient-evidence.test.mjs` — BEH-3 (both clauses, including `threshold: 100`)
- `tests/lib/evals/score-not-scored.test.mjs` — BEH-4
- `tests/lib/evals/score-status-partition.test.mjs` — the BEH-3 × BEH-4 disjointness and exhaustiveness invariant
- `tests/lib/evals/score-result-assembly.test.mjs` — BEH-1 + the determinism and no-partial-score postconditions
- `tests/lib/evals/score-judge-context.test.mjs` — BEH-7
- `tests/cli/eval-score.test.mjs` — BEH-8, BEH-9
- `tests/skills/eval-layer3-scoring-verb.test.mjs` — `skills/eval/SKILL.md` Layer 3 names the verb and reports half-level statuses
- `tests/fixtures/evals/rubrics/threshold-100.yaml` — conforming but with `insufficient_evidence_threshold_percent: 100`
- `tests/fixtures/evals/rubrics/threshold-50.yaml` — conforming but with `insufficient_evidence_threshold_percent: 50`, for the at-the-boundary case
- `tests/fixtures/evals/rubrics/threshold-non-numeric.yaml` — threshold declared as a word
- `tests/fixtures/evals/rubrics/threshold-out-of-range.yaml` — threshold `140`
- `tests/fixtures/evals/rubrics/no-quality-dimensions.yaml` — `quality_dimensions: []`, elements declared
- `tests/fixtures/evals/rubrics/no-required-elements.yaml` — `required_elements: []`, criteria declared
- `tests/fixtures/evals/verdicts/complete.json` — a full, valid verdict set for `conforming.yaml`
- `tests/fixtures/evals/verdicts/elements-only.json` — the two element verdicts, for the `no-quality-dimensions` rubric
- `tests/fixtures/evals/verdicts/unsafe-input.json` — a verdict set the engine rejects, for the CLI error-propagation case

**Modify:**

- `cli/index.mjs:1985` — register `["eval", () => import("../lib/cli/eval.mjs")]` in `VERB_REGISTRY`
- `docs/cli-reference.md` — document `adev eval score --rubric <path> --input <path> [--json]` under the agent-facing verb section
- `skills/eval/SKILL.md:154-161` — replace the in-prose aggregate formula and the whole-layer discard in "Step 3 — Aggregate for trend tracking" with a call to `adev eval score` and half-level status reporting
- `skills/eval/SKILL.md:215` and `:181` — the report template and the attainable-maximum prose, which both currently assume Layer 3 is discarded wholesale on `INSUFFICIENT_EVIDENCE`

**Reference (read, do not modify):**

- `lib/evals/rubric.mjs:827` — `loadRubric` is this module's sole upstream and its **only** export; the engine consumes its return value and must not duplicate or contradict any of its ten validation passes
- `lib/evals/rubric-schema.mjs` — `ELEMENT_VERDICTS`, `CRITERION_VERDICTS`, `REQUIRED_TOP_LEVEL_KEYS`, `REQUIRED_CRITERION_FIELDS`; the engine imports these rather than restating either enum
- `tests/fixtures/evals/rubrics/conforming.yaml` — 2 elements, 2 criteria, `threshold: 40`, `layer3_max_points: 25`, `required_element_points: 10`, `judged_criterion_points: 15`; the canonical input every new fixture is derived from
- `lib/path-safety.mjs` — `resolveContained`, `lenientRealpath`, `isContained`
- `lib/errors.mjs:25` — `codedError(code, message)`
- `lib/cli/partial.mjs:48,443` — the `run({ projectRoot, argv })` / `help()` CLI-module shape to follow
- `skills/eval/SKILL.md:98-161` — Layer 3 as it stands today, including the formula block being relocated
- `.context-index/samples/general-library-module-graph.md` — module-boundary and export conventions for `lib/`
- `.context-index/samples/general-test-helpers.md`, `tests/helpers.mjs` — `createTempDir` / `cleanupTempDir` / `writeFixture`
- `.context-index/specs/features/eval-harness/rubric-schema-and-loader.plan.md` — the sibling plan whose decomposition and suite-naming conventions this one follows

## Context Packets

The spec carries no `source-manifest.files[]` (it is new), so packets fall back to the charter Dependencies table, the shipped sibling module that establishes the in-directory conventions, and the orientation file for module placement. Every packet below is additive to a shared base, listed once rather than repeated eleven times.

**Base packet (every task):**
- Spec: `.context-index/specs/features/eval-harness/scoring-engine.spec.md` (Behavioral Contract, the behaviour(s) the task owns, the Error Cases rows it owns)
- Charter: `.context-index/specs/features/eval-harness/charter.md` (capability: *Scoring engine and `adev eval score`*; the Invariants list, which states denominator exclusion, empty-evidence rejection, and `buildJudgeContext` isolation)
- Constitution: `.context-index/constitution.md` (Non-Negotiable Principles 1 and 3; the two SKILL.md anti-patterns)
- Plan: this file's **Critical implementation constraint** and **verified partition** table

### Task 1 Context — Score result contract constants
- `lib/evals/rubric-schema.mjs` (full read — the data-module pattern being mirrored)
- Spec: Error Cases table (all nine codes)

### Task 2 Context — Rubric origin and threshold validation
- `lib/evals/rubric.mjs:827-900` (`loadRubric`'s signature and return: it returns the validated parsed document, **not** a branded object — so origin checking is structural, against `REQUIRED_TOP_LEVEL_KEYS`)
- `lib/evals/rubric-schema.mjs` → `REQUIRED_TOP_LEVEL_KEYS`
- Spec: BEH-10 in full (its second half explains *why* the loader's present-key check is not enough)

### Task 3 Context — Verdict-set validation
- `lib/evals/rubric-schema.mjs` → `ELEMENT_VERDICTS`, `CRITERION_VERDICTS` (the two enums are deliberately different sets)
- Spec: BEH-5, BEH-6; Error Cases rows for `SCORE_INVALID_VERDICT` and `SCORE_DUPLICATE_VERDICT`
- Charter Invariants: "A `RequiredElement` never resolves to `unknown`; a `QualityCriterion` never resolves to `not_applicable`"

### Task 4 Context — Tally with denominator exclusion
- Spec: BEH-2; `tests/fixtures/evals/rubrics/conforming.yaml` (point budgets)
- `skills/eval/SKILL.md:146-158` (the prose formula being relocated — read to confirm the arithmetic transfers unchanged)

### Task 5 Context — Insufficient-evidence guard
- Spec: BEH-3 in full, including the closing paragraph on threshold-independence
- Plan: the **Critical implementation constraint** block above — required reading, not optional
- `.context-index/specs/features/eval-harness/scoring-engine.review.md` (round 3 blocker, which is what the clause exists to prevent)

### Task 6 Context — Not-scored handling
- Spec: BEH-4; the two "Not an error" rows in Error Cases

### Task 7 Context — Disjoint status assignment
- Spec: BEH-3, BEH-4, and the acceptance criterion on mutual exclusivity and exhaustiveness
- Plan: the **verified partition** table above

### Task 8 Context — Result assembly
- Spec: BEH-1, Postconditions in full
- Charter Invariants: "A numeric aggregate is never reported without its verdict table"; charter Quality Attributes → Determinism, Observability

### Task 9 Context — buildJudgeContext
- Spec: BEH-7
- Charter Invariants: the `buildJudgeContext` isolation invariant
- `skills/eval/SKILL.md:128-142` ("Give each judge only:" — the field list the builder must emit, and the running-total prohibition)

### Task 10 Context — `adev eval score` verb
- Spec: BEH-8, BEH-9; Error Cases rows for `UNSAFE_SCORE_PATH` and `SCORE_INPUT_NOT_FOUND`
- `lib/cli/partial.mjs:48-70,443` (verb module shape), `cli/index.mjs:1952-1988` (`VERB_REGISTRY`)
- `lib/evals/rubric.mjs:827-845` (the `UNSAFE_RUBRIC_PATH` containment precedent this verb matches)
- `docs/cli-reference.md` (the section layout the new verb entry joins)

### Task 11 Context — `skills/eval/SKILL.md` Layer 3
- `skills/eval/SKILL.md` in full (Layer 3, the Scoring section at `:179-181`, and the report template at `:215`)
- Spec: the Behavioral Contract's fourth paragraph ("This changes `/adev:eval` Layer 3's observable behaviour"), BEH-8
- Constitution: both SKILL.md anti-patterns (no executable logic; fenced JavaScript is descriptive-reference only)
- `tests/skills/eval-default-rubric.test.mjs` (the existing convention for asserting against this SKILL.md)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

`adev heuristics retrieve --module eval-harness --format text` returned three entries, all from the token-measurement line of work: use session JSONL rather than byte estimates for token measurement; cache reads dominate session cost; summarized skill output preserves artifact quality. None bears on verdict tallying, status assignment, or CLI rendering — they belong to the *Run-cost record* capability. Recorded here for traceability only.

One of the three does have a bearing on **Task 10's output design**: "summarized skill output produces equivalent artifact quality" argues for the default (non-`--json`) rendering staying a compact table rather than an echo of every rubric field, since `/adev:eval` will paste that output into a conversation on every run.

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 — every one of these edits `lib/evals/score.mjs` (Task 1 creates the constants module the rest import), adding one pass to a single composed function. They share a file and must run in order; the order is also the pass order, so each task's tests exercise a pipeline that is correct as far as it has been built.
- **Group B (independent, after Task 1):** Task 9 (`buildJudgeContext`) — it touches `lib/evals/score.mjs` too, but at a separate top-level export with no shared helper, and depends only on the constants module. It can run concurrently with Group A **only** if the implementer is willing to merge two edits to one file; the safer default is to slot it after Task 8.
- **Group C (after Task 8):** Task 10 (`adev eval score`) — new file `lib/cli/eval.mjs` plus two one-line touches elsewhere. Needs the engine complete.
- **Group D (after Task 10):** Task 11 (`skills/eval/SKILL.md`) — the skill cannot name a verb that does not dispatch yet.

Effectively sequential, which is a property of the design rather than a scheduling failure: the engine is one composed function behind one export, exactly as the shipped sibling loader is. Splitting the passes across files to unlock parallelism would trade a real design property (one engine, one file) for a scheduling convenience.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Score result contract constants | small | unit | — | 2 create, 0 modify |
| 2 | Rubric origin and threshold validation | medium | unit | Task 1 | 5 create, 0 modify |
| 3 | Verdict-set validation | medium | unit | Task 2 | 2 create, 1 modify |
| 4 | Tally with denominator exclusion | medium | unit | Task 3 | 1 create, 1 modify |
| 5 | Insufficient-evidence guard | medium | unit | Task 4 | 2 create, 1 modify |
| 6 | Not-scored handling | small | unit | Task 5 | 3 create, 1 modify |
| 7 | Disjoint status assignment | small | unit | Task 6 | 1 create, 1 modify |
| 8 | Result assembly | medium | unit | Task 7 | 1 create, 1 modify |
| 9 | `buildJudgeContext` | small | unit | Task 1 | 1 create, 3 modify |
| 10 | `adev eval score` verb | medium | unit | Task 8 | 4 create, 2 modify |
| 11 | Update `skills/eval/SKILL.md` Layer 3 | medium | unit | Task 10 | 1 create, 1 modify |

All eleven tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `lib/**`, `tests/**`, `cli/**` and `skills/**` paths). Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:` and no task carries a non-unit strategy, so the Test Infrastructure Requirements section is omitted as well — the engine reads nothing, spawns nothing, and opens no socket, and the CLI verb reads two local files.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). One suite per spec behaviour; a task implementing a behaviour already covered *extends* that suite rather than creating one. Two suites here are not per-behaviour and say so: `score-schema-contract.test.mjs` (Task 1) asserts a constant rather than a behaviour, and `score-status-partition.test.mjs` (Task 7) asserts a joint invariant spanning BEH-3 and BEH-4 that neither single-behaviour suite can express. Every `**Tests:**` field below therefore reads *create*; `tests/lib/evals/` already exists from the sibling loader, and its nine-suite split is the convention this follows.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`. No routing tags are available to assign.

**Constitution boundary check:** no task creates a service, touches auth, changes the hook protocol, alters the CLI installation path structure, changes the plugin registration format, or adds a dependency. Task 10 adds a verb to `VERB_REGISTRY`, which is additive to the dispatcher rather than a change to the installation path structure. No task requires human approval. `governance/boundaries.yaml` rules are content-matched (CommonJS, inline-Node, `~/.claude/` paths, version fields); Task 11 is the only task touching a `skills/**/SKILL.md` and is written specifically to *remove* an executable-prose block, so it moves that file toward the rule rather than against it.

---

## Tasks

All tasks share one branch: `feat/lib/evals-scoring-engine`. Every commit carries the `Spec:` and `Plan-task:` trailers the constitution requires, alongside the hook-injected `Author-type` and `Operator` trailers.

**Shared result shape** (settled here so eleven tasks do not each invent one). `scoreRubric` returns:

```javascript
// Descriptive reference only — the authoritative definition is the JSDoc on
// scoreRubric in lib/evals/score.mjs.
{
  verdicts: [ { id, kind: "element" | "criterion", verdict, evidence } ],  // the verdict table, rubric-declaration order
  deterministic: { status: null, points: 8, max: 10 },                     // or { status: "NOT_SCORED", points: null, max: null }
  judged:        { status: "INSUFFICIENT_EVIDENCE", points: null, max: null },
  total:         null                                                      // or { points, max } when BOTH halves are numeric
}
```

Each half is discriminated by `status`: `null` means scored (and `points` may legitimately be `0`), a string means not scored and `points` is `null`, never `0`. That is the spec's "`0` means scored and earned nothing" rule expressed structurally — a consumer cannot read a status half as a zero without going through a `null`.

### Task 1: Score result contract constants [specialist: none]

**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/evals/score-schema.mjs`
- Test: `tests/lib/evals/score-schema-contract.test.mjs`

**Tests:** create `tests/lib/evals/score-schema-contract.test.mjs` — this task declares the contract rather than implementing a behaviour, so its suite asserts the constants' shape and their agreement with the spec's Error Cases table.

**Context to load:** Task 1 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { HALF_STATUSES, SCORE_ERROR_CODES, VERDICT_KINDS } from "../../../lib/evals/score-schema.mjs";

test("the half-status set is closed and holds exactly the two spec statuses", () => {
  assert.deepEqual([...HALF_STATUSES].sort(), ["INSUFFICIENT_EVIDENCE", "NOT_SCORED"]);
  assert.ok(Object.isFrozen(HALF_STATUSES));
});

test("every error code named in the spec's Error Cases table is declared", () => {
  for (const code of [
    "SCORE_EMPTY_EVIDENCE", "SCORE_UNKNOWN_VERDICT_ID", "SCORE_MISSING_VERDICT",
    "SCORE_INVALID_VERDICT", "SCORE_DUPLICATE_VERDICT", "SCORE_INVALID_RUBRIC",
    "SCORE_INVALID_THRESHOLD", "UNSAFE_SCORE_PATH", "SCORE_INPUT_NOT_FOUND",
  ]) {
    assert.ok(SCORE_ERROR_CODES.includes(code), `missing code ${code}`);
  }
});

test("the two verdict kinds name the two rubric lists and nothing else", () => {
  assert.deepEqual([...VERDICT_KINDS].sort(), ["criterion", "element"]);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-schema-contract.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/evals/score-schema.mjs'`

- [ ] **Implement**

Create `lib/evals/score-schema.mjs` holding frozen constants only — no functions, no I/O, no imports, mirroring `lib/evals/rubric-schema.mjs`. Its module doc states that it is the single place a reviewer reads to learn the result contract, and that `lib/evals/score.mjs` consumes these constants rather than restating them. It does **not** re-declare `ELEMENT_VERDICTS` or `CRITERION_VERDICTS`: those already live in `rubric-schema.mjs`, and a second copy would be the exact duplication the charter's Naming attribute prohibits.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-schema-contract.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/lib/evals-scoring-engine`

Stage `lib/evals/score-schema.mjs` and `tests/lib/evals/score-schema-contract.test.mjs`, then commit as
`feat(evals): declare the scoring result contract as frozen constants`
with the `Spec:` and `Plan-task: 1` trailers.

### Task 2: Rubric origin and threshold validation [specialist: none]

**Depends on:** Task 1
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/evals/score.mjs`
- Create: `tests/fixtures/evals/rubrics/threshold-100.yaml`
- Create: `tests/fixtures/evals/rubrics/threshold-non-numeric.yaml`
- Create: `tests/fixtures/evals/rubrics/threshold-out-of-range.yaml`
- Test: `tests/lib/evals/score-rubric-and-threshold.test.mjs`

**Tests:** create `tests/lib/evals/score-rubric-and-threshold.test.mjs` — BEH-10's suite, which also owns the `SCORE_INVALID_RUBRIC` Error Cases row, because both are pre-tally origin checks and neither has a home elsewhere.

**Context to load:** Task 2 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const load = (name) => loadRubric(`tests/fixtures/evals/rubrics/${name}.yaml`);

test("a non-numeric threshold is rejected before any tallying, naming the value", () => {
  const err = assert.throws(() => scoreRubric(load("threshold-non-numeric"), []));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
  assert.match(err.message, /forty/);
});

test("a threshold outside [0, 100] is rejected, naming the value", () => {
  const err = assert.throws(() => scoreRubric(load("threshold-out-of-range"), []));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
  assert.match(err.message, /140/);
});

test("the boundary values 0 and 100 are in range and do not throw here", () => {
  // threshold: 100 is explicitly legal — see BEH-3 clause 1, which is the only
  // path that catches an all-unknown judged half at this threshold (Task 5).
  assert.doesNotThrow(() => scoreRubric(load("threshold-100"), []), /SCORE_INVALID_THRESHOLD/);
});

test("threshold validation runs before verdict-set validation", () => {
  // A rubric with a bad threshold AND a verdict set that is also invalid must
  // report the threshold: "before any tallying" is an ordering claim, not a hint.
  const err = assert.throws(() =>
    scoreRubric(load("threshold-non-numeric"), [{ id: "no_such_id", value: "met", evidence: "x" }]));
  assert.equal(err.code, "SCORE_INVALID_THRESHOLD");
});

test("an object that did not come from loadRubric is rejected by origin", () => {
  const err = assert.throws(() => scoreRubric({ rubric_id: "hand-rolled" }, []));
  assert.equal(err.code, "SCORE_INVALID_RUBRIC");
  assert.match(err.message, /loadRubric/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-rubric-and-threshold.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/evals/score.mjs'`

- [ ] **Implement**

Create `lib/evals/score.mjs` with the `scoreRubric` entry point and its first two passes. Note for the implementer: **`loadRubric` returns the validated parsed document itself, with no brand or marker** (`lib/evals/rubric.mjs:895-900` explains why — the validated document *is* the Rubric). So the origin check is necessarily structural: assert the argument is a plain object declaring every key in `REQUIRED_TOP_LEVEL_KEYS` with both entry lists present as arrays. Do not add a brand to the loader's return to make this check easier — that would change a shipped, validated module's contract for the convenience of its consumer.

The threshold pass reads `insufficient_evidence_threshold_percent` and rejects it unless `Number.isFinite(value) && value >= 0 && value <= 100`. The module doc records *why* one field of an already-validated Rubric is re-checked: the loader validates that top-level keys are *present*, not well-typed, and a non-numeric threshold is the one corruption that fails silently — it coerces to `NaN`, every share comparison against it returns `false`, and BEH-3's second clause would never fire while the rubric still looked valid.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-rubric-and-threshold.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs`, the three threshold fixtures, and the suite, then commit as
`feat(evals): validate rubric origin and threshold before any tallying`
with the `Spec:` and `Plan-task: 2` trailers.

### Task 3: Verdict-set validation [specialist: none]

**Depends on:** Task 2
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — add the verdict-set pass after the threshold pass
- Create: `tests/fixtures/evals/verdicts/complete.json`
- Test: `tests/lib/evals/score-verdict-validation.test.mjs`

**Tests:** create `tests/lib/evals/score-verdict-validation.test.mjs` — the shared suite for BEH-5 and BEH-6, which also owns the `SCORE_INVALID_VERDICT` and `SCORE_DUPLICATE_VERDICT` Error Cases rows. The grouping is deliberate: all four are one pass over the same list, and splitting them would create four suites reading one fixture apiece.

**Context to load:** Task 3 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
// conforming.yaml: elements spec_criteria_referenced, tests_accompany_source;
//                  criteria readability_naming, separation_of_concerns.
const complete = () => [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:12 names criterion 1" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every source file" },
  { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4 names the export" },
  { id: "separation_of_concerns", value: "not_met", evidence: "lib/x.mjs:30 mixes two responsibilities" },
];

test("met with empty evidence is rejected, naming the entry", () => {
  const v = complete();
  v[0].evidence = "   ";
  const err = assert.throws(() => scoreRubric(rubric(), v));
  assert.equal(err.code, "SCORE_EMPTY_EVIDENCE");
  assert.match(err.message, /spec_criteria_referenced/);
});

test("unknown with empty evidence is legal — absence is expressible only as unknown", () => {
  const v = complete();
  v[2] = { id: "readability_naming", value: "unknown", evidence: "" };
  assert.doesNotThrow(() => scoreRubric(rubric(), v));
});

test("a verdict id the rubric does not declare is rejected, naming the id", () => {
  const err = assert.throws(() =>
    scoreRubric(rubric(), [...complete(), { id: "ghost", value: "met", evidence: "e" }]));
  assert.equal(err.code, "SCORE_UNKNOWN_VERDICT_ID");
  assert.match(err.message, /ghost/);
});

test("a declared id the verdict set omits is rejected, naming the id", () => {
  const err = assert.throws(() => scoreRubric(rubric(), complete().slice(0, 3)));
  assert.equal(err.code, "SCORE_MISSING_VERDICT");
  assert.match(err.message, /separation_of_concerns/);
});

test("an element resolving unknown is illegal; a criterion resolving not_applicable is illegal", () => {
  const asElement = complete();
  asElement[0].value = "unknown";
  const e1 = assert.throws(() => scoreRubric(rubric(), asElement));
  assert.equal(e1.code, "SCORE_INVALID_VERDICT");
  assert.match(e1.message, /spec_criteria_referenced[\s\S]*unknown/);

  const asCriterion = complete();
  asCriterion[2].value = "not_applicable";
  const e2 = assert.throws(() => scoreRubric(rubric(), asCriterion));
  assert.equal(e2.code, "SCORE_INVALID_VERDICT");
  assert.match(e2.message, /readability_naming[\s\S]*not_applicable/);
});

test("a repeated verdict for one id is rejected, naming the id", () => {
  const err = assert.throws(() => scoreRubric(rubric(), [...complete(), complete()[0]]));
  assert.equal(err.code, "SCORE_DUPLICATE_VERDICT");
  assert.match(err.message, /spec_criteria_referenced/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-verdict-validation.test.mjs`
Expected: FAIL — nothing rejects the malformed sets, so `err.code` is `undefined` on every rejection assertion

- [ ] **Implement**

Add one validation pass to `lib/evals/score.mjs`, run after the threshold pass and before any tally. It builds the declared-id index from the rubric's two lists (recording each id's kind), then walks the supplied verdicts once in a fixed order: duplicate → unknown id → illegal enum value for its kind → empty evidence on `met`/`not_met`; then diffs the declared index against the supplied ids for `SCORE_MISSING_VERDICT`. Enum membership is tested against `ELEMENT_VERDICTS` / `CRITERION_VERDICTS` **imported from `rubric-schema.mjs`** — never a literal list. Evidence emptiness means empty or whitespace-only. The pass returns nothing and either throws or falls through, so no arithmetic can observe a partially validated set.

`tests/fixtures/evals/verdicts/complete.json` carries the same four verdicts in the array-of-objects form the CLI's `--input` will read (Task 10), so the engine suite and the CLI suite assert against one shape.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-verdict-validation.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs`, the verdict fixture, and the suite, then commit as
`feat(evals): reject malformed verdict sets before scoring`
with the `Spec:` and `Plan-task: 3` trailers.

### Task 4: Tally with denominator exclusion [specialist: none]

**Depends on:** Task 3
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — add the per-half tally after validation
- Test: `tests/lib/evals/score-tally.test.mjs`

**Tests:** create `tests/lib/evals/score-tally.test.mjs` — BEH-2's suite.

**Context to load:** Task 4 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
// conforming.yaml budgets: required_element_points 10, judged_criterion_points 15.

test("not_applicable leaves the element denominator, so one met of one answered is full points", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_applicable", evidence: "" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, null);
  assert.equal(result.deterministic.points, 10);   // 1/1 * 10, NOT 1/2 * 10
  assert.equal(result.deterministic.max, 10);
});

test("unknown leaves the criterion denominator, so one met of one answered is full points", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_met", evidence: "lib/y.mjs has no test" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, null);
  assert.equal(result.judged.points, 15);          // 1/1 * 15, NOT 1/2 * 15
  assert.equal(result.judged.max, 15);
});

test("not_met stays in the denominator and earns nothing", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "not_met", evidence: "lib/y.mjs has no test" },
    { id: "readability_naming", value: "not_met", evidence: "lib/x.mjs:4 is opaque" },
    { id: "separation_of_concerns", value: "not_met", evidence: "lib/x.mjs:9 mixes concerns" },
  ]);
  assert.equal(result.deterministic.points, 5);    // 1/2 * 10
  assert.equal(result.judged.points, 0);           // 0/2 * 15 — scored, earned nothing
  assert.equal(result.judged.status, null);        // and NOT a status: 0 is a real score
});

test("a half's max is its own budget, never the layer total", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "a" },
    { id: "tests_accompany_source", value: "met", evidence: "b" },
    { id: "readability_naming", value: "met", evidence: "c" },
    { id: "separation_of_concerns", value: "met", evidence: "d" },
  ]);
  assert.equal(result.deterministic.max, 10);
  assert.equal(result.judged.max, 15);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-tally.test.mjs`
Expected: FAIL — `scoreRubric` returns `undefined`; reading `.deterministic` throws

- [ ] **Implement**

Add a `tallyHalf(entries, verdictsById, { pointsBudget, excluded })` helper and call it twice: once over `required_elements` excluding `not_applicable`, once over `quality_dimensions` excluding `unknown`. Each call returns `{ met, answered, declared, excluded, points, max }` where `points = (met / answered) * pointsBudget` and `max = pointsBudget`. **This helper does not decide statuses** — it is called only on the numeric rows of the partition table, and Tasks 5-7 own the precondition that routes a half here. Keeping the branch out of the tally is what lets Task 7 assert the partition on the routing function alone.

`answered === 0` is not defended against here. It cannot reach this helper once Tasks 5 and 6 land, and adding a guard would create a second, silent status path competing with the explicit one — which is the defect BEH-4 exists to prevent. Until Task 6 lands the suite above never constructs that case.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-tally.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs` and the suite, then commit as
`feat(evals): tally each half with its own denominator exclusion`
with the `Spec:` and `Plan-task: 4` trailers.

### Task 5: Insufficient-evidence guard [specialist: none]

**Depends on:** Task 4
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — add the judged-half precondition
- Create: `tests/fixtures/evals/rubrics/threshold-50.yaml` — conforming, threshold `50`, for the at-the-boundary case
- Reference: `tests/fixtures/evals/rubrics/threshold-100.yaml` *(created in Task 2; reused here)*
- Test: `tests/lib/evals/score-insufficient-evidence.test.mjs`

**Tests:** create `tests/lib/evals/score-insufficient-evidence.test.mjs` — BEH-3's suite. It must include a `threshold: 100` case; see the constraint below.

**Context to load:** Task 5 Context packet — including this plan's **Critical implementation constraint** block, which is required reading for this task.

> **Do not delete BEH-3's first clause.** Task 2 validated that the threshold is numeric and within `[0, 100]`. That does **not** make the threshold-independent clause redundant, and the reasoning that it does is the specific mistake this note exists to block. `100` is an in-range threshold. At `threshold: 100` the second clause (`share > threshold`) can never fire, because 100 does not exceed 100 — so the first clause (`every declared criterion resolved unknown`) is the *only* thing standing between an all-`unknown` judged half and the numeric path with a zero denominator. That defect blocked review round 3. The implementation carries this as a comment at the site, and the suite carries it as a test.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const load = (n) => loadRubric(`tests/fixtures/evals/rubrics/${n}.yaml`);
const elementsMet = [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
];

test("clause 2: an unknown share above the threshold sets the judged half to a status", () => {
  // conforming.yaml threshold is 40; 1 unknown of 2 criteria is 50% > 40%.
  const result = scoreRubric(load("conforming"), [
    ...elementsMet,
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.judged.points, null);
});

test("the deterministic half is unaffected and keeps its points and maximum", () => {
  const result = scoreRubric(load("conforming"), [
    ...elementsMet,
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.deterministic.status, null);
  assert.equal(result.deterministic.points, 10);
  assert.equal(result.deterministic.max, 10);
  assert.equal(result.total, null, "no blended total when one half carries a status");
});

test("clause 1 at threshold 100: an all-unknown judged half is INSUFFICIENT_EVIDENCE anyway", () => {
  // REGRESSION GUARD — review round 3. threshold: 100 is in range (Task 2), and
  // an unknown share of 100 does NOT exceed 100, so clause 2 cannot fire. Only
  // the threshold-independent clause 1 keeps this half off the numeric path.
  // If this test fails with NaN or a division-by-zero value, clause 1 was deleted.
  const result = scoreRubric(load("threshold-100"), [
    ...elementsMet,
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, "INSUFFICIENT_EVIDENCE");
  assert.equal(result.judged.points, null);
  assert.notEqual(result.judged.points, 0, "a status half is never reported as 0");
});

test("a share exactly at the threshold does not trip clause 2", () => {
  // 1 unknown of 2 is 50%; a rubric with threshold 50 must still score numerically,
  // because the spec says "exceeds", not "reaches".
  const result = scoreRubric(load("threshold-50"), [
    ...elementsMet,
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(result.judged.status, null);
  assert.equal(result.judged.points, 15);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-insufficient-evidence.test.mjs`
Expected: FAIL — the judged half is a number (or `NaN` in the all-`unknown` cases); `status` is `null`

- [ ] **Implement**

Add the judged-half precondition to `lib/evals/score.mjs`, expressed as the two clauses of BEH-3 joined by `||`, with the clause-1 comment reproduced at the site verbatim enough that a later reader meets the argument before deleting it:

```javascript
// Descriptive reference for the plan reader; the shipped code carries this
// comment and this shape.
const share = declared === 0 ? 0 : (unknownCount / declared) * 100;
// Clause 1 is NOT redundant with the threshold validation in assertThresholdValid().
// `threshold: 100` is in range, and a share of 100 does not EXCEED 100 — so at that
// threshold clause 2 never fires and clause 1 is the ONLY thing keeping an
// all-unknown half off the numeric path, where it would divide by zero.
// Review round 3 blocked on exactly this. Do not simplify it away.
const insufficient = (declared >= 1 && unknownCount === declared) || share > threshold;
```

Also add `tests/fixtures/evals/rubrics/threshold-50.yaml` (conforming, `insufficient_evidence_threshold_percent: 50`) for the boundary case.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-insufficient-evidence.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs`, `tests/fixtures/evals/rubrics/threshold-50.yaml`, and the suite, then commit as
`feat(evals): guard the judged half with the two-clause insufficient-evidence rule`
with the `Spec:` and `Plan-task: 5` trailers.

### Task 6: Not-scored handling [specialist: none]

**Depends on:** Task 5
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — add the nothing-to-answer precondition for both halves
- Create: `tests/fixtures/evals/rubrics/no-quality-dimensions.yaml`
- Create: `tests/fixtures/evals/rubrics/no-required-elements.yaml`
- Test: `tests/lib/evals/score-not-scored.test.mjs`

**Tests:** create `tests/lib/evals/score-not-scored.test.mjs` — BEH-4's suite.

**Context to load:** Task 6 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const load = (n) => loadRubric(`tests/fixtures/evals/rubrics/${n}.yaml`);

test("a half the rubric declares no entries for is NOT_SCORED", () => {
  const result = scoreRubric(load("no-quality-dimensions"), [
    { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
    { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
  ]);
  assert.equal(result.judged.status, "NOT_SCORED");
  assert.equal(result.judged.points, null);
  assert.equal(result.judged.max, null);
  assert.equal(result.deterministic.points, 10);
  assert.equal(result.total, null);
});

test("the mirror case: no required_elements makes the deterministic half NOT_SCORED", () => {
  const result = scoreRubric(load("no-required-elements"), [
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, "NOT_SCORED");
  assert.equal(result.judged.points, 15);
});

test("a deterministic half where every entry is not_applicable is NOT_SCORED", () => {
  const result = scoreRubric(load("conforming"), [
    { id: "spec_criteria_referenced", value: "not_applicable", evidence: "" },
    { id: "tests_accompany_source", value: "not_applicable", evidence: "" },
    { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
    { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
  ]);
  assert.equal(result.deterministic.status, "NOT_SCORED");
  assert.equal(result.deterministic.points, null);
  assert.equal(result.judged.points, 15);
});

test("no NaN and no division-by-zero value reaches the caller in any not-scored case", () => {
  for (const fixture of ["no-quality-dimensions", "no-required-elements"]) {
    const rubric = load(fixture);
    const verdicts = [...(rubric.required_elements ?? []), ...(rubric.quality_dimensions ?? [])]
      .map((e) => ({ id: e.id, value: "met", evidence: "e" }));
    const result = scoreRubric(rubric, verdicts);
    for (const half of [result.deterministic, result.judged]) {
      assert.ok(half.points === null || Number.isFinite(half.points), `${fixture}: ${half.points}`);
    }
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-not-scored.test.mjs`
Expected: FAIL — the empty half yields `NaN` points and `status: null`

- [ ] **Implement**

Add the nothing-to-answer precondition ahead of the numeric path for both halves: `declared === 0 || answered === 0` → `NOT_SCORED`. For the deterministic half `answered === 0` with `declared >= 1` means every entry resolved `not_applicable`; for the judged half that same shape is already claimed by BEH-3 clause 1, so the judged precondition is evaluated in the partition-table order (Task 7 asserts that the two never both claim a half). Write the fixtures by copying `conforming.yaml` and emptying one list (`quality_dimensions: []` / `required_elements: []`); the shipped loader accepts an empty list, since its required-key pass checks presence and its completeness pass iterates zero entries.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-not-scored.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs`, both fixtures, and the suite, then commit as
`feat(evals): report a half with nothing to answer as NOT_SCORED`
with the `Spec:` and `Plan-task: 6` trailers.

### Task 7: Disjoint status assignment [specialist: none]

**Depends on:** Task 6
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — extract the two preconditions into one named resolver
- Test: `tests/lib/evals/score-status-partition.test.mjs`

**Tests:** create `tests/lib/evals/score-status-partition.test.mjs` — this suite asserts a joint invariant spanning BEH-3 and BEH-4 that neither single-behaviour suite can express, so it is one of the two deliberate departures from per-behaviour granularity noted in the Task Summary.

**Context to load:** Task 7 Context packet — including this plan's **verified partition** table.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveHalfStatus } from "../../../lib/evals/score.mjs";

// The partition, stated as data, exactly as the plan's table states it.
const judged = (declared, unknownCount, threshold) =>
  resolveHalfStatus({ kind: "criterion", declared, excluded: unknownCount, threshold });
const deterministic = (declared, naCount) =>
  resolveHalfStatus({ kind: "element", declared, excluded: naCount, threshold: 40 });

test("the judged rows of the partition resolve as the table says", () => {
  assert.equal(judged(0, 0, 40), "NOT_SCORED");
  assert.equal(judged(2, 2, 40), "INSUFFICIENT_EVIDENCE");
  assert.equal(judged(2, 2, 100), "INSUFFICIENT_EVIDENCE"); // clause 1, threshold-independent
  assert.equal(judged(4, 3, 40), "INSUFFICIENT_EVIDENCE");  // 75% > 40%
  assert.equal(judged(4, 1, 40), null);                     // 25% <= 40% → numeric
});

test("the deterministic rows of the partition resolve as the table says", () => {
  assert.equal(deterministic(0, 0), "NOT_SCORED");
  assert.equal(deterministic(2, 2), "NOT_SCORED");
  assert.equal(deterministic(2, 1), null);
});

test("exhaustive sweep: every half either carries a status or has a denominator >= 1", () => {
  for (const kind of ["element", "criterion"]) {
    for (let declared = 0; declared <= 6; declared++) {
      for (let excluded = 0; excluded <= declared; excluded++) {
        for (const threshold of [0, 40, 50, 99, 100]) {
          const status = resolveHalfStatus({ kind, declared, excluded, threshold });
          if (status === null) {
            assert.ok(declared - excluded >= 1,
              `numeric with zero denominator at ${kind}/${declared}/${excluded}/${threshold}`);
          } else {
            assert.ok(["INSUFFICIENT_EVIDENCE", "NOT_SCORED"].includes(status));
          }
        }
      }
    }
  }
});

test("mutual exclusivity: the resolver returns one status, never a set", () => {
  // INSUFFICIENT_EVIDENCE requires declared >= 1; NOT_SCORED requires nothing
  // answerable. No input satisfies both, so a single return value is sound.
  assert.equal(judged(0, 0, 100), "NOT_SCORED", "an empty judged half is never INSUFFICIENT_EVIDENCE");
  assert.equal(deterministic(0, 0), "NOT_SCORED");
  assert.notEqual(judged(3, 3, 40), "NOT_SCORED", "declared-but-unanswered is not the same as nothing to answer");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-status-partition.test.mjs`
Expected: FAIL — `resolveHalfStatus is not a function` (the branches currently live inline)

- [ ] **Implement**

Extract the preconditions written inline in Tasks 5 and 6 into one exported `resolveHalfStatus({ kind, declared, excluded, threshold })` returning `"INSUFFICIENT_EVIDENCE" | "NOT_SCORED" | null`, and call it from both halves. The point of the extraction is testability of the partition itself: with the branches inline, the sweep above could only be run through full `scoreRubric` calls and would need a fixture per cell. The function's doc reproduces the partition table so the code and the spec state the same thing in the same shape, and repeats the clause-1 warning from Task 5 — this is now the only site where that clause lives.

Order the checks to match the table: nothing-declared → all-excluded (judged: clause 1; deterministic: `NOT_SCORED`) → share above threshold → `null`. Do not "simplify" the judged all-excluded case into the deterministic one: they return different statuses for the same shape, which is the whole content of BEH-3 versus BEH-4.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-status-partition.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs` and the suite, then commit as
`refactor(evals): resolve half status through one disjoint partition function`
with the `Spec:` and `Plan-task: 7` trailers.

### Task 8: Result assembly [specialist: none]

**Depends on:** Task 7
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — assemble and return the result object
- Test: `tests/lib/evals/score-result-assembly.test.mjs`

**Tests:** create `tests/lib/evals/score-result-assembly.test.mjs` — BEH-1's suite, which also owns the Postconditions (determinism, no partial score, no filesystem or network access).

**Context to load:** Task 8 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { scoreRubric } from "../../../lib/evals/score.mjs";

const rubric = () => loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
const allMet = () => [
  { id: "spec_criteria_referenced", value: "met", evidence: "tests/x.test.mjs:3" },
  { id: "tests_accompany_source", value: "met", evidence: "the diff pairs every file" },
  { id: "readability_naming", value: "met", evidence: "lib/x.mjs:4" },
  { id: "separation_of_concerns", value: "met", evidence: "lib/x.mjs:9" },
];

test("a complete verdict set returns the table and both halves as distinct fields", () => {
  const result = scoreRubric(rubric(), allMet());
  assert.equal(result.verdicts.length, 4);
  assert.deepEqual(result.verdicts.map((v) => v.kind), ["element", "element", "criterion", "criterion"]);
  assert.deepEqual(result.deterministic, { status: null, points: 10, max: 10 });
  assert.deepEqual(result.judged, { status: null, points: 15, max: 15 });
});

test("the blended total appears only when both halves are numeric, rounded and capped", () => {
  const both = scoreRubric(rubric(), allMet());
  assert.deepEqual(both.total, { points: 25, max: 25 });   // 10 + 15, capped at layer3_max_points

  const oneStatus = scoreRubric(rubric(), [
    ...allMet().slice(0, 2),
    { id: "readability_naming", value: "unknown", evidence: "" },
    { id: "separation_of_concerns", value: "unknown", evidence: "" },
  ]);
  assert.equal(oneStatus.total, null);
});

test("the total is rounded, and a status half never contributes a 0", () => {
  const result = scoreRubric(rubric(), [
    { id: "spec_criteria_referenced", value: "met", evidence: "a" },
    { id: "tests_accompany_source", value: "not_met", evidence: "b" },
    { id: "readability_naming", value: "met", evidence: "c" },
    { id: "separation_of_concerns", value: "not_met", evidence: "d" },
  ]);
  assert.equal(result.total.points, Math.round(5 + 7.5));
  assert.ok(Number.isInteger(result.total.points));
});

test("the verdict table always accompanies the numbers", () => {
  const result = scoreRubric(rubric(), allMet());
  assert.ok(Array.isArray(result.verdicts) && result.verdicts.length > 0,
    "a numeric aggregate is never returned without its verdict table");
});

test("identical inputs produce a deeply identical result across runs", () => {
  const a = scoreRubric(rubric(), allMet());
  const b = scoreRubric(rubric(), allMet());
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "key order is stable, so output is byte-identical");
});

test("a rejected verdict set produces no partial score", () => {
  assert.throws(() => scoreRubric(rubric(), allMet().slice(0, 2)), (err) => {
    assert.equal(err.code, "SCORE_MISSING_VERDICT");
    assert.equal(err.result, undefined, "no half-built result rides along on the error");
    return true;
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-result-assembly.test.mjs`
Expected: FAIL — the returned object has no `verdicts` table and no `total`

- [ ] **Implement**

Assemble the result last, from values the earlier passes produced: the verdict table in rubric-declaration order (elements then criteria, each carrying `id`, `kind`, `verdict`, `evidence`), then both halves, then `total`. `total` is `{ points: Math.min(Math.round(d.points + j.points), layer3_max_points), max: layer3_max_points }` when both halves have `status === null`, and `null` otherwise — never a number synthesised from one half. Construct object literals with a fixed key order so `JSON.stringify` is stable; read no clock and call no random source anywhere in the module (the charter's Determinism attribute).

Round only at the blend, not per half: rounding each half first and then summing can differ from rounding the sum, and the spec's formula rounds once.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-result-assembly.test.mjs`
Expected: PASS. Then run the whole engine suite — `node --test tests/lib/evals/` — to confirm Tasks 2-7 still pass against the assembled result.

- [ ] **Commit**

Stage `lib/evals/score.mjs` and the suite, then commit as
`feat(evals): assemble the verdict table, both halves, and the blended total`
with the `Spec:` and `Plan-task: 8` trailers.

### Task 9: `buildJudgeContext` [specialist: none]

**Depends on:** Task 1
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/evals/score.mjs` — add the `buildJudgeContext` export
- Modify: `lib/evals/score-schema.mjs` — add `SCORE_INVALID_VERDICT_CONTEXT` to `SCORE_ERROR_CODES`
- Modify: `tests/lib/evals/score-schema-contract.test.mjs` — extend the code list with the new code
- Test: `tests/lib/evals/score-judge-context.test.mjs`

**Tests:** create `tests/lib/evals/score-judge-context.test.mjs` — BEH-7's suite.

**Context to load:** Task 9 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRubric } from "../../../lib/evals/rubric.mjs";
import { buildJudgeContext } from "../../../lib/evals/score.mjs";

const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml");
const [first, second] = rubric.quality_dimensions;

test("the context carries the criterion's own fields", () => {
  const ctx = buildJudgeContext(first);
  for (const field of ["id", "criterion", "reference", "met_when", "not_met_when", "unknown_when"]) {
    assert.equal(ctx[field], first[field], `missing or altered ${field}`);
  }
});

test("no other criterion's id, verdict, or wording appears anywhere in the output", () => {
  const serialized = JSON.stringify(buildJudgeContext(first));
  assert.ok(!serialized.includes(second.id), "leaked a sibling criterion id");
  assert.ok(!serialized.includes(second.criterion), "leaked a sibling criterion's wording");
});

test("no running total and no verdict field is present", () => {
  const ctx = buildJudgeContext(first);
  const keys = Object.keys(ctx);
  for (const forbidden of ["total", "points", "score", "verdict", "verdicts", "deterministic", "judged"]) {
    assert.ok(!keys.includes(forbidden), `context exposes ${forbidden}`);
  }
});

test("the builder takes one criterion and cannot be handed the whole rubric", () => {
  const err = assert.throws(() => buildJudgeContext(rubric));
  assert.equal(err.code, "SCORE_INVALID_VERDICT_CONTEXT");
});

test("mutating the returned context cannot reach back into the rubric", () => {
  const ctx = buildJudgeContext(first);
  ctx.criterion = "tampered";
  assert.notEqual(rubric.quality_dimensions[0].criterion, "tampered");
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/score-judge-context.test.mjs`
Expected: FAIL — `buildJudgeContext is not a function`

- [ ] **Implement**

Add `buildJudgeContext(criterion)` to `lib/evals/score.mjs`. It copies exactly the fields in `REQUIRED_CRITERION_FIELDS` (imported from `rubric-schema.mjs`) into a fresh object and nothing else — an allow-list, never a delete-list, so a field added to the rubric schema later cannot leak by default. It rejects an argument that is not a single criterion (missing any required criterion field) with `SCORE_INVALID_VERDICT_CONTEXT`, added to `SCORE_ERROR_CODES` in `lib/evals/score-schema.mjs` alongside the codes Task 1 declared; the suite in Task 1 is extended with that code in the same commit.

The isolation is a property of the allow-list copy, which is what BEH-7 asks for: the guarantee lives in the builder rather than in prose a judge is trusted to honour.

> **Note on `SCORE_INVALID_VERDICT_CONTEXT`.** This code is not in the spec's Error Cases table, which enumerates nine. It is a defensive addition serving BEH-7's isolation guarantee — handing the whole rubric to a builder that copies an allow-list would otherwise return an object of `undefined`s rather than fail — not a contradiction of the spec. If a later reading treats the Error Cases table as closed over the code vocabulary, add a one-line row for it to the spec rather than dropping the check.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/score-judge-context.test.mjs tests/lib/evals/score-schema-contract.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/score.mjs`, `lib/evals/score-schema.mjs`, and both suites, then commit as
`feat(evals): build single-criterion judge context by allow-list`
with the `Spec:` and `Plan-task: 9` trailers.

### Task 10: `adev eval score` verb [specialist: none]

**Depends on:** Task 8
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/cli/eval.mjs`
- Create: `tests/fixtures/evals/verdicts/unsafe-input.json`
- Create: `tests/fixtures/evals/verdicts/elements-only.json`
- Modify: `cli/index.mjs:1985` — add `["eval", () => import("../lib/cli/eval.mjs")]` to `VERB_REGISTRY`
- Modify: `docs/cli-reference.md` — document the verb, its flags, and its error codes
- Test: `tests/cli/eval-score.test.mjs`

**Tests:** create `tests/cli/eval-score.test.mjs` — the shared suite for BEH-8 and BEH-9, following the `tests/cli/` convention for verb-level suites.

**Context to load:** Task 10 Context packet.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const runVerb = (args, opts = {}) => {
  try {
    const stdout = execFileSync(process.execPath, ["cli/index.mjs", "eval", "score", ...args],
      { encoding: "utf8", ...opts });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
};

const RUBRIC = "tests/fixtures/evals/rubrics/conforming.yaml";
const INPUT = "tests/fixtures/evals/verdicts/complete.json";

test("the default rendering emits the verdict table together with the aggregate", () => {
  const { code, stdout } = runVerb(["--rubric", RUBRIC, "--input", INPUT]);
  assert.equal(code, 0);
  assert.match(stdout, /spec_criteria_referenced/);
  assert.match(stdout, /separation_of_concerns/);
  assert.match(stdout, /deterministic/i);
  assert.match(stdout, /judged/i);
});

test("--json carries the table, both halves, and the total in one object", () => {
  const { code, stdout } = runVerb(["--rubric", RUBRIC, "--input", INPUT, "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.verdicts.length, 4);
  assert.ok("deterministic" in parsed && "judged" in parsed && "total" in parsed);
});

test("a half carrying a status renders by name, never as 0", () => {
  const { stdout } = runVerb(["--rubric", "tests/fixtures/evals/rubrics/no-quality-dimensions.yaml",
    "--input", "tests/fixtures/evals/verdicts/elements-only.json"]);
  assert.match(stdout, /NOT_SCORED/);
  assert.doesNotMatch(stdout, /judged\s*[:|]\s*0\b/i);
});

test("a traversal path on --rubric exits non-zero, names the path, and reads nothing", () => {
  const { code, stderr } = runVerb(["--rubric", "../../../etc/passwd", "--input", INPUT]);
  assert.notEqual(code, 0);
  assert.match(stderr, /UNSAFE_SCORE_PATH/);
  assert.match(stderr, /\.\.\/\.\.\/\.\.\/etc\/passwd/, "the offending path is reported verbatim");
});

test("a traversal path on --input is refused the same way", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "../../../etc/passwd"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /UNSAFE_SCORE_PATH/);
});

test("a contained but missing --input exits non-zero with SCORE_INPUT_NOT_FOUND", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "tests/fixtures/evals/verdicts/absent.json"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /SCORE_INPUT_NOT_FOUND/);
  assert.match(stderr, /absent\.json/);
});

test("an engine rejection surfaces its code and exits non-zero", () => {
  const { code, stderr } = runVerb(["--rubric", RUBRIC, "--input", "tests/fixtures/evals/verdicts/unsafe-input.json"]);
  assert.notEqual(code, 0);
  assert.match(stderr, /SCORE_(EMPTY_EVIDENCE|MISSING_VERDICT|UNKNOWN_VERDICT_ID)/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli/eval-score.test.mjs`
Expected: FAIL — `eval` is not a registered verb; the dispatcher prints the verb registry and exits 1

- [ ] **Implement**

Create `lib/cli/eval.mjs` exporting `run({ projectRoot, argv })` and `help()`, following `lib/cli/partial.mjs`. `run` dispatches on `argv[0]` (`score` today; the module is named `eval` so the *Run-cost record* capability can add `adev eval cost` beside it without a second registry entry). The `score` subcommand:

1. Parses `--rubric`, `--input`, `--json`. Both paths are required; a missing flag prints usage and exits 1.
2. Contains **both** paths with `resolveContained` + `lenientRealpath` + `isContained` against the real-pathed project root, before reading either — `UNSAFE_SCORE_PATH` naming the path exactly as supplied. This is the shipped `UNSAFE_RUBRIC_PATH` sequence in `lib/evals/rubric.mjs:827-845`; follow it rather than reinventing it. `loadRubric` will contain `--rubric` again on its own; the duplicate check is deliberate, so `--input` and `--rubric` are refused by one uniform code before either file is opened.
3. Reads and `JSON.parse`s the verdict input (an array of `{ id, value, evidence }`). A missing or unreadable file is `SCORE_INPUT_NOT_FOUND` naming the resolved path; unparseable JSON exits non-zero with its own message.
4. Calls `loadRubric` then `scoreRubric`, and prints. Default rendering is a compact table plus the aggregate line; a half with a status prints that status name, never `0`. `--json` prints `JSON.stringify(result, null, 2)` — one object, table and halves and total together, since BEH-8 forbids an aggregate without its table in either mode.
5. Errors: print `<CODE>: <message>` to stderr and exit non-zero. Never print a partial table alongside an error.

Add `tests/fixtures/evals/verdicts/elements-only.json` (the two element verdicts, for the `no-quality-dimensions` rubric) and `tests/fixtures/evals/verdicts/unsafe-input.json` (a verdict set the engine rejects, for the error-propagation case). Add the verb to `docs/cli-reference.md` in the same commit — a verb that ships undocumented is drift `/adev:hygiene` will file next run.

- [ ] **Verify test passes**

Run: `node --test tests/cli/eval-score.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/cli/eval.mjs`, `cli/index.mjs`, `docs/cli-reference.md`, the verdict fixtures, and the suite, then commit as
`feat(cli): add adev eval score wrapping the rubric scoring engine`
with the `Spec:` and `Plan-task: 10` trailers.

### Task 11: Update `skills/eval/SKILL.md` Layer 3 [specialist: none]

**Depends on:** Task 10
**Charter capability:** Scoring engine and `adev eval score`
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `skills/eval/SKILL.md:146-161` — Step 3 calls the verb; the whole-layer discard becomes half-level status reporting
- Modify: `skills/eval/SKILL.md:179-181, 215` — the Scoring section and the report template, which both assume the discard
- Test: `tests/skills/eval-layer3-scoring-verb.test.mjs`

**Tests:** create `tests/skills/eval-layer3-scoring-verb.test.mjs` — asserts the skill's observable Layer 3 contract, following `tests/skills/eval-default-rubric.test.mjs`.

**Context to load:** Task 11 Context packet.

> **This task is required, not optional.** The spec says so in its Behavioral Contract and again in its Actionable Task Map. `skills/eval/SKILL.md` is the engine's only in-repo consumer today; leaving it discarding all of Layer 3 on `INSUFFICIENT_EVIDENCE` while the engine keeps the deterministic half numeric would ship a consumer that contradicts the module it calls. Do not defer it to a follow-up.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync("skills/eval/SKILL.md", "utf8");
const layer3 = skill.slice(skill.indexOf("## Layer 3"), skill.indexOf("## Layer 4"));

test("Layer 3 names the CLI verb that owns the arithmetic", () => {
  assert.match(layer3, /adev eval score/);
});

test("the aggregate formula no longer sits in the skill as an executable directive", () => {
  assert.doesNotMatch(layer3, /^\s*Layer 3 score\s*=\s*round\(/m,
    "the formula must document what the verb computes, not instruct the agent to compute it");
  assert.doesNotMatch(layer3, /element points\s*=\s*\(elements MET/,
    "the in-prose computation was relocated to lib/evals/score.mjs");
});

test("Layer 3 reports half-level statuses instead of discarding the whole layer", () => {
  assert.match(layer3, /INSUFFICIENT_EVIDENCE/);
  assert.match(layer3, /NOT_SCORED/);
  assert.match(layer3, /deterministic/i);
  assert.doesNotMatch(layer3, /report Layer 3 as `INSUFFICIENT_EVIDENCE`, contribute 0 points/,
    "the whole-layer discard contradicts the engine, which keeps the deterministic half numeric");
});

test("the report template renders a status half by name, never as 0", () => {
  const report = skill.slice(skill.indexOf("## Layer 3: Reference-Anchored Judgement —"));
  assert.match(report, /INSUFFICIENT_EVIDENCE|NOT_SCORED/);
});

test("the skill remains free of inline-Node directives", () => {
  assert.doesNotMatch(skill, /Run inline Node|node\s+--input-type=module\s+-e|node\s+-e/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/skills/eval-layer3-scoring-verb.test.mjs`
Expected: FAIL — the formula block and the "contribute 0 points" discard are still present; `adev eval score` is not named

- [ ] **Implement**

Rewrite Step 3 of Layer 3 to: assemble the verdict set from Steps 1 and 2, write it to a verdict file, then run `adev eval score --rubric <resolved rubric> --input <verdict file>` and report what it returns. The formula stays in the file only as a `text` block explaining *what the verb computes*, explicitly framed as descriptive reference — the constitution's second SKILL.md anti-pattern permits that framing and forbids the directive form. Then:

- Replace the insufficient-evidence paragraph: the judged half reports `INSUFFICIENT_EVIDENCE` and the deterministic half reports its points and maximum unchanged; the layer contributes the deterministic half and the attainable maximum is reduced by the judged budget only, not by `layer3_max_points`.
- Update the Scoring section (`:179-181`) so the reduced-attainable convention is stated at half granularity for Layer 3, leaving Layer 4's whole-layer skip convention as it is.
- Update the report template (`:215`) to render each half on its own line, by status name when it carries one.

Confirm afterwards that no H3 section of this SKILL.md carries both an inline-Node block and an `adev <verb>` invocation (the per-step boundary the pre-commit hook enforces) — this edit adds the verb call to a section that has no inline-Node block, so it stays clean, but run `node --test tests/skills-no-inline-node.test.mjs` to be sure.

- [ ] **Verify test passes**

Run: `node --test tests/skills/eval-layer3-scoring-verb.test.mjs tests/skills-no-inline-node.test.mjs tests/skills/eval-default-rubric.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `skills/eval/SKILL.md` and the suite, then commit as
`feat(eval): call adev eval score from Layer 3 and report half-level statuses`
with the `Spec:` and `Plan-task: 11` trailers.

> **Provider mirrors.** `providers/codex/skills/` and `providers/opencode/skills/` carry mirrors of some skills, but neither mirrors `eval`. Confirm with a directory listing before assuming no mirror edit is needed; if one has appeared since this plan was written, mirror the same change rather than leaving the copies divergent.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gates are taken from `.context-index/governance/gates.yaml`, which supersedes the constitution's Quality Gates block:

| Gate | Tier | Command | Severity |
|---|---|---|---|
| `test` / `quality-gate` | fast | `npm test` | error |
| `integration-test` | integration | `npm run test:evals` | warning (`required: false` until the eval tier is green again) |

- Tests pass: `npm test` — the new suites live in `tests/lib/evals/`, `tests/cli/`, and `tests/skills/`, all inside the default bucket (`scripts/run-tests.mjs` splits only `tests/evals/` into the opt-in tier), so they run on every `npm test`.
- No lint or typecheck gate is declared for this repository; there is no command to run.
- All acceptance criteria from the spec satisfied — the mapping is one criterion per suite, with the two multi-criterion suites (`score-verdict-validation`, `score-status-partition`) named in the File Structure section.
- Zero new external dependencies (constitution principle 1): every module added here imports only `node:` built-ins and existing `lib/` modules.
