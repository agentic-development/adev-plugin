<!-- partial_schema: spec@1 -->

---
charter: eval-harness
kind: behavioral
status: implemented
risk_level: medium
milestone: v1
revision: 1
charter-revision: 2
created: 2026-08-19
updated: 2026-08-19
source-manifest:
  sha: "84a465b"
  files:
    - lib/evals/rubric-schema.mjs
    - lib/evals/rubric.mjs
    - skills/eval/default-rubric.yaml
    - tests/fixtures/evals/rubrics/conforming.yaml
    - tests/fixtures/evals/rubrics/duplicate-ids.yaml
    - tests/fixtures/evals/rubrics/element-without-id.yaml
    - tests/fixtures/evals/rubrics/incomplete-criterion.yaml
    - tests/fixtures/evals/rubrics/incomplete-element.yaml
    - tests/fixtures/evals/rubrics/invalid-budget-nonnumeric.yaml
    - tests/fixtures/evals/rubrics/invalid-budget-nonpositive.yaml
    - tests/fixtures/evals/rubrics/invalid-criterion-verdict.yaml
    - tests/fixtures/evals/rubrics/invalid-element-verdict.yaml
    - tests/fixtures/evals/rubrics/legacy-weight-scale.yaml
    - tests/fixtures/evals/rubrics/malformed.yaml
    - tests/fixtures/evals/rubrics/missing-keys.yaml
    - tests/fixtures/evals/rubrics/nested-map.yaml
    - tests/helpers.mjs
    - tests/lib/evals/rubric-budget-keys.test.mjs
    - tests/lib/evals/rubric-incomplete-entries.test.mjs
    - tests/lib/evals/rubric-legacy-scale.test.mjs
    - tests/lib/evals/rubric-load-success.test.mjs
    - tests/lib/evals/rubric-missing-keys.test.mjs
    - tests/lib/evals/rubric-nested-map.test.mjs
    - tests/lib/evals/rubric-path-containment.test.mjs
    - tests/lib/evals/rubric-schema-contract.test.mjs
    - tests/lib/evals/rubric-verdict-enums.test.mjs
  computed-at: "2026-08-20T02:09:30.855Z"
---

# Live Spec: Unified rubric schema and loader

## Behavioral Contract

`loadRubric(path)` parses and validates a rubric file against the unified rubric schema, returning a Rubric object or throwing a named error. It is the single gate through which every rubric in the repository enters the system — both `/adev:eval`'s Layer 3 rubric and the per-skill rubrics under `tests/evals/` — so a rubric that violates the schema fails loudly at load time rather than degrading silently at score time.

The schema itself is defined by this spec: the required top-level key set, the flat-value constraint, the verdict enumerations, and the budget key form. The loader is the executable expression of that schema; there is no second place where a rubric's validity is decided.

## System Constitution Reference

- **Principle:** "Minimize external dependencies — prefer Node.js built-ins" — Applies directly, and explains the schema's most unusual rule. The flat-value constraint exists *because* the repository's minimal YAML readers cannot parse nested maps, and adopting a real YAML parser would require an ADR. The constraint is a consequence of the principle, not a stylistic preference.
- **Principle:** "Pure ESM — all `.mjs` files, no CommonJS" — The loader ships as `lib/evals/rubric.mjs` with named exports.
- **Anti-pattern:** "No executable logic inside SKILL.md files" — Validation logic lives in `lib/evals/`, reached from skills through a CLI verb. No skill re-implements or duplicates any validation rule defined here.
- **Principle:** "Skills are primarily markdown — companion code is allowed but must not be required for the skill to function" — A rubric that fails to load produces a named error a skill can surface; it never leaves a skill unable to explain what went wrong.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Define the schema key set | Enumerate required and optional top-level keys, verdict enums, and the `budget_max_*` form as a single reference constant | small |
| Flat-value parser | Read a rubric with existing minimal-parser conventions and detect nesting rather than silently flattening it | medium |
| Validation pass | Missing keys, invalid verdicts, incomplete elements and criteria, invalid budgets — each with a distinct named error | medium |
| Path containment | Resolve and containment-check the rubric path before any read | small |
| Legacy-scale detection | Recognise 1-5 `weight` values on `quality_dimensions` and reject with a migration-naming error | small |
| Unit tests | Fixture rubrics exercising every error code plus the success path | medium |

## Visual Expectations

Not applicable. This spec defines a library function with no user interface. Its observable surface is a return value and a set of named errors.

## Acceptance Criteria

- [ ] A conforming rubric loads and exposes every declared element and criterion (BEH-1)
- [ ] A rubric containing a nested map is rejected with `RUBRIC_NESTED_MAP` naming the offending key path (BEH-2)
- [ ] Missing required keys are reported in one error listing all of them, not just the first (BEH-3)
- [ ] Verdict values outside the element and criterion enumerations are rejected with `RUBRIC_INVALID_VERDICT` (BEH-4)
- [ ] Incomplete elements and criteria are rejected with their respective named errors (BEH-5)
- [ ] Non-positive or non-numeric budget values are rejected with `RUBRIC_INVALID_BUDGET` (BEH-6)
- [ ] A rubric path escaping the project root is rejected with `UNSAFE_RUBRIC_PATH` and nothing is read (BEH-7)
- [ ] A legacy 1-5 weighted rubric is rejected with `RUBRIC_LEGACY_SCALE` rather than coerced (BEH-8)
- [ ] Element and criterion ids are asserted unique within a loaded rubric
- [ ] A failed load exposes no partially-populated Rubric to the caller
- [ ] The loader performs no writes and no network access
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations — zero new external dependencies

## Preconditions

- `.context-index/` exists and the project root is resolvable.
- A rubric file path is supplied by the caller. The loader never discovers rubrics on its own.
- No network access and no external system is required. The loader reads one file from the local filesystem.

## Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `loadRubric(path)` is given a rubric declaring every required top-level key with flat values **then** it returns a Rubric object carrying every declared `required_elements` entry and every `quality_dimensions` entry.
- **BEH-2** — **When** the rubric file contains a nested map below any top-level key **then** `loadRubric` throws `RUBRIC_NESTED_MAP` naming the offending key path, and returns no partial structure. Silently loading a nested block as an empty value is the documented failure mode this behavior exists to prevent.
- **BEH-3** — **When** one or more required top-level keys are absent **then** `loadRubric` throws `RUBRIC_MISSING_KEY` whose message lists every missing key, not only the first encountered.
- **BEH-4** — **When** a `required_elements` entry declares a verdict value outside `met | not_met | not_applicable`, or a `quality_dimensions` entry declares one outside `met | not_met | unknown` **then** `loadRubric` throws `RUBRIC_INVALID_VERDICT` naming the entry id and the illegal value.
- **BEH-5** — **When** a `required_elements` entry omits `source` or `met_when` **then** `loadRubric` throws `RUBRIC_INCOMPLETE_ELEMENT` naming the entry id; **when** a `quality_dimensions` entry omits any of `criterion`, `reference`, `met_when`, `not_met_when`, or `unknown_when` **then** it throws `RUBRIC_INCOMPLETE_CRITERION` naming the entry id and the missing field.
- **BEH-6** — **When** the rubric declares a `budget_max_*` key whose value is not a positive number **then** `loadRubric` throws `RUBRIC_INVALID_BUDGET` naming the key.
- **BEH-7** — **When** the resolved rubric path escapes the project root through traversal or a symlink **then** `loadRubric` throws `UNSAFE_RUBRIC_PATH` reporting the offending path verbatim, and reads no file content.
- **BEH-8** — **When** a rubric carries numeric 1-5 `weight` values on its `quality_dimensions` entries **then** `loadRubric` throws `RUBRIC_LEGACY_SCALE` naming the migration to binary verdicts, rather than coercing the scale into verdicts.

## Postconditions

- A successful load returns a Rubric whose `required_elements` ids and `quality_dimensions` ids are each unique within that rubric.
- A failed load exposes no partially-populated Rubric to the caller: validation completes before any object is returned.
- The loader performs no filesystem writes, spawns no process, and opens no network connection.
- The same rubric file loaded twice in one process yields structurally identical Rubric objects; no state is cached between calls.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Nested map below a top-level key | Throw, naming the offending key path; no partial structure returned | `RUBRIC_NESTED_MAP` |
| One or more required top-level keys absent | Throw, listing every missing key | `RUBRIC_MISSING_KEY` |
| Verdict value outside the applicable enumeration | Throw, naming entry id and illegal value | `RUBRIC_INVALID_VERDICT` |
| `required_elements` entry missing `source` or `met_when` | Throw, naming the entry id | `RUBRIC_INCOMPLETE_ELEMENT` |
| `quality_dimensions` entry missing a required field | Throw, naming the entry id and missing field | `RUBRIC_INCOMPLETE_CRITERION` |
| `budget_max_*` value non-positive or non-numeric | Throw, naming the key | `RUBRIC_INVALID_BUDGET` |
| Rubric path escapes the project root | Throw, reporting the path verbatim; read nothing | `UNSAFE_RUBRIC_PATH` |
| Legacy 1-5 `weight` values on quality dimensions | Throw, naming the migration to binary verdicts | `RUBRIC_LEGACY_SCALE` |
| Rubric file does not exist or is unreadable | Throw, naming the resolved path | `RUBRIC_NOT_FOUND` |
| Duplicate element or criterion id within one rubric | Throw, naming the duplicated id | `RUBRIC_DUPLICATE_ID` |
| Rubric file is readable but not parseable as YAML, or parses to something other than a top-level map | Throw, naming the rubric path and the parser's own message | `RUBRIC_PARSE_ERROR` |

> **Known constraint — fractional values are not expressible.** `lib/profiles/yaml.mjs` types bare integers only (`/^-?\d+$/`), so a decimal such as `budget_max_cost_usd: 0.5` or `weight: 1.5` arrives as a *string*, not a number. Two consequences follow and both are pinned by tests rather than worked around: a fractional budget is rejected by `RUBRIC_INVALID_BUDGET` (the error message names this cause), and a fractional legacy `weight` escapes `RUBRIC_LEGACY_SCALE`, whose trigger is a *numeric* weight. The second matters for the skill-compression migration, whose rubrics use `1.5`/`2.5`. Closing both means teaching the YAML reader to type decimals, which has blast radius beyond rubrics and belongs to its own change.
>
> `RUBRIC_PARSE_ERROR` was added during implementation. The loader must wrap the YAML reader's `YamlParseError` so no uncoded parser exception escapes to a caller branching on `.code`, and no other code in this table fits a readable-but-unparseable file (`RUBRIC_NOT_FOUND` covers a missing or unreadable one). It has no BEH id because it states no new behavior — it is the coded surface of a failure the loader always had.
