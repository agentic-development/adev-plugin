---
spec: .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md
plan: .context-index/specs/features/eval-harness/rubric-schema-and-loader.plan.md
date: 2026-08-19
---

# Validation Report: Unified rubric schema and loader

> **Date:** 2026-08-19
> **Spec:** .context-index/specs/features/eval-harness/rubric-schema-and-loader.spec.md (revision 1)
> **Plan:** .context-index/specs/features/eval-harness/rubric-schema-and-loader.plan.md
> **Rigor tier:** `quick` (explicit `--tier quick`)
> **Overall Status:** PASS_WITH_NOTES

Registry loaded from `.context-index/governance/validate.yaml` with no loader warnings.
Domain resolved: `software` (source level: project). Workspace: none detected —
all checks ran in single-repo mode. Spec declares no `infra_requirements`, so
infrastructure preflight was not run.

Heuristics injected for module `eval-harness`: 3 (token-measurement, cache-read
cost, summarized skill output). None bore on the checks below.

---

## Check 1: Quality Gates — PASS_WITH_NOTES

Gate set resolved from the project's materialized `governance/gates.yaml`
(3 gates, no domain overlay merged at run time).

- **Check 1a (fast tier) — PASS**
  - `test` — `npm test` — **PASS** (38.1s)
  - `quality-gate` — `npm test` — **PASS** (identical argv, identical `command_sha`
    `527c484b…`; one execution attests both)
  - Results: tests 7217, suites 989, pass 7215, fail 0, cancelled 0, skipped 0, todo 2.
    The 2 todo are pre-existing and unrelated to this spec.
- **Check 1b (integration tier) — WARN (non-blocking)**
  - `integration-test` — `npm run test:evals` — **FAIL**, exit 1
    (tests 393, pass 381, fail 12).
  - `severity: warning` by declaration (`required: false`), so it does not block.
    `gates.yaml` itself documents this tier as knowingly red (measured 2026-08-14
    at 27 failures; now 12).
  - **All 12 failures are unrelated to this spec.** They fall into three
    pre-existing clusters: Postgres integration-sandbox fixtures (port 5433 not
    running, seed data absent, skip-guard assertions), a context-pack Tier-2
    nonce-fencing suite, and the reality-check Check-12 simulation. None touch
    `lib/evals/rubric*.mjs`, the rubric fixtures, or `tests/lib/evals/`.
- **Check 1c (e2e tier) — SKIP** — no gates configured.

Tier summary: 2 fast gates ran and passed; 1 integration gate ran and failed at
warning severity; 0 e2e gates. Fail-fast did not trigger — validation proceeded.

Per-gate outcomes attested on the `validator_report` (`--manifest-sha 84a465b`):
`test`=pass/fast, `quality-gate`=pass/fast, `integration-test`=fail/integration.

## Check 1.5: Source Manifest Verification — SKIP

Skipped — quick rigor tier. (The spec does carry a `source-manifest` block,
sha `84a465b`, 28 files; it was passed to Check 1's attestation.)

## Check 1.6: Code-Side Drift Warning — SKIP

Skipped — quick rigor tier.

## Check 2 + Check 4 (synthesized compliance) — PASS_WITH_NOTES

Under the `quick` tier these run as one pass. Every verdict below was reached by
reading the named file in this validation run; no citation is inferred from the
spec, plan, or commit messages, and no plan checkbox was treated as evidence.

### Spec compliance — PASS

| Behavior | Verdict | Evidence |
|---|---|---|
| BEH-1 conforming rubric loads with every element and criterion | PASS | `lib/evals/rubric.mjs:827-898` returns the validated document; `tests/lib/evals/rubric-load-success.test.mjs:127-133` asserts exact list lengths and `rubric_id` |
| BEH-2 nested map → `RUBRIC_NESTED_MAP` naming the key path | PASS | `lib/evals/rubric.mjs:226` (`assertNoNestedMaps`), `:150` (`describeKeyPath`); `tests/lib/evals/rubric-nested-map.test.mjs` |
| BEH-3 every missing key in one error | PASS | `lib/evals/rubric.mjs:289` (`assertRequiredKeysPresent`); `tests/lib/evals/rubric-missing-keys.test.mjs:13-22` asserts all three omitted keys appear in one message |
| BEH-4 illegal verdict → `RUBRIC_INVALID_VERDICT` | PASS | `lib/evals/rubric.mjs:477-522`; `tests/lib/evals/rubric-verdict-enums.test.mjs` covers both enums separately |
| BEH-5 incomplete element / criterion | PASS | `lib/evals/rubric.mjs:367-435`; `tests/lib/evals/rubric-incomplete-entries.test.mjs:47-70,108` asserts entry id and missing field name |
| BEH-6 non-positive / non-numeric budget | PASS | `lib/evals/rubric.mjs:537,574`; `tests/lib/evals/rubric-budget-keys.test.mjs` covers both, incl. the string-typed `"0.5"` fractional case |
| BEH-7 path escape → `UNSAFE_RUBRIC_PATH`, nothing read | PASS | `lib/evals/rubric.mjs:830-841` — containment and symlink realpath both resolve *before* the first `existsSync`/`readFileSync`; `tests/lib/evals/rubric-path-containment.test.mjs` covers traversal and symlink escape |
| BEH-8 numeric `weight` → `RUBRIC_LEGACY_SCALE` | PASS | `lib/evals/rubric.mjs:649-682`; `tests/lib/evals/rubric-legacy-scale.test.mjs:102,132-133` asserts the message names the migration and every offender |

Error Cases table — all 11 codes are declared in `lib/evals/rubric-schema.mjs:99-115`
(`RUBRIC_ERROR_CODES`) and pinned by `tests/lib/evals/rubric-schema-contract.test.mjs:26`.
`RUBRIC_PARSE_ERROR` (spec-acknowledged as added during implementation) is raised
at `lib/evals/rubric.mjs:862-880` for both the unparseable and non-map cases.

Postconditions:

- **Id uniqueness** — PASS. `assertIdsUnique` (`lib/evals/rubric.mjs:775`) is
  per-list; `rubric-load-success.test.mjs:169-186` proves the criterion list is
  checked independently and that an element id matching a criterion id is legal.
- **No partial Rubric** — PASS, and **structurally** so, not merely asserted:
  `loadRubric` runs all seven assert passes before the single `return document`
  (`lib/evals/rubric.mjs:882-898`). There is no object to hand back on a throw.
- **No writes / no process / no network** — PASS. Imports are `node:fs`
  (`existsSync`, `readFileSync` only) and `node:path` (`resolve`) plus three
  internal libs (`lib/evals/rubric.mjs:81-95`). Pinned two ways:
  `rubric-load-success.test.mjs:196-207` snapshots the project tree before and
  after a load, and `:210-224` statically rejects `node:http|https|net|dgram|child_process`.
- **Idempotence / no cache** — PASS. `rubric-load-success.test.mjs:150-155`
  asserts `deepEqual` **and** `notEqual`; `:186-195` proves mutating a returned
  rubric cannot affect a later load.

### SCOPE_EXPANSION sub-finding — JUSTIFIED (2 findings, both non-blocking)

The plan declared `Modify: None`. Two files outside that declaration changed.

1. **`skills/eval/default-rubric.yaml` — 5 `weight: 1` lines deleted.**
   Necessary: BEH-8 as implemented triggers on the *presence* of any numeric
   weight, and the spec's acceptance criteria require the shipped default rubric
   to load. Minimal: deletion only, no other line touched (verified against
   `git diff 0b8ab880^..ac76d640 -- skills/eval/default-rubric.yaml`).
   Not a behaviour change — see Scrutiny item 1 below.
2. **`tests/helpers.mjs` — exported `captureThrow` added.**
   Test-infrastructure only; no production surface. See Scrutiny item 2.

Neither expansion touched a shipped code path, a hook contract, a plugin
manifest, or a dependency. Both are recorded here rather than treated as
silent drift.

### TEST_INTEGRITY — no anti-patterns found

Nine suites read in full or in the assertion-bearing regions. Findings:

- Every error path asserts the **exact** code via `assert.equal(err.code, "…")`
  — never "something threw".
- No conditional skips, no `try`/`catch` around assertions, no `if (visible)` guards.
- No assertions on runtime/dynamic data: every case writes a deterministic
  fixture (on disk under `tests/fixtures/evals/rubrics/`, or inline into a temp
  dir) and asserts against it.
- Two `assert.ok(… .length > 0)` assertions exist
  (`rubric-load-success.test.mjs:138-139`, `rubric-legacy-scale.test.mjs:194`),
  which are weak in isolation — but in both the load-implies-no-throw *is* the
  assertion, and the accompanying `every((d) => d.weight === undefined)` is
  strict. Not a weakened test.
- `rubric-legacy-scale.test.mjs:198-211` is notably honest: it pins that the real
  `tests/evals/skill-compression/rubrics/plan.yaml` is refused with
  `RUBRIC_NESTED_MAP` — the code the rubric *actually* produces — rather than the
  `RUBRIC_LEGACY_SCALE` its weights would suggest.
- No evidence of tests loosened to pass: `git log` shows each behavior's test and
  implementation landing in the same commit with a `Review-round:` trailer.
- Several tests explicitly strengthen a weaker fixture-driven sibling (see the
  comments at `rubric-load-success.test.mjs:167`,
  `rubric-verdict-enums.test.mjs:111-112`, `rubric-nested-map.test.mjs:47-48`),
  and error *payload* fields are pinned as well as codes — e.g.
  `rubric-budget-keys.test.mjs:104-114` deep-equals `err.invalidBudgetKeys`, and
  `rubric-legacy-scale.test.mjs:123-134` deep-equals `err.entryIds` and
  `err.legacyWeights`.

Three cosmetic nits, none weakening a criterion:

- `rubric-load-success.test.mjs:160-163` validates only
  `typeof e.code === "string"` — deliberately generic, with every specific code
  pinned in its own suite.
- `rubric-legacy-scale.test.mjs:105-109` is a bare `assert.throws` with no
  validator, fully redundant with `:97-103` which pins the code.
- `rubric-schema-contract.test.mjs:31` reads
  `skills/eval/default-rubric.yaml` **cwd-relative**, while every other suite
  routes through `PLUGIN_ROOT`. It will break if the test runner's cwd ever
  moves. Worth tidying opportunistically.

### Constitution compliance — PASS

- **Architecture boundaries — PASS.** `git diff 0b8ab880^..ac76d640` shows **no**
  change to `package.json`, `package-lock.json`, `.claude-plugin/plugin.json`, or
  `.cursor-plugin/plugin.json`. No new skill, no hook-protocol change, no CLI
  install-path change, no version bump.
- **Non-negotiable principles — PASS.**
  - Zero new external dependencies — `lib/evals/rubric.mjs:81-95` imports only
    `node:fs`, `node:path`, and three in-repo modules; `rubric-schema.mjs` imports
    nothing at all.
  - Pure ESM — both new modules are `.mjs` with named exports; no `require`,
    no `module.exports`.
  - No executable logic in SKILL.md — `skills/eval/SKILL.md` is unmodified.
  - Skills-are-markdown — the loader raises named, coded errors a skill can
    surface verbatim.
- **Coding standards — PASS.** camelCase functions (`loadRubric`,
  `assertNoNestedMaps`, `isPositiveFiniteNumber`), kebab-case filenames
  (`rubric-schema.mjs`), Node built-ins imported before relative imports,
  errors carried as `codedError(...)` with a `.code` field per the repo idiom.
- **Commit trailers — PASS.** All 11 commits `0b8ab880..ac76d640` carry a `Spec:`
  trailer pointing at this spec; 9 of 11 also carry `Plan-task:` (tasks 1–9) and
  a `Review-round:` trailer. The two without `Plan-task:` are the docs/stamping
  and lifecycle-log chores, which implement no plan task.

## Check 8: Boundary Compliance — SKIP

Skipped — quick rigor tier.

## Check 9: Transition Gates — SKIP

Skipped — quick rigor tier.

## Check 11: Visual Verification — SKIP

Trigger guard, Case A: the implementation diff contains **no** UI files
(`git diff --name-only 0b8ab880^..ac76d640` matches none of `*.tsx|*.jsx|*.vue|*.svelte|*.css|*.scss|*.html`,
`components/`, `pages/`, `views/`, `public/`, `app/**/page.*`, `app/**/layout.*`),
and the Playwright MCP server is not available. "No UI files in implementation
diff — visual verification not applicable."

## Check 14: Gate Executability — SKIP

Skipped — quick rigor tier.

---

## Scrutiny items carried forward from the implement step

### 1. `weight: 1` deletion from `skills/eval/default-rubric.yaml` — **JUSTIFIED**

- **Grep claim verified.** A repo-wide search for `weight` across `lib/`, `cli/`,
  `skills/`, `hooks/`, `scripts/`, and `tests/` finds **no reader** of a rubric
  entry's `weight` key. The only `lib/` hits are inside `lib/evals/rubric.mjs`
  itself (the legacy-scale *rejector*, lines 604-682). Everything else is either
  an unrelated word ("lighter-weight", "dead weight"), a different domain
  (`skills/assess/SKILL.md`'s own scoring weights), or a *data* declaration in a
  `tests/evals/**/rubrics/*.yaml` file that no code reads through this loader.
- **No consumer wiring exists yet.** `loadRubric` is imported only by the nine
  new test suites — no production call site (`grep -rn "evals/rubric"` outside
  `tests/lib/evals/` returns nothing). The deleted lines therefore could not have
  been read by anything even in principle.
- **Layer 3 behaviour unchanged.** `skills/eval/SKILL.md` contains **zero**
  occurrences of `weight`. `default-rubric.yaml`'s own aggregation block
  (lines 124-137) scores with `layer3_max_points: 25`, `required_element_points: 10`,
  `judged_criterion_points: 15`, `unknown_policy`, `not_applicable_policy`, and
  `insufficient_evidence_threshold_percent` — flat *top-level* points, never a
  per-entry weight. The file's header explicitly calls its `quality_dimensions`
  binary (met/not_met/unknown) and a deliberate deviation from the weighted
  skill-compression pattern, which is exactly what makes a uniform `weight: 1`
  on every entry left-over scaffolding.
- **Verdict: JUSTIFIED.** The deletion is dead-data removal, is pinned by a
  regression test (`rubric-legacy-scale.test.mjs:186-196`), and changes no
  `/adev:eval` Layer 3 behaviour.

### 2. `captureThrow` in `tests/helpers.mjs` — **PRESERVES STRICTNESS**

```js
export function captureThrow(fn) {
  let thrown;
  assert.throws(fn, (err) => { thrown = err; return true; });
  return thrown;
}
```

- The premise is correct: `assert.throws()` is a void assertion and returns
  `undefined`, so the plan's prescribed `const err = assert.throws(...)` idiom
  would have silently bound `undefined` and made every subsequent `err.code`
  assertion throw a `TypeError` instead of failing meaningfully.
- **Strictness is preserved.** The wrapper does not catch anything itself. If
  `fn` throws nothing, `assert.throws` fails with `ERR_ASSERTION` ("Missing
  expected exception") and the test fails — the validator callback is never
  invoked and `captureThrow` never returns. There is no path by which a
  non-throwing function passes.
- The validator returning `true` unconditionally means the wrapper asserts only
  "threw *something*". That is by design: every call site immediately asserts
  `err.code` exactly, which is the strict half of the contract.
- **Minor, non-blocking:** `tests/lib/partial-artifact.test.mjs:411-418` defines
  its own local `captureThrow` that was not deduplicated against the new shared
  export. It is a different implementation — `try`/`catch` plus an explicit
  `throw new Error("expected fn to throw, but it did not")` — but
  strictness-equivalent, so this is unaddressed duplication rather than a defect.
  That file is outside this spec's source-manifest and outside the plan's scope;
  consolidating it here would have been the larger, less justified scope
  expansion. Worth a follow-up, not a validation finding.
- **Verdict: PRESERVES STRICTNESS.**

### 3a. `VERDICT_FIELD` / `WEIGHT_FIELD` name-contract keys — **REAL BUT NON-BLOCKING**

`lib/evals/rubric.mjs` declares three module-local name constants the schema
module never exports: `VERDICT_FIELD = "verdict"` (line 453),
`WEIGHT_FIELD = "weight"` (line 612), and `ID_FIELD = "id"` (line 691).

- The split is real, and both names are genuine contract vocabulary.
  `rubric-schema.mjs`'s own docstring (lines 6-12) claims to be "the single place
  a reviewer reads to learn the rubric contract" and that `rubric.mjs` "must
  never restate the contract, only consume it". Yet `verdict` is the key the two
  exported enums exist *for* — publishing `ELEMENT_VERDICTS` without naming the
  key those verdicts attach to is incomplete — and `weight` is the key whose mere
  presence raises `RUBRIC_LEGACY_SCALE`, a rule a rubric author must know. A
  reviewer reading only the schema module cannot learn that `verdict:` is a legal
  optional entry key, nor that `weight:` is forbidden.
- `ID_FIELD` is **exempt**: `"id"` already appears inside both exported field
  lists, so the constant is derived from the published contract rather than
  restating it.
- It is **not** a spec violation: no acceptance criterion, behavior, or error
  case governs where constants live, and the constitution states no rule about
  it. Every behavior the constants drive is correct and tested.
- **Classification: NON-BLOCKING.** A design-consistency defect against the
  module's own stated purpose, not a gate on this spec. Follow-up: lift
  `VERDICT_FIELD` and `WEIGHT_FIELD` into `rubric-schema.mjs`.

### 3b. `required_elements: "oops"` loads — **CONFIRMED, NON-BLOCKING**

Empirically reproduced in this validation run: a rubric declaring all twelve
required top-level keys, with `required_elements` set to the scalar string
`"oops"`, loads successfully and returns `required_elements: "oops"`.

- This is **deliberate and documented**, not an oversight.
  `lib/evals/rubric.mjs:336-358` explains the choice at length: a non-map *entry*
  inside a real list is reported as incomplete, but a non-list *value* for the
  list key is skipped without a property read, because the earlier passes check
  **absence**, not value shape. The same `if (!Array.isArray(entries)) return;`
  early-return appears consistently at `:378`, `:479`, `:651` and `:724` — this
  is a systematic decision, not one pass forgetting. It is positively pinned as
  intended by `rubric-missing-keys.test.mjs:24-47` (all twelve keys as scalar
  placeholders, loadable) and `rubric-incomplete-entries.test.mjs:84-101`.
- **Not a violation of any acceptance criterion.** No BEH and no Error Cases row
  covers list-shape validation; BEH-3 is explicitly about key absence.
- **However**, it does weaken the spec's Behavioral Contract claim that the
  loader is "the single gate … so a rubric that violates the schema fails loudly
  at load time rather than degrading silently at score time." A scalar
  `required_elements` is exactly the silent-degradation case that claim rules
  out: `skills/eval/SKILL.md:124` instructs the agent to "work through the
  rubric's `required_elements`", so the fault would surface at Layer 3 score
  time rather than at load time. The spec under-specifies here; the
  implementation does not under-deliver against it.
- **Classification: NON-BLOCKING** for this spec. Recommended follow-up: either a
  `RUBRIC_INVALID_SHAPE` code (spec revision required) or an explicit note in the
  spec's Known-constraint block recording that list-shape is out of the loader's
  remit.

---

**Summary:** 3 checks passed (Check 1 with notes, synthesized Check 2 + Check 4),
0 failed, 5 skipped (1.5, 1.6, 8, 9, 14 — quick rigor tier) and 1 not applicable
(Check 11 — no UI files).

**Overall Status: PASS_WITH_NOTES.** No blocking finding. Advisory items carrying
forward, none a gate on this spec:

1. The integration gate tier is knowingly red — 12 pre-existing failures, all
   unrelated to this spec (`gates.yaml` already documents the tier as such).
2. The `VERDICT_FIELD` / `WEIGHT_FIELD` contract split against
   `rubric-schema.mjs`'s stated single-source role — lift both into the schema
   module.
3. Scalar-valued list keys (`required_elements: "oops"`) load without complaint.
   The right fix is a spec revision adding a shape criterion and a
   `RUBRIC_INVALID_SHAPE` code — **not** a silent loosening of the loader.
4. Three cosmetic test nits (redundant bare `assert.throws`, generic
   `typeof e.code` check, cwd-relative fixture read at
   `rubric-schema-contract.test.mjs:31`) and one un-deduplicated local
   `captureThrow` in `tests/lib/partial-artifact.test.mjs`.

**Method note.** The synthesized Check 2 + Check 4 was dispatched as a subagent,
which the harness backgrounded contrary to this skill's `run_in_background: false`
requirement and which then stalled on an un-answerable permission prompt. The
orchestrator performed the check directly to avoid blocking the pipeline; the
subagent later recovered and returned independently, reaching the same
`PASS_WITH_NOTES` verdict and the same classification on all three scrutiny
items. Both passes are reflected above. Every citation in this report comes from
a file read during validation.

---

> **Note for users comparing with historic reports:** Checks 3, 5, 6, 7, 10, 11
> (when no UI files), 12, and 13 have been relocated by
> `check-set-restructure.spec.md`. See:
>
> - `/adev:review-specs` — for ADR compliance (formerly Check 5), cross-cutting
>   compliance (formerly Check 6), specialist review (formerly Check 7), and
>   charter consistency (formerly Check 3, now covered by Check 2's
>   scope-expansion sub-finding).
> - `/adev:hygiene` Audit Pass 20 — for platform drift (formerly Check 10).
> - `/adev:reconcile` lifecycle-sync — for lifecycle reconciliation (formerly
>   Check 12, with `--fix` as the default mode).
> - `hooks/post-validate-extract-heuristics.{sh,mjs}` — for heuristic extraction
>   (formerly Check 13), now a non-blocking Stop-event hook.
>
> Historic `.validate.md` reports continue to use the pre-restructure numbering;
> the gaps in the surviving inventory are intentional to preserve readability.
