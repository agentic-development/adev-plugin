<!-- partial_schema: plan@1 -->

# Implementation Plan: Unified rubric schema and loader

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md
> **Review:** PASS (2026-08-19) — 0 blockers, 0 warnings, 2 suggestions (SA-1, SA-2)
> **Platform:** Node.js, JavaScript (ESM `.mjs`), npm, `node:test` — no framework

**Goal:** Build `lib/evals/rubric.mjs::loadRubric(path)` and its companion schema constant so every rubric in the repository — `/adev:eval`'s Layer 3 rubric and the per-skill rubrics under `tests/evals/` — enters the system through one validating gate that fails loudly instead of degrading silently.

**Architecture:** The schema is data; the loader is its executable expression. `lib/evals/rubric-schema.mjs` holds the required/optional top-level key set, the two verdict enumerations, the per-entry required-field lists, the `budget_max_*` key form, and the error-code vocabulary as frozen constants — one place a reviewer can read the contract. `lib/evals/rubric.mjs` composes ordered validation passes over the parsed document (containment → read → parse/nesting → top-level keys → entry completeness → verdict enums → budgets → legacy scale → uniqueness) and constructs the returned Rubric only after every pass has succeeded, so "no partially-populated Rubric" is a structural property rather than a discipline. Parsing reuses `lib/profiles/yaml.mjs::parseYaml` (constitution principle 1: zero new dependencies); because that parser *does* build nested maps, nesting is detected on the parsed tree and rejected rather than flattened away at read time. Path containment reuses `lib/path-safety.mjs` (`resolveContained`, `lenientRealpath`), following the `UNSAFE_TEMPLATE_PATH` precedent in `lib/template-resolution.mjs`. Errors are built with `lib/errors.mjs::codedError` so each carries a `code` that skills and the CLI can branch on.

**Review-note disposition:**

- **SA-1** (BEH-8's legacy 1-5 `weight` detection rule is loosely stated) — resolved in Task 8, which pins the rule mechanically: a `quality_dimensions` entry carrying a `weight` key whose value is a number is a legacy rubric. The 1-5 range is *not* the trigger; the presence of a numeric `weight` on a judged criterion is, because the binary-verdict schema has no `weight` field at all. That is both stricter and easier to test than a range check, and it also catches a 1-10 or 0-1 rescaling.
- **SA-2** (`RUBRIC_NOT_FOUND` / `RUBRIC_DUPLICATE_ID` appear in Error Cases with no BEH id) — resolved by giving each explicit test ownership rather than leaving it implied. `RUBRIC_NOT_FOUND` is covered by Task 2 alongside BEH-7 (both are pre-read path failures); `RUBRIC_DUPLICATE_ID` by Task 9 alongside the uniqueness postcondition. Neither needs a new behavior statement in the spec; both now have a named suite that fails if they regress.

---


## File Structure

**Create:**

- `lib/evals/rubric-schema.mjs` — frozen schema constants: `REQUIRED_TOP_LEVEL_KEYS`, `OPTIONAL_TOP_LEVEL_KEYS`, `ELEMENT_VERDICTS`, `CRITERION_VERDICTS`, `REQUIRED_ELEMENT_FIELDS`, `REQUIRED_CRITERION_FIELDS`, `BUDGET_KEY_PATTERN`, `RUBRIC_ERROR_CODES`
- `lib/evals/rubric.mjs` — `loadRubric(path, options)` plus the named validation passes it composes
- `tests/lib/evals/rubric-schema-contract.test.mjs` — the schema constant is the single source of truth
- `tests/lib/evals/rubric-path-containment.test.mjs` — BEH-7 + `RUBRIC_NOT_FOUND`
- `tests/lib/evals/rubric-nested-map.test.mjs` — BEH-2
- `tests/lib/evals/rubric-missing-keys.test.mjs` — BEH-3
- `tests/lib/evals/rubric-incomplete-entries.test.mjs` — BEH-5
- `tests/lib/evals/rubric-verdict-enums.test.mjs` — BEH-4
- `tests/lib/evals/rubric-budget-keys.test.mjs` — BEH-6
- `tests/lib/evals/rubric-legacy-scale.test.mjs` — BEH-8
- `tests/lib/evals/rubric-load-success.test.mjs` — BEH-1 + postconditions + `RUBRIC_DUPLICATE_ID`
- `tests/fixtures/evals/rubrics/conforming.yaml` — the happy-path fixture every suite reads
- `tests/fixtures/evals/rubrics/nested-map.yaml`
- `tests/fixtures/evals/rubrics/missing-keys.yaml`
- `tests/fixtures/evals/rubrics/malformed.yaml`
- `tests/fixtures/evals/rubrics/incomplete-element.yaml`
- `tests/fixtures/evals/rubrics/incomplete-criterion.yaml`
- `tests/fixtures/evals/rubrics/element-without-id.yaml`
- `tests/fixtures/evals/rubrics/invalid-element-verdict.yaml`
- `tests/fixtures/evals/rubrics/invalid-criterion-verdict.yaml`
- `tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml`
- `tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml`
- `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`
- `tests/fixtures/evals/rubrics/duplicate-ids.yaml`

**Modify:**

- None. This spec adds a new module; no existing consumer is rewired here. Migrating `skills/eval/default-rubric.yaml` and `tests/evals/skill-compression/rubrics/*.yaml` onto the loader belongs to the *Scoring engine and `adev eval score`* capability and the skill-compression migration, which are separate specs.

**Reference (read, do not modify):**

- `skills/eval/default-rubric.yaml` — the de-facto shape the schema must accept unchanged; its header documents the flat-value rule and the two deliberate deviations from the skill-compression pattern
- `tests/evals/skill-compression/rubrics/plan.yaml` — the legacy 1-5 `weight` shape Task 8 must reject
- `lib/profiles/yaml.mjs` — `parseYaml` / `YamlParseError`; the parser this loader wraps
- `lib/path-safety.mjs` — `resolveContained`, `lenientRealpath`, `isContained`
- `lib/template-resolution.mjs:158-205` — the `UNSAFE_TEMPLATE_PATH` precedent for a containment error
- `lib/errors.mjs:25` — `codedError(code, message)`
- `.context-index/samples/general-library-module-graph.md` — module-boundary and export conventions for `lib/`
- `.context-index/samples/general-test-helpers.md` — `createTempDir` / `cleanupTempDir` / `writeFixture` usage
- `tests/helpers.mjs` — the helper implementations

## Context Packets

No `source-manifest.files[]` exists on this spec (it is new), so packets fall back to the charter Dependencies table, the sibling rubric files that establish the on-disk shape, and the orientation file for module placement.

### Task 1 Context
- Spec: `rubric-schema-and-loader.spec.md` — Behavioral Contract, Error Cases table (all ten codes)
- Charter: `eval-harness/charter.md` — capability *Unified rubric schema*; Domain Model entities Rubric, RequiredElement, QualityCriterion, Verdict
- Source files: `skills/eval/default-rubric.yaml` (full read — the reference shape), `tests/evals/skill-compression/rubrics/plan.yaml` (full read — the legacy shape)
- Sample: `.context-index/samples/general-library-module-graph.md`
- Constitution: principles 1 (minimize dependencies) and 3 (pure ESM)
- Heuristics: 0 relevant entries for module `eval-harness` (see Heuristics section)

### Task 2 Context
- Spec: BEH-7, Preconditions, Error Cases rows `UNSAFE_RUBRIC_PATH` and `RUBRIC_NOT_FOUND`
- Charter: Quality Attributes → Security ("validated against traversal, following the `UNSAFE_TEMPLATE_PATH` precedent")
- Source files: `lib/path-safety.mjs` (full read), `lib/template-resolution.mjs:150-210` (error builder + containment shape only)
- Sample: `.context-index/samples/general-test-helpers.md` (temp-dir and symlink fixtures)
- Boundary rules: no `governance/boundaries.yaml` content rule matches ESM `lib/**/*.mjs`

### Task 3 Context
- Spec: BEH-2, and the Behavioral Contract paragraph explaining *why* the flat-value rule exists
- Source files: `lib/profiles/yaml.mjs` (full read — `parseYaml` builds nested maps, so nesting must be detected post-parse)
- Charter: Invariants — "A rubric file containing a nested map is rejected at load with a named error, never silently loaded as an empty structure"
- Reference: `skills/eval/default-rubric.yaml` lines 32-35 (the flat-value rule, stated verbatim)

### Task 4 Context
- Spec: BEH-3, Error Cases row `RUBRIC_MISSING_KEY`
- Source files: `lib/evals/rubric-schema.mjs` (from Task 1 — `REQUIRED_TOP_LEVEL_KEYS`)
- Reference: `skills/eval/SKILL.md:118` — the eleven top-level keys the shipped rubric declares

### Task 5 Context
- Spec: BEH-5, Error Cases rows `RUBRIC_INCOMPLETE_ELEMENT` and `RUBRIC_INCOMPLETE_CRITERION`
- Charter: Domain Model → RequiredElement (`id`, `source`, `met_when`, `not_applicable_when`), QualityCriterion (`id`, `criterion`, `reference`, `met_when`, `not_met_when`, `unknown_when`)
- Source files: `lib/evals/rubric-schema.mjs` (`REQUIRED_ELEMENT_FIELDS`, `REQUIRED_CRITERION_FIELDS`)

### Task 6 Context
- Spec: BEH-4, Error Cases row `RUBRIC_INVALID_VERDICT`
- Charter: Invariants — "A RequiredElement never resolves to `unknown`; a QualityCriterion never resolves to `not_applicable`" (why the two enums differ)
- Source files: `lib/evals/rubric-schema.mjs` (`ELEMENT_VERDICTS`, `CRITERION_VERDICTS`)

### Task 7 Context
- Spec: BEH-6, Error Cases row `RUBRIC_INVALID_BUDGET`
- Charter: Domain Model → Budget (`budget_max_turns`, `budget_max_duration_ms`, `budget_max_cost_usd`, `sample_count`)
- Source files: `lib/evals/rubric-schema.mjs` (`BUDGET_KEY_PATTERN`)
- Scope note: this task validates the *shape* of budget keys only. Median-plus-spread evaluation over a sample set belongs to the *Budget thresholds as failing verdicts* capability.

### Task 8 Context
- Spec: BEH-8, Error Cases row `RUBRIC_LEGACY_SCALE`; review note SA-1
- Source files: `tests/evals/skill-compression/rubrics/plan.yaml`, `brainstorm.yaml`, `specify.yaml` (full read — the three rubrics that will trip this check until they are migrated)
- Charter: Scope — the skill-compression migration is a *separate* capability; this task only rejects, never coerces

### Task 9 Context
- Spec: BEH-1, all four Postconditions, Error Cases row `RUBRIC_DUPLICATE_ID`; review note SA-2
- Charter: Domain Model → Rubric attribute list
- Source files: `lib/evals/rubric.mjs` as assembled by Tasks 2-8
- Reference: `skills/eval/default-rubric.yaml` (full read — the conforming fixture is modelled on it, so a regression against the real shipped rubric is caught)

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

`adev heuristics retrieve --module eval-harness --format text` returned three entries, all from the token-measurement line of work: use session JSONL rather than byte estimates for token measurement; cache reads dominate session cost; summarized skill output preserves artifact quality. None bears on rubric schema authoring or loader validation. They are recorded here for traceability and are expected to matter to the *Run-cost record* capability rather than to this spec.

## Parallelization

- **Group A (sequential):** Task 1 → Task 2 → Task 3 → Task 9 — Task 1 creates the schema constant every later task imports; Tasks 2, 3 and 9 edit `lib/evals/rubric.mjs` at its structural seams (entry point, parse step, final assembly).
- **Group B (sequential, after Task 3):** Task 4 → Task 5 → Task 6 → Task 7 → Task 8 — each adds one validation pass to `lib/evals/rubric.mjs`; each owns its own suite and fixtures.

Groups A and B share `lib/evals/rubric.mjs`, so this plan is effectively fully sequential: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. That is a deliberate consequence of the module being one composed function. Splitting the validation passes into separate files purely to unlock parallelism would trade a real design property (one gate, one file) for a scheduling convenience.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Schema reference constant | small | unit | — | 2 create, 0 modify |
| 2 | Path containment and read | small | unit | Task 1 | 2 create, 0 modify |
| 3 | Flat-value parse and nested-map rejection | medium | unit | Task 2 | 2 create, 1 modify |
| 4 | Required top-level key validation | small | unit | Task 3 | 2 create, 1 modify |
| 5 | Element and criterion completeness | medium | unit | Task 4 | 4 create, 1 modify |
| 6 | Verdict enum validation | small | unit | Task 5 | 3 create, 1 modify |
| 7 | Budget key validation | small | unit | Task 6 | 3 create, 1 modify |
| 8 | Legacy weight-scale rejection | small | unit | Task 7 | 2 create, 1 modify |
| 9 | Rubric assembly, uniqueness, and purity | medium | unit | Task 8 | 2 create, 1 modify |

All nine tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and `detectTaskStrategy` returns `unit` for `lib/**` and `tests/**` paths). Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:` and no task carries a non-unit strategy, so the Test Infrastructure Requirements section is omitted as well — the loader reads one local file, spawns nothing, and opens no socket.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). Each spec behavior gets one suite path; tasks implementing the same behavior share it. No suite is shared in this plan, because the decomposition is one task per behavior, with the two un-numbered Error Cases rows folded into the behavior suite they sit beside (SA-2). Every task's `**Tests:**` field therefore reads *create*, and `tests/lib/evals/` is a new directory. Repo convention supports the split: `tests/lib/heuristics-*.test.mjs` is already several focused files against one module.

---

## Tasks

All tasks share one branch: `feat/lib/rubric-schema-and-loader`. Every commit carries the `Spec:` and `Plan-task:` trailers the constitution requires, alongside the hook-injected `Author-type` and `Operator` trailers.

### Task 1: Schema reference constant [specialist: none]

**Charter capability:** Unified rubric schema
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/evals/rubric-schema.mjs`
- Test: `tests/lib/evals/rubric-schema-contract.test.mjs`

**Tests:** create `tests/lib/evals/rubric-schema-contract.test.mjs` — this task defines the schema itself rather than one behavior, so its suite asserts the constant's shape and its agreement with the shipped rubric.

**Context to load:** Task 1 Context packet above.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REQUIRED_TOP_LEVEL_KEYS,
  ELEMENT_VERDICTS,
  CRITERION_VERDICTS,
  REQUIRED_ELEMENT_FIELDS,
  REQUIRED_CRITERION_FIELDS,
  BUDGET_KEY_PATTERN,
  RUBRIC_ERROR_CODES,
} from "../../../lib/evals/rubric-schema.mjs";

test("verdict enums differ: elements never take unknown, criteria never take not_applicable", () => {
  assert.deepEqual([...ELEMENT_VERDICTS].sort(), ["met", "not_applicable", "not_met"]);
  assert.deepEqual([...CRITERION_VERDICTS].sort(), ["met", "not_met", "unknown"]);
});

test("every error code named in the spec's Error Cases table is declared", () => {
  for (const code of [
    "RUBRIC_NESTED_MAP", "RUBRIC_MISSING_KEY", "RUBRIC_INVALID_VERDICT",
    "RUBRIC_INCOMPLETE_ELEMENT", "RUBRIC_INCOMPLETE_CRITERION",
    "RUBRIC_INVALID_BUDGET", "UNSAFE_RUBRIC_PATH", "RUBRIC_LEGACY_SCALE",
    "RUBRIC_NOT_FOUND", "RUBRIC_DUPLICATE_ID",
  ]) {
    assert.ok(RUBRIC_ERROR_CODES.includes(code), `missing code ${code}`);
  }
});

test("the shipped default rubric declares every required top-level key", () => {
  const raw = readFileSync("skills/eval/default-rubric.yaml", "utf8");
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    assert.match(raw, new RegExp(`^${key}:`, "m"), `default rubric lacks ${key}`);
  }
});

test("budget keys match the budget_max_* form and nothing else", () => {
  assert.ok(BUDGET_KEY_PATTERN.test("budget_max_turns"));
  assert.ok(BUDGET_KEY_PATTERN.test("budget_max_cost_usd"));
  assert.ok(!BUDGET_KEY_PATTERN.test("budget_turns"));
  assert.ok(!BUDGET_KEY_PATTERN.test("max_turns"));
});

test("per-entry required-field lists match the charter domain model", () => {
  assert.deepEqual([...REQUIRED_ELEMENT_FIELDS].sort(), ["id", "met_when", "source"]);
  assert.deepEqual(
    [...REQUIRED_CRITERION_FIELDS].sort(),
    ["criterion", "id", "met_when", "not_met_when", "reference", "unknown_when"],
  );
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-schema-contract.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/evals/rubric-schema.mjs'`

- [ ] **Implement**

Create `lib/evals/rubric-schema.mjs` exporting frozen constants only — no functions, no I/O. `REQUIRED_TOP_LEVEL_KEYS` is the top-level key set `skills/eval/SKILL.md:118` names (`rubric_id`, `version`, `layer`, `verdict_values`, `required_elements`, `quality_dimensions`, `layer3_max_points`, `required_element_points`, `judged_criterion_points`, `unknown_policy`, `not_applicable_policy`, `insufficient_evidence_threshold_percent`); resolve the exact list against that line and against `skills/eval/default-rubric.yaml`, and let this constant be authoritative from here on. `OPTIONAL_TOP_LEVEL_KEYS` carries `skill`, `scenario`, and the `budget_max_*` family. `BUDGET_KEY_PATTERN` is `/^budget_max_[a-z0-9_]+$/`. Freeze every export with `Object.freeze`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-schema-contract.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch (if not already created): `feat/lib/rubric-schema-and-loader`

Stage `lib/evals/rubric-schema.mjs` and `tests/lib/evals/rubric-schema-contract.test.mjs`, then commit with subject `feat(evals): add unified rubric schema reference constant` and trailers:

```
Spec: .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md
Plan-task: 1
```

---

### Task 2: Path containment and read [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Behaviors:** BEH-7; Error Cases row `RUBRIC_NOT_FOUND` (review note SA-2)
**Files:**
- Create: `lib/evals/rubric.mjs`
- Test: `tests/lib/evals/rubric-path-containment.test.mjs`

**Tests:** create `tests/lib/evals/rubric-path-containment.test.mjs`

**Context to load:** Task 2 Context packet above.

- [ ] **Write failing test**

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, cleanupTempDir } from "../../helpers.mjs";
import { loadRubric } from "../../../lib/evals/rubric.mjs";

test("a traversal path is rejected and nothing is read", () => {
  const root = createTempDir();
  try {
    const err = assert.throws(() => loadRubric("../../etc/passwd", { projectRoot: root }));
    assert.equal(err.code, "UNSAFE_RUBRIC_PATH");
    assert.match(err.message, /\.\.\/\.\.\/etc\/passwd/); // reported verbatim
  } finally {
    cleanupTempDir(root);
  }
});

test("a symlink escaping the project root is rejected", () => {
  const root = createTempDir();
  const outside = createTempDir();
  try {
    writeFileSync(join(outside, "real.yaml"), "rubric_id: x\n");
    mkdirSync(join(root, "rubrics"));
    symlinkSync(join(outside, "real.yaml"), join(root, "rubrics", "link.yaml"));
    const err = assert.throws(() => loadRubric("rubrics/link.yaml", { projectRoot: root }));
    assert.equal(err.code, "UNSAFE_RUBRIC_PATH");
  } finally {
    cleanupTempDir(root);
    cleanupTempDir(outside);
  }
});

test("a contained but absent path throws RUBRIC_NOT_FOUND naming the resolved path", () => {
  const root = createTempDir();
  try {
    const err = assert.throws(() => loadRubric("rubrics/gone.yaml", { projectRoot: root }));
    assert.equal(err.code, "RUBRIC_NOT_FOUND");
    assert.match(err.message, /gone\.yaml/);
  } finally {
    cleanupTempDir(root);
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-path-containment.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/evals/rubric.mjs'`

- [ ] **Implement**

Create `lib/evals/rubric.mjs` with `loadRubric(rubricPath, { projectRoot = process.cwd() } = {})`. Order is load-bearing: resolve with `resolveContained`, run the resolved path through `lenientRealpath` and re-check with `isContained` (a symlink whose link file sits inside the root but whose target does not must fail), and only then `existsSync` / `readFileSync`. Throw `codedError("UNSAFE_RUBRIC_PATH", …)` reporting the *caller-supplied* path verbatim, per BEH-7. `RUBRIC_NOT_FOUND` names the resolved absolute path and also covers an unreadable file — catch the read failure and rethrow with that code. Return the raw source string for now; later tasks add the passes on top.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-path-containment.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/rubric.mjs` and its suite; subject `feat(evals): contain and read rubric paths before any parse`; trailers `Spec:` (as above) and `Plan-task: 2`.

---

### Task 3: Flat-value parse and nested-map rejection [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Behaviors:** BEH-2
**Files:**
- Create: `tests/lib/evals/rubric-nested-map.test.mjs`, `tests/fixtures/evals/rubrics/nested-map.yaml`, `tests/fixtures/evals/rubrics/conforming.yaml`, `tests/fixtures/evals/rubrics/malformed.yaml`
- Modify: `lib/evals/rubric.mjs` — add the parse pass after the read
- Test: `tests/lib/evals/rubric-nested-map.test.mjs`

**Tests:** create `tests/lib/evals/rubric-nested-map.test.mjs`

**Context to load:** Task 3 Context packet above.

- [ ] **Write failing test**

```javascript
test("a nested map below a top-level key is rejected, naming the key path", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/nested-map.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_NESTED_MAP");
  assert.match(err.message, /budgets\.max_turns/); // the offending key path, not just the top key
});

test("the two sanctioned list-of-flat-maps shapes are not treated as nesting", () => {
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.ok(Array.isArray(rubric.required_elements));
  assert.ok(Array.isArray(rubric.quality_dimensions));
});

test("a malformed YAML document surfaces as a coded rubric error, not a raw YamlParseError", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/malformed.yaml", { projectRoot: repoRoot }),
  );
  assert.ok(typeof err.code === "string" && err.code.startsWith("RUBRIC_"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-nested-map.test.mjs`
Expected: FAIL — `loadRubric` still returns a string, so `rubric.required_elements` is `undefined` and no `RUBRIC_NESTED_MAP` is thrown

- [ ] **Implement**

Parse with `parseYaml` from `lib/profiles/yaml.mjs`, wrapping `YamlParseError` in a coded rubric error so no uncoded parser exception escapes. Then walk the parsed tree: a top-level value that is a plain object is a nested map and throws `RUBRIC_NESTED_MAP` with the dotted key path; inside `required_elements` and `quality_dimensions`, list items are expected to be flat maps, so nesting is flagged one level deeper (`quality_dimensions[2].thresholds.high`). Build the key path while descending so the message names the exact offender rather than the top-level key. Author `nested-map.yaml`, `malformed.yaml`, and the shared `conforming.yaml` (modelled on `skills/eval/default-rubric.yaml`, trimmed to two elements and two criteria) — `conforming.yaml` is read by every later suite.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-nested-map.test.mjs`
Expected: PASS

- [ ] **Commit**

Stage `lib/evals/rubric.mjs`, the suite, and `tests/fixtures/evals/rubrics/`; subject `feat(evals): reject nested maps in rubrics instead of flattening them`; trailers `Spec:` and `Plan-task: 3`.

---

### Task 4: Required top-level key validation [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Behaviors:** BEH-3
**Files:**
- Create: `tests/lib/evals/rubric-missing-keys.test.mjs`, `tests/fixtures/evals/rubrics/missing-keys.yaml`
- Modify: `lib/evals/rubric.mjs` — add the required-key pass after the parse pass
- Test: `tests/lib/evals/rubric-missing-keys.test.mjs`

**Tests:** create `tests/lib/evals/rubric-missing-keys.test.mjs`

**Context to load:** Task 4 Context packet above.

- [ ] **Write failing test**

```javascript
test("every missing key is listed in one error, not just the first", () => {
  // fixture omits three required keys: layer, unknown_policy, judged_criterion_points
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/missing-keys.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_MISSING_KEY");
  for (const key of ["layer", "unknown_policy", "judged_criterion_points"]) {
    assert.match(err.message, new RegExp(key), `message omits ${key}`);
  }
});

test("a key present but empty still counts as declared", () => {
  // BEH-3 is about absence, not emptiness; an empty value is another pass's problem.
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.ok(rubric);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-missing-keys.test.mjs`
Expected: FAIL — no `RUBRIC_MISSING_KEY` is thrown; the incomplete fixture loads

- [ ] **Implement**

Add a pass that diffs `Object.keys(parsed)` against `REQUIRED_TOP_LEVEL_KEYS`, collects every absent key, and throws a single `RUBRIC_MISSING_KEY` whose message joins them in the constant's declaration order. The aggregation is the behavior — do not short-circuit on the first miss. Unknown extra keys are not an error here; the schema is open at the top level so `skill:` and `scenario:` (the skill-compression shape) still load.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-missing-keys.test.mjs`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): report every missing rubric key in one error`; trailers `Spec:` and `Plan-task: 4`.

---

### Task 5: Element and criterion completeness [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 4
**Behaviors:** BEH-5
**Files:**
- Create: `tests/lib/evals/rubric-incomplete-entries.test.mjs`, `tests/fixtures/evals/rubrics/incomplete-element.yaml`, `tests/fixtures/evals/rubrics/incomplete-criterion.yaml`, `tests/fixtures/evals/rubrics/element-without-id.yaml`
- Modify: `lib/evals/rubric.mjs` — add the entry-completeness pass
- Test: `tests/lib/evals/rubric-incomplete-entries.test.mjs`

**Tests:** create `tests/lib/evals/rubric-incomplete-entries.test.mjs`

**Context to load:** Task 5 Context packet above.

- [ ] **Write failing test**

```javascript
test("a required_elements entry missing met_when throws RUBRIC_INCOMPLETE_ELEMENT naming the id", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/incomplete-element.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_ELEMENT");
  assert.match(err.message, /tests_accompany_source/); // the entry id
});

test("a quality_dimensions entry missing unknown_when names the id AND the missing field", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/incomplete-criterion.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_CRITERION");
  assert.match(err.message, /naming_clarity/);
  assert.match(err.message, /unknown_when/);
});

test("an entry with no id at all is reported by its list position, never as undefined", () => {
  // dedicated fixture: element[1] declares source + met_when but no id, so this
  // exercises the entry[<index>] fallback rather than re-testing the id path.
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/element-without-id.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INCOMPLETE_ELEMENT");
  assert.match(err.message, /required_elements\[1\]/);
  assert.doesNotMatch(err.message, /undefined/);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-incomplete-entries.test.mjs`
Expected: FAIL — both fixtures load without throwing

- [ ] **Implement**

Walk `required_elements` against `REQUIRED_ELEMENT_FIELDS` and `quality_dimensions` against `REQUIRED_CRITERION_FIELDS`. Throw `RUBRIC_INCOMPLETE_ELEMENT` naming the entry id; throw `RUBRIC_INCOMPLETE_CRITERION` naming the entry id *and* the missing field, per BEH-5's asymmetric wording. When an entry has no `id`, fall back to `entry[<index>]` so no message ever prints `undefined`. `not_applicable_when` stays optional on elements — `skills/eval/default-rubric.yaml` carries it on every entry, but BEH-5 names only `source` and `met_when` as required, and widening the requirement here would reject conforming rubrics.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-incomplete-entries.test.mjs`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): reject incomplete rubric elements and criteria`; trailers `Spec:` and `Plan-task: 5`.

---

### Task 6: Verdict enum validation [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 5
**Behaviors:** BEH-4
**Files:**
- Create: `tests/lib/evals/rubric-verdict-enums.test.mjs`, `tests/fixtures/evals/rubrics/invalid-element-verdict.yaml`, `tests/fixtures/evals/rubrics/invalid-criterion-verdict.yaml`
- Modify: `lib/evals/rubric.mjs` — add the verdict pass
- Test: `tests/lib/evals/rubric-verdict-enums.test.mjs`

**Tests:** create `tests/lib/evals/rubric-verdict-enums.test.mjs`

**Context to load:** Task 6 Context packet above.

- [ ] **Write failing test**

```javascript
test("an element declaring unknown is rejected — elements never resolve to unknown", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-element-verdict.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /no_debug_residue/); // entry id
  assert.match(err.message, /unknown/);          // the illegal value
});

test("a criterion declaring not_applicable is rejected — criteria never resolve to not_applicable", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-criterion-verdict.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_VERDICT");
  assert.match(err.message, /not_applicable/);
});

test("the conforming fixture passes the verdict pass unchanged", () => {
  assert.ok(loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot }));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-verdict-enums.test.mjs`
Expected: FAIL — both invalid fixtures load

- [ ] **Implement**

Validate any declared verdict value on an entry against `ELEMENT_VERDICTS` for `required_elements` and `CRITERION_VERDICTS` for `quality_dimensions`, throwing `RUBRIC_INVALID_VERDICT` naming the entry id and the illegal value. The two enums are deliberately different — the charter invariant "a RequiredElement never resolves to `unknown`; a QualityCriterion never resolves to `not_applicable`" is exactly what this pass enforces, so do not collapse them into one set. The top-level `verdict_values` key is a human-readable description string, not a machine list; do not parse it as the enum source.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-verdict-enums.test.mjs`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): enforce the element and criterion verdict enumerations`; trailers `Spec:` and `Plan-task: 6`.

---

### Task 7: Budget key validation [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Behaviors:** BEH-6
**Files:**
- Create: `tests/lib/evals/rubric-budget-keys.test.mjs`, `tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml`, `tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml`
- Modify: `lib/evals/rubric.mjs` — add the budget pass
- Test: `tests/lib/evals/rubric-budget-keys.test.mjs`

**Tests:** create `tests/lib/evals/rubric-budget-keys.test.mjs`

**Context to load:** Task 7 Context packet above.

- [ ] **Write failing test**

```javascript
test("a zero or negative budget is rejected, naming the offending key", () => {
  // fixture: budget_max_turns: 0, budget_max_cost_usd: -1
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
  assert.match(err.message, /budget_max_turns/);
});

test("a non-numeric budget is rejected, naming the offending key", () => {
  // separate fixture so the two failure modes cannot be confused: this one carries
  // budget_max_duration_ms: "twelve" and a quoted budget_max_cost_usd: "12".
  // parseYaml types scalars, so a quoted value arrives as a string and must fail —
  // a numeric-looking string is an authoring error, not something to coerce.
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_INVALID_BUDGET");
  assert.match(err.message, /budget_max_duration_ms/);
});

test("a rubric declaring no budget keys at all loads — budgets are optional", () => {
  assert.ok(loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot }));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-budget-keys.test.mjs`
Expected: FAIL — both invalid-budget fixtures load

- [ ] **Implement**

Select every top-level key matching `BUDGET_KEY_PATTERN` and assert its value is a finite number greater than zero, throwing `RUBRIC_INVALID_BUDGET` naming the key. Reject `NaN`, `Infinity`, booleans, and strings — including numeric-looking strings, since a quoted `"12"` in a rubric is an authoring error the loader should surface rather than coerce. Budget keys are optional: absence is not an error. Threshold *evaluation* (median plus spread over a sample set) belongs to the *Budget thresholds as failing verdicts* capability and must not appear here.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-budget-keys.test.mjs`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): validate budget_max_* keys carry positive numbers`; trailers `Spec:` and `Plan-task: 7`.

---

### Task 8: Legacy weight-scale rejection [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 7
**Behaviors:** BEH-8 (review note SA-1 tightens the detection rule)
**Files:**
- Create: `tests/lib/evals/rubric-legacy-scale.test.mjs`, `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`
- Modify: `lib/evals/rubric.mjs` — add the legacy-scale pass
- Test: `tests/lib/evals/rubric-legacy-scale.test.mjs`

**Tests:** create `tests/lib/evals/rubric-legacy-scale.test.mjs`

**Context to load:** Task 8 Context packet above.

- [ ] **Write failing test**

```javascript
test("a numeric weight on a quality dimension is rejected with a migration message", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
  assert.match(err.message, /binary verdict/i); // names the migration, per BEH-8
});

test("the scale is never coerced — no partially migrated rubric comes back", () => {
  assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
});

test("detection triggers on a numeric weight of any range, not only 1-5", () => {
  // SA-1: the trigger is the presence of a numeric `weight` on a judged criterion,
  // because the binary-verdict schema has no `weight` field at all. A 1-10 or 0-1
  // rescaling is just as legacy as a 1-5 one.
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_LEGACY_SCALE");
});
```

The `legacy-weight-scale.yaml` fixture carries one dimension at `weight: 3` and one at `weight: 9`, so the third test exercises an out-of-1-5 value.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-legacy-scale.test.mjs`
Expected: FAIL — the legacy fixture loads

- [ ] **Implement**

If any `quality_dimensions` entry carries a `weight` key whose value is a number, throw `RUBRIC_LEGACY_SCALE` naming the migration to binary verdicts and listing the offending entry ids. Per SA-1, the trigger is *presence of a numeric `weight` on a judged criterion*, not a 1-5 range check: the binary schema has no `weight` field, so any numeric weight is by definition a pre-migration rubric, and range-checking would let a 1-10 rescale through. Never coerce. This pass runs after completeness and verdict validation so a legacy rubric gets the most specific error rather than an incidental one about a missing `unknown_when`. Note that `tests/evals/skill-compression/rubrics/{plan,brainstorm,specify}.yaml` will trip this check until the separate migration capability lands — that is the intended signal, not a regression.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-legacy-scale.test.mjs`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): reject legacy weighted rubrics instead of coercing them`; trailers `Spec:` and `Plan-task: 8`.

---

### Task 9: Rubric assembly, uniqueness, and purity [specialist: none]

**Charter capability:** Rubric loader and validator
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 8
**Behaviors:** BEH-1; all four Postconditions; Error Cases row `RUBRIC_DUPLICATE_ID` (review note SA-2)
**Files:**
- Create: `tests/lib/evals/rubric-load-success.test.mjs`, `tests/fixtures/evals/rubrics/duplicate-ids.yaml`
- Modify: `lib/evals/rubric.mjs` — construct and return the Rubric after every pass
- Test: `tests/lib/evals/rubric-load-success.test.mjs`

**Tests:** create `tests/lib/evals/rubric-load-success.test.mjs`

**Context to load:** Task 9 Context packet above.

- [ ] **Write failing test**

```javascript
test("a conforming rubric exposes every declared element and criterion", () => {
  const rubric = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.equal(rubric.required_elements.length, 2);
  assert.equal(rubric.quality_dimensions.length, 2);
  assert.equal(rubric.rubric_id, "fixture-conforming");
});

test("the real shipped default rubric loads", () => {
  // guards against the schema drifting away from the artifact it describes
  const rubric = loadRubric("skills/eval/default-rubric.yaml", { projectRoot: repoRoot });
  assert.ok(rubric.required_elements.length > 0);
  assert.ok(rubric.quality_dimensions.length > 0);
});

test("duplicate element or criterion ids are rejected, naming the id", () => {
  const err = assert.throws(() =>
    loadRubric("tests/fixtures/evals/rubrics/duplicate-ids.yaml", { projectRoot: repoRoot }),
  );
  assert.equal(err.code, "RUBRIC_DUPLICATE_ID");
  assert.match(err.message, /spec_criteria_referenced/);
});

test("loading twice in one process yields structurally identical objects — no cache", () => {
  const a = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  const b = loadRubric("tests/fixtures/evals/rubrics/conforming.yaml", { projectRoot: repoRoot });
  assert.deepEqual(a, b);
  assert.notEqual(a, b); // distinct objects: no shared mutable state between calls
});

test("a failed load exposes no partial Rubric", () => {
  // every rejecting fixture must throw rather than return a half-built object
  for (const f of ["missing-keys", "invalid-budget-nonpositive", "legacy-weight-scale", "duplicate-ids"]) {
    assert.throws(
      () => loadRubric(`tests/fixtures/evals/rubrics/${f}.yaml`, { projectRoot: repoRoot }),
      (e) => typeof e.code === "string",
    );
  }
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-load-success.test.mjs`
Expected: FAIL — no `RUBRIC_DUPLICATE_ID` is thrown and `loadRubric` does not yet return a normalized Rubric

- [ ] **Implement**

Add the uniqueness pass (`RUBRIC_DUPLICATE_ID`, naming the duplicated id, checked separately within each of the two lists) as the last validation, then construct and return the Rubric object. Construction happens only after every pass has succeeded — that ordering *is* the "no partially-populated Rubric" postcondition, so keep it structural rather than relying on a comment. Return a fresh object on each call with no module-level cache, and perform no writes, no `spawn`, and no network access anywhere on the path. Add a short module doc comment listing the pass order, since that order is load-bearing for which error a malformed rubric receives.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-load-success.test.mjs`
Then the full suite: `npm test`
Expected: PASS

- [ ] **Commit**

Subject `feat(evals): assemble and return a validated Rubric with unique ids`; trailers `Spec:` and `Plan-task: 9`.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

Gate definitions come from `.context-index/governance/gates.yaml` (the manifest's legacy top-level `gates:` block is no longer read):

| Gate | Tier | Command | Severity |
|---|---|---|---|
| `test` — Test Suite | fast | `npm test` | error |
| `quality-gate` | fast | `npm test` | error |
| `integration-test` — Integration Tests (eval tier) | integration | `npm run test:evals` | warning (`required: false` until the eval tier is green) |

No lint or typecheck gate is declared in this repository, so none is listed. Beyond the gates:

- All acceptance criteria from the spec are satisfied — the twelve checkboxes map to Tasks 1-9 as follows: BEH-1 → Task 9, BEH-2 → Task 3, BEH-3 → Task 4, BEH-4 → Task 6, BEH-5 → Task 5, BEH-6 → Task 7, BEH-7 → Task 2, BEH-8 → Task 8, unique ids → Task 9, no partial Rubric → Task 9, no writes/no network → Task 9, quality gates → this section, zero new dependencies → enforced throughout (only `node:` built-ins and existing `lib/` modules are imported).
- Constitution compliance: pure ESM `.mjs`, camelCase functions, kebab-case files, Node built-ins only, no executable logic added to any SKILL.md, no version bumps in `package.json` / `.claude-plugin/plugin.json` / `.cursor-plugin/plugin.json`.
- No `governance/boundaries.yaml` rule matches the added files: they are ESM (no `no-commonjs` hit) and none is a `skills/**/SKILL.md` (no `no-inline-node-in-skills` hit).

