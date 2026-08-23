# Implementation Plan: Rubric Set — Core Lifecycle Tier

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md (revision 13)
> **Sibling tier this one consumes:** .context-index/specs/features/eval-harness/rubric-set-change-imminent.plan.md (9 tasks) — the shared rubric contract, `tiers.yaml`, and eleven `RUBRIC_*` conformance rules land there
> **Sibling plan (executed, proven shape):** .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.plan.md
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, `node:test`

**Goal:** Ship twelve rubrics and twelve scenarios for the highest-blast-radius skills in the repository, three conformance rules that make this tier's tightened promises decidable, and the retirement of the legacy skill-compression harness — so that a regression in `implement`, `validate` or `build` is caught by the PR that causes it rather than by whoever reads the wreckage a nightly later.

**Architecture:** Content on top of machinery that already exists, plus one destructive migration. The loader (`lib/evals/rubric.mjs::loadRubric`), the scoring engine, `adev eval score`, the hermetic fixture (`tests/evals/skill-regression/`) and — from the change-imminent tier — `tests/evals/skill-regression/tiers.yaml`, `tests/lib/evals/rubric-coverage.test.mjs` and its eleven rules all ship before this plan starts. What lands here is twenty-four authored data files, three additional rules inside that same existing test file, two small interlock edits to already-landed artifacts, and the removal of `tests/evals/skill-compression/`. **No new module, no new CLI verb, no new test file, no new dependency.**

**What this tier consumes rather than redefines.** The `rubric_id` naming rule, the point budgets, the flat-YAML discipline, the three `source` forms, the `artifact:`/`scenario` containment rules, `tiers.yaml`'s five-key shape, the twenty-token scenario table checked by `RUBRIC_SCENARIO_STEP_MISSING`, the Tier B record convention (`-01` upward, `{flag: 'wx'}`, glob in name order), `RUBRIC_EXCEPTION_ID_MALFORMED` over **both** issue-id keys, and `RUBRIC_TIER_UNCOVERED`'s bucket-agnostic scoping — every one of these is declared and proven in the change-imminent tier. This plan cites them and never restates them. Two values are overridden and only two: the deterministic floor rises from 5 to **7** (`RUBRIC_CORE_ELEMENT_FLOOR`), and the judged range stays 3–6 unchanged.

**The two halves rule** carries over unchanged: every runtime obligation is split into a **scenario file half** checked by `RUBRIC_SCENARIO_STEP_MISSING` and an **operator half** performed in the manual Tier B pass (Task 8). This tier authors twelve more scenario files against a token table it does not own, and owes **no rejecting inputs for those rows** — the sibling owns the table and lands every one, including the `ADEV_NO_INFRA` row scoped by slug to this tier's `build` and `work` scenarios. This tier's obligation is that its twelve files carry the literals.

**Review notes carried into this plan:** the spec reached `review-passed` at revision 13 and `rubric-set-core-lifecycle.review.md` records no unresolved blocker. Four items below were the plan author's own judgement rather than the spec's text, and all four have since been **reviewed and adjudicated sound** — each is now recorded at its own site with a "do not relitigate" note: the `landed:` amendment's placement in the twelfth-rubric commit (Task 7), the decision to prove the `covers_skills` interlock against the **real** catalog before any core rubric exists (Task 2), the two-commit split of "re-authored and deleted in the same change" into a non-destructive prep commit and one atomic retirement commit (Tasks 5 and 6, together with the `-C migrationRoot` anchor and the `rmSync` containment), and the finding that the sibling plan's six-file answer-key redaction list is **incomplete for this tier** (Task 3). The same review **overruled** one item: the pass-ordering coverage loss in Task 5 is no longer merely flagged — the composite fixture lands.

**One coupling to the sibling plan is load-bearing and easy to miss:** `test('the landed tier is complete at the real roots')` lives in the shared `tests/lib/evals/rubric-coverage.test.mjs`, is **owned by `rubric-set-change-imminent.plan.md`**, and pins literal file counts at the real rubric and scenario roots that this tier grows four times. This plan amends it in each of Tasks 3, 4, 6 and 7, in the same commit as the rubrics that move the count. See the cross-plan amendment schedule at the end of Task Summary.

---

## File Structure

**Create — rubrics (12 files under `tests/evals/skill-regression/rubrics/`):**

- Detectors (5): `hygiene.yaml`, `validate.yaml`, `review-specs.yaml`, `debug.yaml`, `route.yaml`
- Producers (5): `specify.yaml`, `plan.yaml`, `write-test.yaml`, `brainstorm.yaml`, `implement.yaml`
- Orchestrators (2): `build.yaml`, `work.yaml`

**Create — scenarios (12 files under `tests/evals/skill-regression/scenarios/`):**

- One per rubric, same stem: `hygiene.md`, `validate.md`, `review-specs.md`, `debug.md`, `route.md`, `specify.md`, `plan.md`, `write-test.md`, `brainstorm.md`, `implement.md`, `build.md`, `work.md`

**Create — one test fixture (Task 5):**

- `tests/fixtures/evals/rubrics/legacy-composite-shape.yaml` — nested `scoring:` + weighted `quality_dimensions` + the ten missing `REQUIRED_TOP_LEVEL_KEYS`. It preserves the pass-ordering claim that Task 6 would otherwise make permanently unfalsifiable. Deliberately **outside both** of `RUBRIC_LEGACY_SURVIVES`'s enumerated roots, so it cannot trip that rule; see the adjudication block in Task 5

**Create — Tier B pass record:**

- `.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md` — written under the convention the change-imminent tier defines. This tier writes one per pass; it defines nothing

**Relocate (`git mv`, two files into one new subdirectory):**

- `tests/evals/skill-compression/token-budget-eval/token-budget-eval.test.mjs` → `tests/evals/token-optimization/token-budget-eval/token-budget-eval.test.mjs`
- `tests/evals/skill-compression/token-budget-eval/real-token-analysis.test.mjs` → `tests/evals/token-optimization/token-budget-eval/real-token-analysis.test.mjs`

`tests/evals/token-optimization/` **already exists** — it carries `run-ab-eval.mjs` and `results/` — so the relocation adds one subdirectory inside a live harness rather than creating a new tree. Neither relocated suite references a rubric, a variant, a scenario or `run-eval.mjs`; `git grep` confirms their only `skill-compression` mentions are their own usage docblocks at `:9` and `:13`.

**Delete — six literal repo-relative subpaths, and only these six:**

| # | Path | Tracked | Files |
|---|---|---|---|
| 1 | `tests/evals/skill-compression/rubrics/` | yes | 3 — `brainstorm.yaml`, `plan.yaml`, `specify.yaml` |
| 2 | `tests/evals/skill-compression/scenarios/` | yes | 3 — `brainstorm-scenario.md`, `plan-scenario.md`, `specify-scenario.md` |
| 3 | `tests/evals/skill-compression/variants/` | yes | 12 — 4 variants × 3 skills |
| 4 | `tests/evals/skill-compression/run-eval.mjs` | yes | 1 |
| 5 | `tests/evals/skill-compression/matrix-integrity.test.mjs` | yes | 1 |
| 6 | `tests/evals/skill-compression/outputs/` | **no — untracked and ignored** | 0 on a clean checkout, N on a machine that ran `eval:skill-compression` |

`git ls-files tests/evals/skill-compression` returns **22** paths today: the twenty above plus the two relocated suites. Twenty after Task 5's relocation, **zero** after Task 6's deletion. **The command is not `git rm -r tests/evals/skill-compression`** — `token-budget-eval/` is a child of that path, and a whole-tree removal takes ~54KB of live coverage with it (54,870 bytes across the two suites — the spec's figure at `:148` and `:361`; an earlier `~56KB` here was `du`'s block-rounded number and is reconciled to the spec's byte count), including the progressive-disclosure assertions the charter's own dependency row names.

**Modify:**

- `tests/lib/evals/rubric-coverage.test.mjs` — the three additional rules and their rejecting inputs (Tasks 1, 2, 3, 4, 6, 7). Created by the change-imminent tier; extended, never replaced. **Also carries the sibling-owned `test('the landed tier is complete at the real roots')`, whose file counts this tier amends in Tasks 3, 4, 6 and 7** (11 → 16 → 18 → 21 → 23) — amended in place, never duplicated
- `tests/evals/skill-regression/catalog.yaml` — adds `hygiene` to `orphan-source-file`'s `covers_skills`, by **minimal in-place text splice**, never a load-mutate-reserialize round trip (Task 2)
- `tests/lib/evals/skill-regression-catalog.test.mjs` — the pin at `:317-333` that currently asserts that field is *exactly* `codehealth, repomap` and that `hygiene` is absent (Task 2)
- `tests/evals/skill-regression/tiers.yaml` — `landed:` from `"change_imminent"` to `"change_imminent,core_lifecycle"` (Task 7)
- `tests/lib/evals/rubric-legacy-scale.test.mjs` — retargeted at `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`; the `:198` test name and `:199` comment rewritten, the `:190` comment de-referenced (Task 5)
- `tests/evals/token-optimization/token-budget-eval/{token-budget-eval,real-token-analysis}.test.mjs` — usage docblocks at `:9` and `:13` (Task 5)
- `scripts/run-tests.mjs` — the `:92` docblock's "evals/skill-compression token-budget" clause follows the relocation (Task 5)
- `package.json` — removes the `eval:skill-compression` script (Task 6)
- `.gitignore` — deletes the `:45` outputs rule; **edits** the `:43` comment to drop its `/ eval:skill-compression` clause rather than deleting the line, which heads two rules and would orphan `tests/evals/repomap/*/` at `:44` (Task 6)
- `lib/evals/rubric.mjs` — the `:33` module docblock names the skill-compression rubric *shape*; a bare-token grep hit, not a path (Task 6)
- `skills/eval/default-rubric.yaml` — the `:9,:16` header comment cites the retired rubrics as the house pattern (Task 6)
- `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml` — the `:2` comment cites the retired rubrics (Task 6)
- Up to eight fixture files under `tests/evals/skill-regression/project/`, **comment-only**, if answer-key redaction falls to this tier (Task 3, gated on `issue-dzxjoa`)

**Reference (read, do not modify):**

- `.context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md` — the shared contract, the token table, the eleven rules, the Tier B record convention
- `.context-index/specs/features/eval-harness/rubric-set-change-imminent.plan.md` — what already exists and what shape it is in
- `lib/evals/rubric.mjs`, `lib/evals/rubric-schema.mjs`, `lib/evals/score.mjs`, `lib/evals/score-schema.mjs`
- `skills/eval/default-rubric.yaml` — the field-shape exemplar
- `tests/evals/skill-regression/catalog.yaml` — ten PV/KC pairs and 23 scaffolding entries. This tier cites `PV-01/KC-01`, `PV-02/KC-02`, `PV-03/KC-03`, `PV-06/KC-06`, `PV-07/KC-07`, `PV-09/KC-09`, `PV-10/KC-10`
- `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the properties this tier must not loosen
- `tests/helpers.mjs:43,58,108` — `createTempDir`, `cleanupTempDir`, `createTempGitRepo`
- `lib/path-safety.mjs` — `isContained`, `lenientRealpath`, `resolveContained`
- `lib/extensions/exec-payload.mjs:158,262-263,424-436` — the plan-validated delete target and `assertContained` model the migration's `rmSync` mirrors, and the two places it deliberately diverges
- `lib/extensions/governance-splice.mjs` — why the catalog edit is a text splice and not a reserialization
- `lib/worktree.mjs::resolveMainRoot` — the **capture** anchor; deliberately **not** the migration anchor
- `lib/domains/merge-gates.mjs` — `INVALID_GATE` warns and drops rather than throwing, which is why the `validate` scenario scores over an empty gate set
- `scripts/run-tests.mjs` — `--list`, `--evals`, `isNestedProjectFile`
- `skills/<slug>/SKILL.md` × 12, and each skill's governing spec where one exists — **Difference 1's anchor**

---

## Context Packets

### Tasks 1–2 Context (the three rules and the catalog interlock)
- Spec: "Additional Conformance Rules" in full, including both of `RUBRIC_LEGACY_SURVIVES`'s scoping arguments; "Citing a catalog id outside its declared `covers_skills`"
- Sibling spec: "Conformance Rules" and the `tiers.yaml` block in `rubric-set-change-imminent.spec.md` — the eleven rules this tier extends and must not duplicate
- Source: `lib/evals/rubric.mjs` (full — in particular that `RUBRIC_PARSE_ERROR` terminates before any marker is inspected), `lib/profiles/yaml.mjs` (flat only, comments discarded, bare integers typed while the legacy `1.5` arrives as a string)
- Fixture: `tests/evals/skill-regression/catalog.yaml`, and `tests/lib/evals/skill-regression-catalog.test.mjs:317-333` — the pin this tier flips
- Sample: `tests/lib/evals/skill-regression-catalog.test.mjs` — the house pattern for a rejecting-input test and for `checked`-counter reachability
- Constraint: **no new library module and no new test file.** The three rules extend `tests/lib/evals/rubric-coverage.test.mjs` and their codes join that file's existing frozen registry
- Heuristic: "A universal coverage claim must ship with the predicate that checks it"

### Tasks 3–4, 6–7 Context (rubric and scenario authoring)
- Spec: "The Twelve Rubrics" (the row table), "The two orchestrators score routing, not artifacts", "This is the first tier to score mutating skills", "Difference 1", the Reference-anchoring block
- Sibling spec: the shared contract table and the twenty-token scenario table — read in full; these twelve scenarios must carry the same literals
- Exemplar: `skills/eval/default-rubric.yaml` — field shapes verbatim
- Skills under test: `skills/<slug>/SKILL.md` **and the governing spec where one exists**. Unlike the sibling tier, a disagreement between the two resolves in favour of the **spec**, is filed as an issue, and is pinned in `spec_behaviour_gap_issue`
- Fixture: the `project/` tree; every `artifact:` path must exist there and resolve under the copy root
- Constraint: flat values only; `assertNoNestedMaps` rejects a nested map at load with `RUBRIC_NESTED_MAP`

### Task 5 Context (migration prep)
- Spec: "The third consumer, and why it was missed"; the Required Files rows for `scripts/run-tests.mjs` and the two relocated suites
- Source: `tests/lib/evals/rubric-legacy-scale.test.mjs:185-215`, `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`, `tests/evals/skill-compression/rubrics/plan.yaml` (read for its composite shape **before** Task 6 deletes it — the new fixture reproduces it), `scripts/run-tests.mjs:85-100`, `tests/test-discovery.test.mjs`
- Constraint: **non-destructive.** This task deletes nothing; `npm test` and `npm run test:evals` are both green at its commit
- Constraint: the new fixture lives under `tests/fixtures/evals/rubrics/` and **must not** be placed under either `RUBRIC_LEGACY_SURVIVES` root

### Task 6 Context (the retirement)
- Spec: "The compression harness is retired, not repointed" in full — the argv discipline, the `migrationRoot` derivation, the containment assert on the one untracked target, and both stated divergences from `applyExecPayload`
- Source: `lib/extensions/exec-payload.mjs:158,262-263,424-436`, `lib/path-safety.mjs`
- Enumeration: `git ls-files tests/evals/skill-compression` — the authoritative list, read at execution time rather than trusted from this plan
- Constraint: every `git mv`, `git rm` and the `git rev-parse --show-toplevel` that derives `migrationRoot` is an `execFileSync` argv array with `shell: false` and `-C migrationRoot`

### Task 8 Context (the Tier B pass)
- Spec: the Gates block in full, including the halt contract stated once and referenced by the criteria beneath it
- Sibling plan: Task 9 — the eight operator obligations and the record convention this pass inherits verbatim
- Constraint: the record is written strictly **after** the post-run capture comparison, then committed

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When a task claims "every rubric satisfies X" or "nothing legacy survives", name the executable check, the roots it runs over, and assert the iterated set is non-empty before asserting anything about its contents.
- **Anti-pattern:** Widening to "no occurrence anywhere". `RUBRIC_LEGACY_SURVIVES` is the live case: a repo-wide shape scan is unbounded, would go red on landing against 21 legacy-shaped rubrics in five other harnesses, and would conscript another charter's files into this migration. Two enumerated roots, both named, both scanned.
- **Applies to:** Tasks 1, 6 and 7 above all. `RUBRIC_CORE_ELEMENT_FLOOR` iterates the `core_lifecycle` bucket and asserts it selected twelve files; `RUBRIC_LEGACY_SURVIVES` names exactly two roots and asserts the scan visited a non-zero file count in whichever root exists; the migration's completeness is `git ls-files` returning zero, not "we think it is gone".

### Watch a new test fail before trusting it (confidence: high)
- **Pattern:** A passing guard is not evidence. Reintroduce the defect, confirm the named assertion goes red, and confirm the probe actually applied.
- **Anti-pattern:** "Verify test passes" as the terminal step. This plan's two most consequential assertions — the `covers_skills` interlock and the legacy-survival scan — are written at the same commit as the data they check, which is exactly the condition under which a check that matches nothing still passes.
- **Applies to:** every task. Each carries an explicit perturbation table naming which assertion must go red.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4
  All four extend `tests/lib/evals/rubric-coverage.test.mjs`, and Task 2's catalog edit must land before Task 3's `hygiene` rubric can cite `orphan-source-file` without firing a rule. Running any two concurrently is a merge conflict, not a speedup.
- Group B (independent): Task 5
  Migration prep shares no file with Group A — it touches `rubric-legacy-scale.test.mjs`, `scripts/run-tests.mjs` and the two relocated suites, none of which any rubric task reads or writes. It may run concurrently with Group A and must complete before Group C.
- Group C (sequential): Task 6 → Task 7 → Task 8
  Task 6 needs Task 5's relocation landed and Task 4's producer set authored; Task 7 lands the last two rubrics and flips `landed:`; Task 8 is the manual pass over the completed twelve and cannot start before it.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | The three additional conformance rules + rejecting inputs | medium | unit | — (change-imminent tier landed) | 0 create, 1 modify |
| 2 | The `covers_skills` interlock — catalog, pin, red-then-green | small | unit | Task 1 | 0 create, 3 modify |
| 3 | Detector rubrics + scenarios (5 skills) | large | unit | Task 2 | 10 create, 1 modify (+ up to 8 comment-only fixture edits) |
| 4 | Producer rubrics + scenarios — `write-test`, `implement` | medium | unit | Task 3 | 4 create, 1 modify |
| 5 | Migration prep — retarget, the composite fixture, relocate, three docblocks | medium | unit | — | 1 create, 4 modify, 2 relocate |
| 6 | Re-author `specify`/`plan`/`brainstorm` **and** retire the tree | large | unit | Tasks 4, 5 | 6 create, 6 modify, 20 tracked deletes + 1 untracked tree |
| 7 | Orchestrators `build`/`work`, the `landed:` amendment, real-root flip | large | unit | Task 6 | 4 create, 2 modify |
| 8 | The manual Tier B pass over the twelve | medium | manual | Task 7 | 1 create, 0 modify |

All eight tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `tests/**` paths), except Task 8, which runs no automated test and is marked `manual` for that reason. Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:`, so the Test Infrastructure Requirements section is omitted as well.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). One suite, `tests/lib/evals/rubric-coverage.test.mjs`, already created by the sibling tier; the per-behaviour unit is the conformance rule, and each of the three new rules is its own `test()`.

**On task sizing, and the production-file count.** Tasks 3 and 6 create ten and six files. **Every created file is committed test data under `tests/evals/skill-regression/`**, which the plan reviewer's five-file guidance excludes — that rule exists because a subagent editing many *production* files loses context and half-implements. The **non-test production files across this entire plan number five**, and every one is a comment or a config line with no logic:

| File | Change | Task |
|---|---|---|
| `scripts/run-tests.mjs` | one docblock clause at `:92` | 5 |
| `package.json` | delete the `eval:skill-compression` script line | 6 |
| `.gitignore` | delete `:45`, edit the `:43` comment | 6 |
| `lib/evals/rubric.mjs` | one docblock clause at `:33` | 6 |
| `skills/eval/default-rubric.yaml` | header comment at `:9,:16` | 6 |

Nothing else outside `tests/` and `.context-index/` is created or modified. **No `.mjs` file gains or loses a line of executable logic anywhere in this plan.**

**How the spec's six task-map rows became eight tasks.**

- The spec's "Three additional conformance rules" (small) is **Task 1**, unchanged in scope but not in weight: three rules with a rejecting input each, plus `RUBRIC_LEGACY_SURVIVES`'s parse-tolerant scan, its symlink-reports-rather-than-skips posture, its ENOENT-on-a-clean-checkout case and its must-not-fire proof over 21 out-of-charter rubrics, is a medium task, not a small one.
- The spec's "`covers_skills` extension" (small) is **Task 2** and stays its own task on purpose. It is the only change in this plan that edits an already-landed guard's pin, and the spec's criterion is that the rule "fires … until the fixture catalog is extended, and passes after — proven in both directions". A red-then-green proof folded into a ten-file rubric task is a proof nobody sees.
- The spec's "Detector rubrics + scenarios (5)" is **Task 3**, unsplit. Its five rubrics share one mechanism — they cite catalog ids and need both twins — and one hazard, the answer-key labels; splitting them would split the falsification table that decides `issue-dzxjoa`.
- The spec's "Producer rubrics + scenarios (5)" becomes **Tasks 4 and 6**, split on whether the skill has a legacy predecessor. `write-test` and `implement` are new rubrics with nothing to retire; `specify`, `plan` and `brainstorm` are the three the spec re-authors *and deletes the legacy file for in the same change*. Putting those three in the retirement task is what makes "the legacy file is deleted in the same change rather than left beside its replacement" literally true rather than approximately true.
- The spec's "Legacy migration" (large) becomes **Tasks 5 and 6**. Task 5 is everything non-destructive — the retarget the spec requires *before* the deletion, the composite fixture that keeps the pass-ordering claim falsifiable after it, the relocation the spec requires *before* the deletion, and three docblocks — and leaves `npm test` and `npm run test:evals` green. Task 6 is the single atomic destructive commit. The split exists so that a revert of the retirement does not also un-retarget the test that would then break `npm test`.
- The spec's "`landed:` amendment" (small) is folded into **Task 7**, because the spec's own wording requires it: `core_lifecycle` joins `landed:` "in the same change that adds the twelve rubrics". Landing it earlier parks `RUBRIC_TIER_UNCOVERED` red across four commits.
- **Task 8 is new** — the Gates block owes eleven operator-half criteria that no automated artifact discharges. Left implicit they ship as unperformed checkboxes.

**Ordering, and why every commit stays green.** Four assertions bear on the real roots as this tier lands, and each is handled at the commit that makes it satisfiable:

1. `RUBRIC_CORE_ELEMENT_FLOOR` over the real `core_lifecycle` bucket is vacuous at Task 1 (zero rubric files) and complete at Task 7 (twelve). Tasks 1–6 prove it against synthetic roots — the parameterisation the sibling already built into `checkRubricSet` — and Task 7 adds the real-root application together with the non-emptiness assertion that stops it passing vacuously.
2. `RUBRIC_TIER_UNCOVERED` reaches this tier's twelve slugs only once `landed:` names `core_lifecycle`, which is the Task 7 edit. Before it the rule is correct and silent.
3. `RUBRIC_LEGACY_SURVIVES` over the real roots would fire on the three live legacy rubrics from Task 1 until Task 6 deletes them. Task 1 therefore proves it on synthetic roots and **asserts the real-root scan reports exactly those three files, by name** — a pinned expected-failure set, not a suppression. Task 6 flips that pin to the empty set in the same commit that deletes them, which is what makes the deletion observable to the checker rather than merely believed.
4. **The sibling's landed-tier test counts the real roots, and this tier grows them.** `rubric-set-change-imminent.plan.md:690` lands `test('the landed tier is complete at the real roots')`, which asserts that `tests/evals/skill-regression/rubrics/*.yaml` globs **exactly 11**, that `scenarios/*.md` globs exactly 11, and that the stems **set-equal** `tiers.yaml`'s `change_imminent` bucket in both directions — its own falsification row confirms that a twelfth stray file must redden it. Every task in this plan that writes into those same real roots therefore reddens that test unless it amends it. **This is not a deferral; it is a per-commit obligation.** See the cross-plan amendment schedule immediately below.

**Cross-plan coupling: the sibling's landed-tier test is amended here, task by task.**

> **Ownership.** `test('the landed tier is complete at the real roots')` lives in `tests/lib/evals/rubric-coverage.test.mjs` and is **owned by `rubric-set-change-imminent.plan.md` (its Task 8, at `:690`)**. This plan does not re-own it and does not duplicate it. It **amends** it, in place, in each commit that changes the file counts it pins. A reader arriving from either plan should find the coupling stated in both directions: the sibling authors the assertion; this tier is the only thing that legitimately changes its numbers. Nothing else in this plan edits a sibling-owned test — contrast criterion #17, which this plan deliberately verifies rather than edits, because that one belongs to the other **spec** as well as the other plan. This one pins a property of the *shared real roots*, which this tier mutates, so amending it is the only correct move.

The amendment is a **one-line-per-commit edit to two counts and one expected stem set**, and it lands **inside the same commit as the rubrics that change them** — never as a follow-up, never as a separate "fix the sibling test" commit. Splitting it is exactly the `npm test`-red-at-an-intermediate-commit state that spec criterion #24 forbids.

| Task | Rubrics/scenarios added | Count after | Expected stem set after |
|---|---|---|---|
| — (sibling Task 8 lands it) | — | **11** | `change_imminent` bucket |
| 3 (detectors ×5) | `hygiene`, `validate`, `review-specs`, `debug`, `route` | **16** | `change_imminent` ∪ those five |
| 4 (producers ×2) | `write-test`, `implement` | **18** | `change_imminent` ∪ the seven landed so far |
| 6 (re-authored producers ×3) | `specify`, `plan`, `brainstorm` | **21** | `change_imminent` ∪ the ten landed so far |
| 7 (orchestrators ×2) | `build`, `work` | **23** | `change_imminent` ∪ **`core_lifecycle`** — the full both-buckets union, once `landed:` is amended |

Two properties of the amendment, both of which keep the sibling's test doing its job rather than being loosened:

- **The counts stay literals.** Never `>= 11`, never "the number of files on disk" — the whole value of the assertion is that a stray twelfth file reddens it, and a computed count cannot. Each amendment replaces one integer with the next integer in the progression above.
- **The set-equality stays bidirectional at every step.** Through Tasks 3, 4 and 6 the expected set is the `change_imminent` bucket **plus an explicit literal list of the core-lifecycle stems landed so far** — not "the union of both buckets", which would go red on the core-lifecycle slugs not yet authored. Only at Task 7, when all twelve exist, does it become the plain union of the two buckets read from `tiers.yaml`. Write the intermediate literal lists out; a derived set defeats the assertion.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`.

**Constitution boundary check:** no task creates a service, touches auth, changes the hook protocol, alters the CLI installation path structure, changes the plugin registration format, or adds a dependency. Every task adds tests or committed test data (explicitly autonomous). **No task touches a SKILL.md body**, so `hooks/pre-commit-no-inline-node.sh` is a no-op throughout — recorded so a surprise is visible. **No task bumps `package.json`'s `version`**, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` — release-please owns those (ADR-0008); Task 6 edits only the `scripts` block. One architecture boundary is adjacent and deliberately not crossed: **this tier scores the lifecycle order and changes none of it** (Task 7's note).

---

### Task 1: The three additional conformance rules + rejecting inputs [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** `RUBRIC_CORE_ELEMENT_FLOOR`, `RUBRIC_COVERS_SKILLS_UNLISTED` and `RUBRIC_LEGACY_SURVIVES`, each with at least one rejecting input, each added to the file's existing frozen code registry and to its `checked`-counter reachability assertion. The eleven rules already in the file are read, not rewritten.

**Context to load:** the Tasks 1–2 Context Packet.

- [ ] **Write failing test**

Extend the sibling's `checkRubricSet({ tiersPath, rubricRoot, scenarioRoot, skillsRoot })` — adding a `legacyRoots` parameter defaulting to the two real ones — and add the three codes to the frozen array. Every rejecting fixture is a conforming baseline mutated in **exactly one way**; a fixture that trips two rules proves neither.

1. **`RUBRIC_CORE_ELEMENT_FLOOR`** — a rubric whose stem sits in `tiers.yaml`'s `core_lifecycle` bucket declares fewer than 7 `required_elements`. **Scoped to that bucket, not to all rubrics**: the eleven change-imminent rubrics legitimately sit at 5 and 6, and a tier-agnostic floor would go red on files this tier does not own. Rejecting input: a synthetic `core_lifecycle`-bucketed rubric with 6 elements. Accepting boundary: the same rubric at exactly 7. Second accepting case: a `change_imminent`-bucketed rubric at 5 elements must **not** fire, which is what proves the bucket scoping is applied rather than decorative. The judged range is untouched — `RUBRIC_ELEMENT_FLOOR` already enforces 3–6 and this rule must not duplicate it, asserted by a synthetic rubric with 7 elements and 7 criteria firing `RUBRIC_ELEMENT_FLOOR` **and not** `RUBRIC_CORE_ELEMENT_FLOOR`.
2. **`RUBRIC_COVERS_SKILLS_UNLISTED`** — a rubric carries `source: "skill-regression:<id>"` and its own `skill` value is absent from that entry's `covers_skills`. Resolve `<id>` through `catalog.yaml` — the same lookup `RUBRIC_TWIN_UNCITED` already performs — and split `covers_skills` on the catalog's own comma-and-space form, never a bare `split(",")`, or every slug after the first carries a leading space and the rule fires on correct input. Rejecting input: a synthetic `hygiene`-shaped rubric citing `skill-regression:PV-03` against the **real** catalog, whose `covers_skills` is `codehealth, repomap`. Accepting input: the same rubric with `skill: codehealth`. Third case: a rubric citing **no** catalog id must not fire, and the `checked` counter must still record that it was examined.
3. **`RUBRIC_LEGACY_SURVIVES`** — a file under **either** of two enumerated roots — `tests/evals/skill-regression/rubrics/` and anywhere under `tests/evals/skill-compression/` — carries a legacy marker. The vehicle is a **parse-tolerant marker scan over file text**, deliberately independent of `loadRubric`: routing it through the loader defeats it, because `RUBRIC_PARSE_ERROR` terminates a malformed file before any marker is inspected, so the rule would never fire on precisely the adversarial input it exists to catch.

   The marker set, all three matched on text: a `weight` key on a `quality_dimensions` entry (**numeric or string** — `parseYaml` types bare integers, and the legacy `1.5` arrives as a string, so a numeric-only check misses it); a `match_pattern` key; a `scoring:` block. A file with no `rubric_id`, or one that fails to parse, is **in scope** — legacy shape is the selector, not schema conformance. None of the three real legacy files declares a `rubric_id` at all, which is exactly why a `rubric_id`-namespace-scoped rule would stay silent on the artifacts it exists to catch.

   Symlinks are **reported, not skipped**: a symlinked entry under either root yields `RUBRIC_LEGACY_SURVIVES`, never a silent pass. Skipping is how a restored legacy file evades a rule whose whole threat model is restoration, and following one would pull files from outside this charter's namespace into a rule whose entire scoping argument is that it reaches nothing the charter does not own.

   A missing root is **not an error**: `tests/evals/skill-compression/` will not exist after Task 6, and git does not track an empty directory, so the ENOENT disposition is pinned as a pass with its own test.

   Rejecting inputs, five: a synthetic rubric with `weight: 3` on a `quality_dimensions` entry; one with `weight: 1.5` (the string branch — a separate input, because the numeric branch alone misses it); one with `match_pattern`; one with a `scoring:` block; and an unparseable file under the root, which must yield `RUBRIC_LEGACY_SURVIVES` — not a parse error, and not a skip.

Two assertions that no rejecting input covers, both required by the heuristic:

- **The must-not-fire proof.** Run the scan's marker predicate over the 21 legacy-shaped rubrics outside `skill-compression/` — 6 each under `configurable-governance/`, `data-engineering/` and `work-tracking/`, 2 under `integration-sandbox/`, 1 under `worktree-parallelization/` — and assert the rule reports **nothing**, because they sit outside both roots. Assert the enumerated set is **21** so a rename empties the loop loudly rather than passing silently. Note in a comment that the 4 under `comparison/` carry `weight` on a `dimensions:` list rather than `quality_dimensions` and fall outside the marker set entirely — a fourth legacy shape this charter does not name.
- **The pinned expected-failure set.** At this task's landing state the real `skill-compression/rubrics/` root still holds three legacy files. Assert the real-root scan reports **exactly** `brainstorm.yaml`, `plan.yaml` and `specify.yaml`, by name, as a `deepEqual` on a sorted array. This is not a suppression: it is the assertion Task 6 flips to `[]` in the same commit that deletes them, which is what makes the deletion observable to the checker.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the three branches do not exist in `checkRubricSet`, so all rejecting fixtures return an empty `errors` array and the three new `checked` counters are absent from the reachability set.

- [ ] **Implement**

Add the three branches. Load every rubric through `loadRubric` first and let its codes surface unmodified — these three sit **on top of** the eleven and the loader's, never in place of them. `RUBRIC_LEGACY_SURVIVES` is the one exception and says so in a comment: it reads text before and independently of the loader, by design.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — fourteen rules, eleven new rejecting inputs, four accepting/boundary cases, the 21-file must-not-fire proof, and the three-file pinned expected-failure set.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| `RUBRIC_CORE_ELEMENT_FLOOR` | change `< 7` to `< 5` | the 6-element rejecting input |
| Floor boundary | change `< 7` to `<= 7` | the exactly-7 accepting case |
| Bucket scoping | drop the `core_lifecycle` membership filter | the change-imminent 5-element accepting case — proving the scoping is applied |
| Rule separation | make `RUBRIC_CORE_ELEMENT_FLOOR` also check the judged range | the 7-elements/7-criteria case must report `RUBRIC_ELEMENT_FLOOR` alone |
| `RUBRIC_COVERS_SKILLS_UNLISTED` | delete the branch | the `PV-03`-from-`hygiene` fixture, and its `checked` counter |
| Slug splitting | replace the comma-and-space split with `split(",")` | the `skill: codehealth` accepting case goes red on ` repomap` — the bug this row exists to catch |
| No-citation case | make the rule fire on a rubric with no `skill-regression:` source | the third case |
| `RUBRIC_LEGACY_SURVIVES`, numeric weight | delete the numeric branch | the `weight: 3` input |
| …string weight | delete the string branch | the `weight: 1.5` input — **a different input from the row above** |
| …`match_pattern` | delete that marker | its input |
| …`scoring:` | delete that marker | its input |
| Parse tolerance | route the scan through `loadRubric` | the unparseable-file case reports `RUBRIC_PARSE_ERROR` instead of `RUBRIC_LEGACY_SURVIVES` — the single perturbation that proves the vehicle choice is load-bearing |
| Symlink posture | make the scan skip symlinked entries | the symlink case must go red, not pass |
| Missing root | make ENOENT throw | the clean-checkout case |
| Root scoping | widen `legacyRoots` to `tests/evals/` | the 21-file must-not-fire proof goes red — the heuristic's anti-pattern, caught by an assertion rather than by review |
| 21-file enumeration | point the must-not-fire scan at an empty directory | the count-is-21 assertion, **not** the reports-nothing assertion |
| Pinned failure set | delete one of the three names from the expected array | the `deepEqual` — so the set cannot silently shrink before Task 6 shrinks it deliberately |

Revert each. Record the seventeen confirmations in the commit body.

- [ ] **Commit**

`test(eval-harness): add the three core-lifecycle rubric conformance rules with rejecting inputs`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 1`

---

### Task 2: The `covers_skills` interlock — catalog, pin, red-then-green [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/evals/skill-regression/catalog.yaml` (committed test data)
- Modify: `tests/lib/evals/skill-regression-catalog.test.mjs` (the pin at `:317-333`)
- Modify: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: both suites

> **The point of this task is the red-then-green transition, not the catalog edit.** The edit itself is two words. What the task delivers is evidence that `RUBRIC_COVERS_SKILLS_UNLISTED` **fires** on the `hygiene`/`orphan-source-file` citation before the catalog lists `hygiene`, and **passes** after — the spec's criterion is "proven in both directions", and a rule proven in one direction is a rule that can stop matching without going red. The fixture's own catalog test has been holding the door open for exactly this: `tests/lib/evals/skill-regression-catalog.test.mjs:317` pins `orphan-source-file`'s `covers_skills` as **exactly `codehealth, repomap`**, and its comment at `:318-320` says so in as many words — *"Do NOT 'improve' this by adding `hygiene`. The core-lifecycle tier adds it as its own task and proves `RUBRIC_COVERS_SKILLS_UNLISTED` red-then-green across that edit; pre-extending it here makes that proof unreachable."* The pin and the catalog move in **one commit**; changing either alone leaves `npm test` red.

**Why this lands before Task 3 rather than inside it.** The `hygiene` rubric does not exist yet, so the red half is demonstrated with a synthetic `hygiene`-shaped rubric — same `skill: hygiene`, same `source: "skill-regression:PV-03"` — resolved against the **real** `catalog.yaml`. That is a genuine red-then-green across the real catalog edit, and it keeps every commit green: authoring `hygiene.yaml` first would park a real-root rule failure across the intervening commit, which is the state this plan's ordering rule exists to prevent.

> **Adjudicated and settled — do not relitigate.** Review examined whether a synthetic rubric can prove an interlock at all and ruled that it can, here: the red half is a *synthetic rubric* run against the **real** `catalog.yaml`, so the thing under test — whether `PV-03`/`KC-03` list `hygiene` — is the real artifact the real edit changes. Only the citing file is synthetic, and it is byte-for-byte the citation `hygiene.yaml` will carry in Task 3. That is a genuine both-directions proof, not a mock of one.

**Context to load:** the Tasks 1–2 Context Packet.

- [ ] **Write failing test**

In `rubric-coverage.test.mjs`, add `test('the hygiene citation of orphan-source-file is listed')`: build the synthetic `hygiene`-shaped rubric, run `checkRubricSet` against it and the **default** catalog, and assert it reports no `RUBRIC_COVERS_SKILLS_UNLISTED`. At this moment it does — the catalog still says `codehealth, repomap`. Assert also that the citation resolved at all (`checked.RUBRIC_COVERS_SKILLS_UNLISTED >= 1`), so the test cannot pass by never looking.

> **A bare "`errors` is empty" is unreachable here, and must not be written.** With `rubricRoot` pointed at a synthetic directory but `tiersPath` and `scenarioRoot` left at their defaults, `RUBRIC_TIER_UNCOVERED` fires for all eleven `change_imminent` slugs that the synthetic root does not contain, so `errors` is never empty no matter what the catalog says and the assertion could only ever be red. Two acceptable forms, and this task takes the **first**:
>
> 1. **Name all four roots plus `onlyStems`** — the sibling's house pattern at `rubric-set-change-imminent.plan.md:459`: `checkRubricSet({ tiersPath, rubricRoot, scenarioRoot, skillsRoot, onlyStems: ['hygiene'] })` over a synthetic tier file and a synthetic scenario twin, against the **real** `catalog.yaml`. The catalog is the only thing that must stay real, because the real catalog edit is what this task proves. Then `errors` deep-equals `[]` is both reachable and meaningful.
> 2. Keep the default roots and filter: `errors.filter(e => e.code === 'RUBRIC_COVERS_SKILLS_UNLISTED')` deep-equals `[]`. Weaker, because it cannot notice the rubric tripping something else.
>
> Form 1 is chosen so the green half is a full-conformance statement about the synthetic rubric rather than a single-code carve-out. Whichever form a later edit prefers, it must not silently become the unreachable bare form.

In `skill-regression-catalog.test.mjs`, rewrite the `:317` pin to its post-edit form: `covers_skills` deep-equals `["codehealth", "hygiene", "repomap"]`, `hygiene` **is** present, and `matched === 2` (the PV and its KC twin) is kept unchanged — that counter is what stops a class-slug rename emptying the loop. Rewrite the `:318-320` comment to record that the transition happened, name this plan task, and state the new invariant: `hygiene` is now load-bearing for `hygiene.yaml`'s `PV-03` citation and removing it re-fires the rule.

- [ ] **Verify test fails**

Run: `npm test`
Expected: FAIL, **twice and for two different reasons** — `rubric-coverage.test.mjs` reports `RUBRIC_COVERS_SKILLS_UNLISTED` for the synthetic `hygiene` rubric (this is the **red** half of the criterion; capture the exact error text in the commit body), and `skill-regression-catalog.test.mjs` fails its rewritten pin because the catalog still reads `codehealth, repomap`.

- [ ] **Implement**

Edit `catalog.yaml` by **minimal in-place text splice**: locate the `PV-03` and `KC-03` entries by their `id:` lines and rewrite the single `covers_skills:` value on each from `"codehealth, repomap"` to `"codehealth, hygiene, repomap"`. **Both** entries — the rule resolves the cited id, and `hygiene.yaml` cites `PV-03` **and** `KC-03` per `RUBRIC_TWIN_UNCITED`, so extending only the PV leaves the twin citation unlisted.

Never a load-mutate-reserialize round trip through `parseYaml`. The discipline is `lib/extensions/governance-splice.mjs`'s and the reason is on the record: a naive reserializer once replaced seven checks and twenty comment lines in a real `validate.yaml`. `catalog.yaml` carries roughly forty comment lines, including the block at `:22-27` that pins `catalog_id` and names the three readers of the prefix — one of which is this very rule.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — the synthetic `hygiene` rubric now conforms (the **green** half), and the rewritten pin matches. Record both halves in the commit body: the red error text and the green run.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| The interlock itself | revert `PV-03`'s `covers_skills` to `codehealth, repomap` | `RUBRIC_COVERS_SKILLS_UNLISTED` **and** the rewritten pin — both, from one edit |
| Twin coverage | revert only `KC-03`'s `covers_skills` | the rule, on the `KC-03` citation — proving extending the PV alone is insufficient |
| The pin's reachability | rename the class to `orphan-source-files` in the catalog | `matched === 2` — the loop must not silently iterate nothing |
| Comment survival | reserialize `catalog.yaml` through `parseYaml` and write it back | the file's comment lines vanish; assert on the **text** that the `:22-27` block survives, since `parseYaml` discards comments and a round-trip assertion alone would pass |
| Ordering | apply the catalog edit and the pin edit in separate commits | `npm test` is red at the intermediate commit — run this once, confirm it, and revert; it is the concrete form of "these move together" |
| Root parameterisation | drop `tiersPath`/`scenarioRoot` from the call and assert `errors` deep-equals `[]` | the test, permanently — `RUBRIC_TIER_UNCOVERED` fires for the eleven absent `change_imminent` slugs. Run it once so the unreachable form is seen to be unreachable rather than argued about |

Revert each.

- [ ] **Commit**

`test(eval-harness): list hygiene in orphan-source-file's covers_skills and flip the pin`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 2`

---

### Task 3: Detector rubrics + scenarios — `hygiene`, `validate`, `review-specs`, `debug`, `route` [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all ten are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/rubrics/{hygiene,validate,review-specs,debug,route}.yaml`
- Create: `tests/evals/skill-regression/scenarios/{hygiene,validate,review-specs,debug,route}.md`
- Modify: `tests/lib/evals/rubric-coverage.test.mjs` (the five-stem conformance test, the anchoring predicate, **and the sibling-owned `test('the landed tier is complete at the real roots')` — 11 → 16, in this same commit**)
- Conditional, comment-only: up to ten files under `tests/evals/skill-regression/project/` — see the answer-key block
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** no new rule. These ten files are validated by the checker Tasks 1–2 already landed, which is the point of landing it first. The task adds one `test()` running `checkRubricSet` over a root containing **only** these five stems, asserting zero errors and that the stem filter matched five — an empty filter result would pass vacuously.

**Context to load:** the Tasks 3–4, 6–7 Context Packet. Read `skills/{hygiene,validate,review-specs,debug,route}/SKILL.md` in full **and each one's governing spec under `.context-index/specs/features/`**. Difference 1 is the whole reason this tier exists: where SKILL.md and spec disagree, the rubric follows the **spec** and the disagreement is the finding.

- [ ] **Write failing test**

`test('the five detector rubrics conform')` — `checkRubricSet({ onlyStems: ['hygiene','validate','review-specs','debug','route'] })`, `errors` empty, filter matched five.

**Amend the sibling's landed-tier test in this same commit — 11 → 16.** These five rubrics and five scenarios land in `tests/evals/skill-regression/rubrics/` and `scenarios/`, the exact real roots `test('the landed tier is complete at the real roots')` (sibling plan `:690`) globs and counts. Change both counts from `11` to `16` and extend its expected stem set from the `change_imminent` bucket to that bucket plus the literal `['hygiene','validate','review-specs','debug','route']`, keeping the comparison bidirectional. **This edit is part of this task's commit, not a follow-up**: without it `npm test` is red at Task 3's commit and spec criterion #24 ("`npm test` passes at every step") is violated. Leave a comment at the amendment site naming this plan task, so the next amendment (Task 4, → 18) is findable from the test rather than only from the plan.

Four detector-specific assertions the generic rules do not cover:

- **Twin positivity.** Each of the five cites at least one `skill-regression:PV-nn` **and** its `KC` twin. `RUBRIC_TWIN_UNCITED` proves the negative; this proves the positive set is non-empty. Pin the expected citation sets so a dropped citation goes red:

  | Rubric | PV/KC pairs cited |
  |---|---|
  | `hygiene` | `PV-01/KC-01`, `PV-02/KC-02`, `PV-03/KC-03`, `PV-09/KC-09` |
  | `validate` | `PV-01/KC-01`, `PV-06/KC-06` |
  | `review-specs` | `PV-07/KC-07` |
  | `debug` | `PV-01/KC-01` |
  | `route` | `PV-10/KC-10` |

- **Citation resolution.** Assert the fixture's own `CATALOG_UNRESOLVED_CITATION` scan reports these five rubric paths in its scanned-file list. Asserting the list *grew* is what proves the guarantee transferred rather than assuming it. This tier mints no alias.
- **`covers_skills` positivity.** Every cited entry lists the citing skill. Seven of the eight distinct classes were already seeded that way; `PV-03`/`KC-03` is the one Task 2 extended, and this is where the extension is *used* rather than merely made.
- **The reference-anchoring predicate.** Difference 1's claim needs a check, per the plan heuristic. For every `quality_dimensions` entry in these five files, the `reference` value must contain at least one of: the literal `skills/<own-slug>/SKILL.md`; a path under `.context-index/specs/`; or a named repository contract (a symbol or file literal). And it must match none of `/current output/i`, `/today's behaviou?r/i`, `/best practice/i` — the unanchored forms the criterion names. Additionally, and going beyond what the shared contract validates: every `reference` substring that is **shaped like a repo path** must resolve to an existing file. The spec deliberately declines to make this a shared rule — the sibling's rubrics anchor references on symbols and contract names, not paths, and a path-shaped rule on the shared host would fail them — but scoped to this tier's own twelve files it is dischargeable, and an unresolvable `reference` reaches `buildJudgeContext` intact and degrades the judgement silently. Flagged as a plan-level addition in the Spec Coverage Map.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the ten files do not exist; the filter-matched-five assertion fails on zero.

- [ ] **Implement**

Author the five rubrics against the exemplar's field shapes verbatim (`required_elements`: `id`, `description`, `source`, `met_when`, `not_applicable_when`; `quality_dimensions`: `id`, `criterion`, `reference`, `met_when`, `not_met_when`, `unknown_when`). All values flat.

| Rubric | Scored input | Elements / criteria | Load-bearing notes |
|---|---|---|---|
| `hygiene` | the audit report and its checklists | 9 / 5 | The widest citation set in either tier. Four classes, eight ids, four twin pairs |
| `validate` | the PASS/FAIL report | 8 / 5 | Scores the report over an **empty gate set**, deliberately — the fixture declares no gate command, and `lib/domains/merge-gates.mjs` records `INVALID_GATE` and drops rather than throwing. An element asserting "the gate section is present and reports zero configured gates" is the honest form; one asserting a gate ran would be red by construction |
| `review-specs` | the review and blockers sidecars | 8 / 5 | Both sidecars, not just the review — the blockers file is where a `charter-scope-escape` lands |
| `debug` | the diagnosis **and the fix diff** | 8 / 4 | The first rubric in either tier whose scored input includes a diff |
| `route` | the four-dimension routing table | 7 / 3 | The tier's floor case: exactly 7 elements. `RUBRIC_CORE_ELEMENT_FLOOR`'s boundary is exercised by real data here, not only synthetically |

Every row meets the 7-element floor and sits inside the 3–6 judged range. The `Kind` column is descriptive in this tier: `RUBRIC_TWIN_UNCITED` applies tier-wide, and the change-imminent tier's "no producer cites a catalog id" convention is scoped to *that* tier and is **not** asserted here.

Author the five scenarios. Each carries the change-imminent tier's every-scenario tokens verbatim, names the `scripts/` setup helper, states cwd as the realpathed copy root, states per-write `isContained`, and states the before/after capture. Two properties this tier makes load-bearing rather than hygienic, stated in each of the five:

- **The copy is a git repository**, built with `createTempGitRepo()` in its zero-argument form, and `git rev-parse --show-toplevel` equals the realpathed copy root. `createTempDir()` performs no `git init`, so a copy made with it leaves `debug`'s and `validate`'s writes resolving against whatever repository git finds walking up from `tmpdir()` — an environment property, not a bound.
- **`debug` and `validate` repair what they find.** A run that does its job rewrites the planted `spec-code-drift` in `shipping-rates.spec.md` or the `esm-violation` in `legacy-loader.js`, destroying the ground truth every rubric in **both** tiers cites, and surfacing one run later as a `CATALOG_ANCHOR_NOT_UNIQUE` failure whose message points nowhere near its cause. The copy is what prevents it, and these two scenarios are the reason the copy exists.

- [ ] **Baseline-and-contract authoring run**

Run each of the five scenarios once, by hand, against the current skill, and confirm the **deterministic half scores full marks**. This tier's exit differs from the sibling's: where the rubric and the skill's current behaviour disagree, the rubric **follows the governing spec**, the disagreement is filed via `/adev:issues`, and its id is pinned in `spec_behaviour_gap_issue` — shape-validated by `RUBRIC_EXCEPTION_ID_MALFORMED`, which the sibling owns and proves on both keys. **Shape is the only guarantee at v1**: nothing resolves the id against the board, so a rubric may name a closed issue and stay green. Record which exit each of the five took in the commit body.

- [ ] **Answer-key handling — `issue-dzxjoa` (P1, undecided)**

The fixture labels planted defects **in-file with their exact catalog class slug**. Five of this tier's detector rubrics assert that a skill *found* a defect; where the fixture names it in a readable comment, the element measures reading comprehension rather than analysis.

**The re-derivation command, and why the obvious one is wrong.** `git grep -n 'planted violation\|Planted violation\|known-clean'` **under-reports, and the sites it misses are ones this plan itself names.** It requires the two words to be adjacent, so it does not match `shipping-rates.spec.md:82` — whose text reads "the visible half of the planted `spec-code-drift` violation", with the class slug *between* the words — and it does not match `tests/rates.test.mjs:7`, which reads "the planted `spec-code-drift` violation" across a line break. Both bear directly on `PV-01`, which three of this tier's rubrics cite. The command to use is:

```
git grep -niE 'planted|known-clean' tests/evals/skill-regression/project
```

Case-insensitive (`src/shipping/rates.mjs:17` writes `KNOWN-CLEAN` in caps), single-token, and it catches the interpolated forms. On today's tree it returns **20 lines across 13 files**, against the 14 lines across 10 files the adjacent-words form finds.

**Which of this task's elements depend on the outcome — the list re-derived with the command above.** Nine distinct at-risk elements across four rubrics, exposed at twelve label sites in ten files; the five rows marked **(new)** are the ones the adjacent-words grep missed:

| Label site | Text | Elements at risk |
|---|---|---|
| `src/orders/orphaned-helper.mjs:2` | ``Planted violation: `orphan-source-file`.`` | `hygiene` PV-03 |
| `src/orders/orphaned-helper.mjs:6` | names the `orphan-source-file` known-clean twin | `hygiene` KC-03 |
| `src/index.mjs:20` | names the `orphan-source-file` known-clean twin | `hygiene` KC-03 |
| `src/shipping/rates.mjs:17` **(new)** | "The file itself is the `orphan-source-file` KNOWN-CLEAN twin" — caps, missed by a case-sensitive grep | `hygiene` KC-03 |
| `src/orders/legacy-loader.js:2` | ``Planted violation: `esm-violation`.`` | `validate` PV-06 |
| `src/orders/legacy-loader.js:10` | names the `esm-violation` known-clean twin | `validate` KC-06 |
| `.context-index/governance/validate.yaml:11` **(new)** | "the `esm-violation` planted-violation / known-clean pair" — hyphenated, missed by the two-word form | `validate` PV-06, KC-06 |
| `.context-index/specs/features/orders/shipping-rates.spec.md:82` **(new to the grep, not to the plan)** | "That gap is the visible half of the planted `spec-code-drift` violation" — slug between the words | `hygiene` PV-01, `validate` PV-01, `debug` PV-01 |
| `tests/rates.test.mjs:7` **(new)** | "the planted `spec-code-drift` violation" | `hygiene` PV-01, `validate` PV-01, `debug` PV-01 |
| `.context-index/specs/features/orders/shipping-rates.plan.md:66,68` | "This is the `plan-task-without-test` planted violation" and its known-clean sentence | `route` PV-10 |
| `src/orders/create-order.mjs:8` **(new)** | "This is the known-clean twin: the spec postdates its source" — the stale-frontmatter twin, named without its slug | `hygiene` KC-02 |
| `tests/create-order.test.mjs:3` **(new)** | "the known-clean twin" against a `updated:` date line | `hygiene` KC-02 |

**Correcting the earlier under-scoping.** A previous revision of this block called `PV-02` unaffected on the grounds that its anchor is an uncommented date line. That is true of the **`PV`** half and false of the **`KC`** half: `create-order.mjs:8` and `tests/create-order.test.mjs:3` both narrate the known-clean twin in prose, and `hygiene` cites `PV-02/KC-02` as a pair. Still genuinely unaffected: **`PV-09`** (`missing-issue-binding` — the anchor is `"id": "epic-2"` in `tasks.json`, uncommented) and **`PV-07`** (`charter-scope-escape` — the anchor is the spec's own H1, and no comment names the class). `review-specs` therefore remains the one detector with **no** label-exposed element.

**Hits the command returns that are out of this tier's scope**, listed so the redaction is not over-scoped in the other direction: `src/index.mjs:6` (`undocumented-public-api`), `src/index.mjs:32` (`unused-dependency`), `src/shipping/rates.mjs:8` (the two-plants heading) and `src/shipping/rates.mjs:71` (`dead-export`) — all cited by the **sibling** tier's `codehealth`/`document` rubrics, not by this one. Two further hits name no class at all and only announce that plants exist: `.context-index/constitution.md:11` ("a fixture whose findings are supposed to be the planted ones") and `.context-index/evals/config.yaml:3` ("Scaffolding, not a planted violation"). Leave all of these to whoever owns the class; touching them widens this tier's diff into the sibling's fixture surface for no gain.

**A finding this plan owes back to the sibling.** The change-imminent plan sized the redaction at six files. Four of the label sites above are **not** on that list — `shipping-rates.spec.md:82`, `tests/rates.test.mjs:7`, `.context-index/governance/validate.yaml:11` and `src/shipping/rates.mjs:17` — because that tier cites neither `PV-01` nor `PV-06`, and its `KC-03` coverage did not reach the caps-form twin. A fifth, `.context-index/governance/review.yaml:11` ("Removing it leaves that planted violation with no detector"), names no class slug but does announce a plant. **If the sibling has already executed its redaction, this task must not assume the job is done**: re-run the `git grep -niE` form above and redact what remains. Size for this tier: **thirteen files matched by the command, of which twelve label sites across ten files are in scope; comment-only edits, one commit inside this task.** No catalog anchor changes — every anchor is a code or frontmatter string, so `CATALOG_ANCHOR_NOT_UNIQUE` is unaffected, and none of the fixture's hermeticity properties reads a comment.

**Author so either resolution drops in cleanly.** Phrase every `met_when` against the catalog's `detect_when` clause — the *finding* — never against the label text. `hygiene`'s PV-03 element reads "the orphan list names `src/orders/orphaned-helper.mjs` as unreachable from `src/index.mjs`", the catalog's own words; it survives redaction with **no edit**. Do not write an element whose `met_when` could be satisfied by echoing a comment.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — the five-stem conformance test, the pinned citation table, the scan-growth assertion, the `covers_skills` positivity check, and the anchoring predicate.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Twin citation | delete the `KC-01` citation from `debug.yaml` | `RUBRIC_TWIN_UNCITED` |
| Wrong twin | cite `KC-02` alongside `PV-01` in `validate.yaml` | `RUBRIC_TWIN_UNCITED`, not silence |
| Pinned citation table | drop `PV-09` from `hygiene.yaml` | the pinned-set assertion — `RUBRIC_TWIN_UNCITED` stays silent on a *pair* removed cleanly, which is why the pin exists |
| Citation resolution | cite `skill-regression:PV-99` | `CATALOG_UNRESOLVED_CITATION` from the **fixture's** suite, not this one — confirming the scan really covers this root |
| Scan-root growth | move the five rubrics out of `rubrics/` | the "scanned list contains these paths" assertion |
| `covers_skills` in use | revert `PV-03`'s `covers_skills` (Task 2's edit) | `RUBRIC_COVERS_SKILLS_UNLISTED` on `hygiene.yaml` — the *real* citation now firing the rule Task 2 proved synthetically |
| Element floor | drop `route.yaml` to 6 elements | `RUBRIC_CORE_ELEMENT_FLOOR` — the tier's floor exercised on real data at its exact boundary |
| Judged ceiling | give `hygiene.yaml` 7 `quality_dimensions` | `RUBRIC_ELEMENT_FLOOR`, **not** `RUBRIC_CORE_ELEMENT_FLOOR` |
| Anchoring, unanchored form | set one `review-specs` `reference` to "current output" | the anchoring predicate |
| Anchoring, dangling path | set one `debug` `reference` to a `.context-index/specs/` path that does not exist | the path-resolution assertion — the row that proves the plan-level addition is real |
| Scenario tokens | delete the `git status and rev-parse HEAD equality` clause from `validate.md` | `RUBRIC_SCENARIO_STEP_MISSING` naming that token |
| Copy is a repo | build the copy with `createTempDir()` instead | the `rev-parse --show-toplevel` equality; run this once on a scratch checkout, since a `debug` fix diff committing into the ambient repository is the failure it prevents |
| Ground-truth survival | run `validate` **against the committed fixture** rather than a copy | the fixture's write-escape equality goes red and `legacy-loader.js` is repaired. **Scratch checkout only** — this is the perturbation with real blast radius, and it is the one that makes the copy's necessity concrete rather than argued |
| Answer-key independence | delete the label comment and re-run the skill | the element must still score `met`. **If it flips to `not_met`, the element was measuring the comment** — rewrite it against `detect_when` and record the finding on `issue-dzxjoa`. Run it separately for each of the nine exposed elements |

Revert each. The last row is what makes `issue-dzxjoa` decidable from evidence rather than from argument.

- [ ] **Commit**

`test(eval-harness): add core-lifecycle detector rubrics and scenarios for hygiene, validate, review-specs, debug, route`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 3`

---

### Task 4: Producer rubrics + scenarios — `write-test`, `implement` [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all four are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/rubrics/{write-test,implement}.yaml`
- Create: `tests/evals/skill-regression/scenarios/{write-test,implement}.md`
- Modify: `tests/lib/evals/rubric-coverage.test.mjs` (the two-stem conformance test, **and the sibling-owned landed-tier test — 16 → 18, in this same commit**)
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** a two-stem conformance test in the same shape as Task 3's, plus the board-containment and anchoring assertions these two need.

These two are separated from `specify`/`plan`/`brainstorm` because those three carry a legacy predecessor that Task 6 deletes in the same change that authors their replacement. `write-test` and `implement` have nothing to retire and no reason to wait behind the migration.

**Context to load:** the Tasks 3–4, 6–7 Context Packet. Read `skills/write-test/SKILL.md` and `skills/implement/SKILL.md` in full, plus their governing specs, plus `lib/issues/resolve-root.mjs:30,33`.

- [ ] **Write failing test**

`test('the two producer rubrics conform')` — `checkRubricSet` over these two stems, zero errors, filter matched two. Plus:

- `write-test` cites `PV-10/KC-10` (`plan-task-without-test`), whose `covers_skills` already reads `plan, write-test, route`. Pinned, same shape as Task 3's table.
- `implement` cites **no** catalog id — its scored input is the task diffs and the per-task review records, and no planted class describes those. Predicate: `!/skill-regression:/.test(yamlText)` over `implement.yaml`, stated as a per-file assertion rather than a tier universal, because four rubrics in this tier are producers that *do* cite.
- The anchoring predicate from Task 3, extended to these two stems.

**Amend the sibling's landed-tier test in this same commit — 16 → 18.** Same edit as Task 3's, one increment on: both counts in `test('the landed tier is complete at the real roots')` go from `16` to `18`, and its expected stem set gains the literals `'write-test'` and `'implement'`, still compared in both directions. Part of this commit, not a follow-up; otherwise `npm test` is red at Task 4's commit against spec criterion #24.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the four files do not exist; the filter-matched-two assertion fails on zero.

- [ ] **Implement**

| Rubric | Scored input | Elements / criteria | Load-bearing notes |
|---|---|---|---|
| `write-test` | the failing tests and the handoff block | 7 / 4 | Cites `PV-10/KC-10`. Its scenario asserts the RED phase was *observed*, not asserted — an element reading "the transcript records the test running and failing before any implementation edit" is the only form that distinguishes TDD from test-after |
| `implement` | the task diffs and the per-task review records | 8 / 5 | The tier's board-touching skill. `tasks.db_path` is written into the **copy's** manifest as the realpathed copy root, so `implement`'s issue writes and `resolveStorageRoot`'s git-common-dir fallback both land inside the copy |

Both scenarios carry the every-scenario token set. Two additions specific to this pair:

- **Board containment.** `isContained(lenientRealpath(resolveStorageRoot(...)), lenientRealpath(copyDir))`, stated in `implement.md`. The change-imminent tier confirmed this for `issues`; `implement` is the second board-touching skill and inherits the contract rather than re-deriving it. Note the vacuity trap explicitly in the scenario prose: with `db_path` absent, `resolveStorageRoot` falls through to the git-common-dir branch and returns the copy root, so containment **passes vacuously**. The splice's presence is what makes the check mean something.
- **`implement` commits.** No `git status` of any kind can see a commit, which leaves the tree clean — which is why the capture pairs `git status --porcelain --ignored=traditional --untracked-files=all` with a `git rev-parse HEAD` equality **at every root `git worktree list --porcelain` prints**, the enumeration anchored at `-C resolveMainRoot(startCwd)` and taken **before any chdir into the copy**. `implement` is the skill that makes the `HEAD` half non-decorative.

- [ ] **Baseline-and-contract authoring run**

Same one-pass contract as Task 3, with the same spec-wins resolution and `spec_behaviour_gap_issue` filing. `implement` is the likeliest of the twelve to take the file-a-gap exit: its SKILL.md and its governing spec both describe the two-stage review, and any drift between them is exactly the finding Difference 1 exists to surface.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| `PV-10` twin | delete `KC-10` from `write-test.yaml` | `RUBRIC_TWIN_UNCITED` |
| `implement` no-citation | add `source: "skill-regression:PV-01"` to `implement.yaml` | the per-file predicate — and confirm `RUBRIC_TWIN_UNCITED` stays silent if the twin is added too, which is why the predicate is separate |
| Element floor | drop `write-test.yaml` to 6 elements | `RUBRIC_CORE_ELEMENT_FLOOR` |
| `id`/`skill` binding | set `implement.yaml`'s `skill:` to `implement-v2` | `RUBRIC_ID_MISMATCH` on the `skill` branch |
| Scenario binding | point `write-test.yaml`'s `scenario:` at `../../../etc/passwd` | `RUBRIC_SOURCE_PATH_ESCAPE`, decided **before** existence |
| Board containment, real | run `implement` with `tasks.db_path` deleted from the copy's manifest | containment passes **vacuously** — the operator must recognise this as a vacuous pass, not a pass |
| Board containment, escape | run `implement` with cwd at the repository root | this repository's `.beads/` gains records and the write-escape equality goes red. **Scratch checkout only** |
| `HEAD` equality | run `implement` to completion, let it commit, and compare only `git status` | the status comparison passes while `HEAD` moved — the perturbation that proves the `rev-parse HEAD` half is load-bearing |
| Anchoring | set one `implement` `reference` to free prose | the anchoring predicate |

Revert each.

- [ ] **Commit**

`test(eval-harness): add core-lifecycle producer rubrics and scenarios for write-test and implement`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 4`

---

### Task 5: Migration prep — retarget, the composite fixture, relocate, three docblocks [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/fixtures/evals/rubrics/legacy-composite-shape.yaml` — the composite-shape fixture that preserves the pass-ordering claim (committed test data; see the adjudication block below)
- Modify: `tests/lib/evals/rubric-legacy-scale.test.mjs` — the `:198` test retargeted, its name and its `:199` comment rewritten, the `:190` comment de-referenced, **and one new test carrying the pass-ordering claim against the composite fixture**
- Relocate: `tests/evals/skill-compression/token-budget-eval/{token-budget-eval,real-token-analysis}.test.mjs` → `tests/evals/token-optimization/token-budget-eval/`
- Modify: both relocated suites' usage docblocks (`:9` and `:13`)
- Modify: `scripts/run-tests.mjs` — the `:92` docblock clause
- Test: `tests/lib/evals/rubric-legacy-scale.test.mjs`, `tests/test-discovery.test.mjs`, and `npm run test:evals`

**This task deletes nothing.** It is everything the spec requires to happen *before* the removal, isolated so that a revert of the retirement does not also un-retarget the test that would then break `npm test`. Both `npm test` and `npm run test:evals` are green at its commit.

**Context to load:** the Task 5 Context Packet.

- [ ] **Write failing test**

Rewrite `tests/lib/evals/rubric-legacy-scale.test.mjs:198-212`. Three edits, and one of them is a real coverage question rather than a rename:

1. **The target.** `loadRubric("tests/evals/skill-compression/rubrics/plan.yaml", …)` becomes `loadRubric("tests/fixtures/evals/rubrics/legacy-weight-scale.yaml", …)`. That file exists and is purpose-built as the synthetic stand-in.
2. **The asserted code changes, and this is the point.** The real `plan.yaml` raises `RUBRIC_NESTED_MAP` (matching `/scoring/`) because its nested `scoring:` block trips the nesting pass before anything else — the legacy-weight pass is unreachable behind it. The synthetic `legacy-weight-scale.yaml` is *conforming except for weights*: it carries every required key and no `scoring:` block, so it raises `RUBRIC_LEGACY_SCALE`. Assert the code the retargeted fixture **genuinely produces**, never the one the old assertion named.
3. **The name and the comments.** `:198`'s test name ("the real skill-compression rubrics are refused") and `:199`'s comment become false the moment the fixture changes. Rewrite both. `:190`'s comment is a different case — it belongs to an unrelated test and goes stale only because the tree is deleted; it is a bare-token `git grep` hit, not a falsehood, and it is reworded rather than corrected.

> **Adjudicated — the fixture lands here. Flagging the gap was ruled insufficient.**
>
> The `:198` test's real content was a **pass-ordering** claim: that nesting is checked before the legacy-weight scale, so a composite legacy rubric never reaches `RUBRIC_LEGACY_SCALE` at all. An earlier revision of this plan proposed to land the retarget as specified, flag the loss, and let review decide. Review decided, and decided against: **land the fixture in this task.**
>
> The three facts that settled it, each confirmed rather than assumed:
>
> - `tests/evals/skill-compression/rubrics/plan.yaml` trips `RUBRIC_NESTED_MAP` **first**, which is precisely the ordering the old test proved and the only reason it was a pass-ordering test at all.
> - `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml` carries every required key and **no `scoring:` block**, so it cannot reproduce the composite shape and cannot carry the claim. The retarget genuinely preserves *a* test and drops *the* assertion.
> - After Task 6, **no composite-shaped file remains anywhere in the repository.** The claim does not merely lose its best input; it becomes **permanently unfalsifiable**, and an unfalsifiable claim is exactly what this plan's own heuristic forbids shipping.
>
> Cost of the fix: **one committed YAML file, zero production code, zero new test files.** That is a smaller cost than the alternative, which is deleting a real assertion and writing a paragraph about it.
>
> **`tests/fixtures/evals/rubrics/legacy-composite-shape.yaml`** — nested `scoring:` block, weighted `quality_dimensions` entries, and the ten missing `REQUIRED_TOP_LEVEL_KEYS`, i.e. the shape the real `plan.yaml` had. **It cannot trip `RUBRIC_LEGACY_SURVIVES`**: that rule's `legacyRoots` are exactly `tests/evals/skill-regression/rubrics/` and `tests/evals/skill-compression/`, and `tests/fixtures/evals/rubrics/` is under neither — the same reason `legacy-weight-scale.yaml` already sits there unbothered. It is also **not** one of the 21 out-of-charter legacy-shaped rubrics Task 1 enumerates: that set is scoped to the five other harnesses under `tests/evals/`, so the pinned count of 21 does **not** change. Both facts are asserted, not asserted-by-omission (see the falsification rows below).

Add `test('nesting is checked before the legacy-weight scale')`: `loadRubric("tests/fixtures/evals/rubrics/legacy-composite-shape.yaml", { projectRoot: repoRoot })` raises **`RUBRIC_NESTED_MAP`** — not `RUBRIC_LEGACY_SCALE`, and not a missing-key code — with the message matching `/scoring/`. This is the assertion the old `:198` test carried, now on an input that survives Task 6. Name the ordering explicitly in the test name so a future reader does not mistake it for a duplicate of the retargeted test.

Add a discovery assertion for the relocation: `node scripts/run-tests.mjs --evals --list` lists both suites at their **new** paths and neither at its old one, and the overall output is non-empty (or the check passes on a crashed subprocess).

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-legacy-scale.test.mjs`
Expected: FAIL, on three counts — the retargeted call raises `RUBRIC_LEGACY_SCALE` where the assertion still names `RUBRIC_NESTED_MAP` and the `/scoring/` message match finds nothing; the new pass-ordering test fails because `legacy-composite-shape.yaml` does not exist yet (an ENOENT, not a `RUBRIC_NESTED_MAP`); and the discovery assertion fails on the old paths.

- [ ] **Implement**

`git mv tests/evals/skill-compression/token-budget-eval tests/evals/token-optimization/token-budget-eval` — as an `execFileSync` argv array with `shell: false` and `-C migrationRoot`, where `migrationRoot` is `git rev-parse --show-toplevel` of this command's own cwd, derived the same way. `tests/evals/token-optimization/` already exists, so this creates one subdirectory inside a live harness. **Assert the destination exists and holds both files before the task is considered done** — this is the ordering the spec pins, and Task 6's removal is gated on it.

Then the three docblocks: `token-budget-eval.test.mjs:9`, `real-token-analysis.test.mjs:13`, and `scripts/run-tests.mjs:92`, whose "evals/skill-compression token-budget" clause follows the relocation and becomes "evals/token-optimization token-budget". That clause is the *rationale* for the eval-bucket split — `real-token-analysis.test.mjs` reads local Claude session JSONL from `~/.claude/projects/`, which is exactly the machine state a default `npm test` must not assume — so it is reworded, never deleted.

Then author `tests/fixtures/evals/rubrics/legacy-composite-shape.yaml`. Its header comment states, in this order: what shape it reproduces, that its **only** consumer is the pass-ordering test, that it is deliberately outside both `RUBRIC_LEGACY_SURVIVES` roots and must stay there, and that it exists because the real composite input was deleted by Task 6 — so a later reader tidying up "an unused legacy-looking fixture" finds the reason before the delete key.

Then the retarget.

- [ ] **Verify test passes**

Run: `npm test`, then `npm run test:evals`
Expected: PASS on both. `npm test` does **not** reach `tests/evals/`, so it cannot observe a relocation that dropped a suite; running `test:evals` here is what makes the relocation checked rather than assumed, and the spec pins that separately for the deletion step too.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Retarget code | assert `RUBRIC_NESTED_MAP` on the synthetic | the test — proving the code really changed with the fixture |
| Retarget target — **observation, not a guard** | point it back at `tests/evals/skill-compression/rubrics/plan.yaml` | nothing, today — and that is the finding. It is why the retarget must land **before** the deletion: after it, the same edit is an ENOENT crash in the **default** `npm test` bucket |
| Pass-ordering claim | remove the `scoring:` block from `legacy-composite-shape.yaml` | the new test — it now raises `RUBRIC_LEGACY_SCALE`, which is the whole ordering claim, inverted |
| Pass-ordering input reality | delete `legacy-composite-shape.yaml` | the new test, by ENOENT — the row that proves the fixture is load-bearing and not decorative |
| Fixture root scoping | move `legacy-composite-shape.yaml` into `tests/evals/skill-regression/rubrics/` | `RUBRIC_LEGACY_SURVIVES` from Task 1 fires on it, **and** Task 7's 23-file count. Confirms the fixture's chosen home is what keeps it out of the legacy scan, rather than luck |
| 21-file enumeration unchanged | (assert, do not perturb) | Task 1's pinned count stays **21**; `tests/fixtures/` is not one of the five out-of-charter harnesses and the new fixture does not join that set |
| Relocation completeness | `git mv` only `token-budget-eval.test.mjs` | the two-files-at-the-destination assertion |
| Discovery — **observation, not a guard** | leave the docblock paths pointing at the old tree | the `--evals --list` new-path assertion is unaffected — docblocks are prose. Confirm this, and record that the docblock edits are discharged by `git grep`, not by the discovery check |
| Bucket partition | move the relocated directory to `tests/lib/` | `tests/test-discovery.test.mjs`'s bucket-partition assertion, and `npm test` starts depending on `~/.claude/projects/` |
| `--evals --list` non-crash | point the command at a nonexistent flag | the non-empty-output assertion, **not** the path assertion |

Revert each.

- [ ] **Commit**

`test(eval-harness): retarget the legacy-scale guard, preserve the pass-ordering claim, and relocate token-budget-eval out of skill-compression`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 5`

---

### Task 6: Re-author `specify`/`plan`/`brainstorm` **and** retire the compression tree [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/rubrics/{specify,plan,brainstorm}.yaml` (committed test data)
- Create: `tests/evals/skill-regression/scenarios/{specify,plan,brainstorm}.md` (committed test data)
- Delete: six literal subpaths — twenty tracked files plus one untracked tree
- Modify: `package.json`, `.gitignore`, `lib/evals/rubric.mjs`, `skills/eval/default-rubric.yaml`, `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml`, `tests/lib/evals/rubric-coverage.test.mjs` (the three-stem conformance test, the rule flips, **and the sibling-owned landed-tier test — 18 → 21, in this same commit**)
- Test: `tests/lib/evals/rubric-coverage.test.mjs`, plus `npm test` and `npm run test:evals`

**One commit, and it has to be one commit.** The spec's rule is that each legacy rubric "is re-authored against the shared contract, and the legacy file is deleted in the same change rather than left beside its replacement for a reader to pick between". Two rubrics for one skill on two incompatible scales, with nothing saying which is current, is the exact state `RUBRIC_LEGACY_SURVIVES` exists to prevent — shipping it for even one commit would be shipping the defect the rule names. The deletion is also atomic for a second reason: `run-eval.mjs` and `matrix-integrity.test.mjs` load the three rubrics *and* the twelve variants by path and by field shape, so removing any subset leaves the harness red.

> **Adjudicated and settled — the one-commit irreversibility is necessary, not an over-read.** Review pressed on whether "it has to be one commit" was rhetoric and confirmed it is not. `run-eval.mjs` and `matrix-integrity.test.mjs` resolve the rubrics and the twelve variants **by path**, and `package.json`'s `eval:skill-compression` script points at `run-eval.mjs`, so **any** subset split — rubrics without variants, data without the script, the script without its inputs — leaves the tree red at the intermediate commit and violates spec criterion #24. Three further decisions in this task were examined in the same pass and all hold, and are recorded here so they are not reopened:
>
> - **Relocation before deletion** (Task 5 first, gated by the destination-exists re-assert in step 2) is the correct sequencing, not defensive padding.
> - **`-C migrationRoot` rather than `resolveMainRoot`** is right. `lib/worktree.mjs:57`'s `resolveMainRoot` returns the ***main*** repo root, and this repository is normally worked from `.claude/worktrees/` — so the divergence is real and routine, not hypothetical, and anchoring on it would containment-check and delete against the wrong tree.
> - **The `rmSync` containment anchoring** — both sides on `migrationRoot`, base bounded to the retired tree rather than `repoRoot` — holds as argued, including the two stated divergences from `applyExecPayload`.

**Migration is a rewrite, not a translation.** A 1–5 `weight` does not map onto a binary verdict, and "4 and up is `met`" invents a threshold no author chose. The three new rubrics are authored from the skills and their specs, not derived from the files being deleted.

**Context to load:** the Task 6 Context Packet, plus the Tasks 3–4, 6–7 Context Packet for the authoring half.

- [ ] **Write failing test**

Three groups.

**(a) The three rubrics.** `test('the three re-authored producer rubrics conform')` — `checkRubricSet` over `specify`, `plan`, `brainstorm`; zero errors; filter matched three. Pinned citations: `specify` → `PV-07/KC-07`, `plan` → `PV-10/KC-10`, `brainstorm` → `PV-07/KC-07`. All three classes already list the citing skill in `covers_skills` (`specify, review-specs, brainstorm` and `plan, write-test, route`), so no further catalog change is needed and the test asserts that positively. The anchoring predicate extends to these three.

**Amend the sibling's landed-tier test in this same commit — 18 → 21.** Both counts in `test('the landed tier is complete at the real roots')` go from `18` to `21`, and its expected stem set gains the literals `'specify'`, `'plan'` and `'brainstorm'`, still bidirectional. Note the collision hazard while editing: `specify.yaml`, `plan.yaml` and `brainstorm.yaml` are also the stems of the three legacy files this same commit deletes from `tests/evals/skill-compression/rubrics/`. The counts and the stem set refer to the **skill-regression** roots only; do not let the two sets of same-named files be conflated in the amendment or in the group (c) flip below.

**(b) The removal, asserted rather than assumed.** The heuristic applies directly: a claim that a tree is gone must ship the predicate that checks it. **Two of the four items below are one-time facts about a single commit, not standing invariants, and they belong in the commit body rather than in a `.test.mjs` — see the split immediately after.**

- **Post-condition (test):** `git ls-files tests/evals/skill-compression` returns **zero**; `existsSync('tests/evals/skill-compression')` is false; `git ls-files tests/evals/token-optimization/token-budget-eval` still returns exactly **two**, byte-identical to their Task 5 state. These stay true forever after this commit, so they are a real standing guard.
- **Reference clearance (test):** the bare-token `skill-compression` scan — see the exemption design below.

**The two items that move to commit-body evidence, and why.** A `.test.mjs` runs on every future commit, so an assertion that is only true at one commit is a time bomb that reddens someone else's unrelated PR:

- **`git show --stat -M HEAD` reports exactly 20 deletions under `tests/evals/skill-compression/` and zero elsewhere under `tests/evals/`.** `HEAD` is the migration commit for exactly as long as nothing else is committed. As a test this breaks at the very next commit. **Perform it, paste the output into the commit body as the blast-radius record, and do not host it.**
- **The pre-condition that `git ls-files tests/evals/skill-compression` returns exactly 20 and that the five enumerated tracked subpaths set-equal those 20 in both directions.** This is the enumeration-completeness check, and it is genuinely valuable — but it is false the instant the deletion in this same commit lands, so it can never be a passing hosted test. **Run it as a scripted pre-flight inside the migration step, before any `git rm`, halting the migration on mismatch; record the 20 paths and the set-equality result in the commit body.** The one-way-subset failure mode it guards against is caught at the moment it matters, which is before the removal, not a year later. Its falsification row below is performed against the pre-flight, not against a test file.

**Reference clearance — the exemption has to name its own host.** `git grep -n 'skill-compression'` — the **bare token**, not the path prefix, since `scripts/run-tests.mjs:92` and `.gitignore:43` name it without one — must return no hit outside the exempt set. The three history-bearing prefixes this migration must not rewrite are `.context-index/`, `CHANGELOG.md` and `.beads/`. **Those three are not sufficient, and shipping only those three makes this test unpassable as specified.**

> **The scan's corpus includes the file that enumerates what it scans for.** Task 1 writes the bare token `tests/evals/skill-compression/` into `tests/lib/evals/rubric-coverage.test.mjs` as one of `RUBRIC_LEGACY_SURVIVES`'s two `legacyRoots`, and group (c) of this very task **deliberately keeps it** so the ENOENT-on-a-clean-checkout case still has a root to be absent. That token is required to stay, and the grep that would flag it is hosted in the same file. This is the **third** occurrence of this shape in this charter — the scan whose corpus contains its own enumerator — and it is worth naming as a pattern rather than patching a third time in a third way.
>
> **Chosen fix: exempt the host by exact path.** Add `tests/lib/evals/rubric-coverage.test.mjs` to the exempt array as a **full repo-relative path literal**, alongside the three history-bearing prefixes, with a comment stating that it is exempt *because it is the file that declares `legacyRoots`* and that the exemption is a path, not a prefix.
>
> **Why exact-path and not a pinned hit list.** A pinned deep-equal against the expected hit list is the other honest option, and it is strictly tighter — it would catch a *second* stray token appearing inside the host file. It is rejected because the host is a test file under active extension by Tasks 1, 2, 3, 4, 6 and 7 of this plan alone: a pinned line-level hit list there would have to be re-pinned in six commits, and a pin re-edited six times is a pin nobody reads. The exact-path exemption is narrow in the dimension that matters — it admits exactly one file, not a directory — and it does not create six mechanical re-pins whose only visible effect is churn.
>
> **The exemption's own guard.** Assert the exempt array is exactly `['.context-index/', 'CHANGELOG.md', '.beads/', 'tests/lib/evals/rubric-coverage.test.mjs']` as a pinned literal, so the exemption cannot quietly widen, and assert the fourth entry is matched as a **whole path** rather than as a prefix — a prefix form would silently exempt any future `tests/lib/evals/rubric-coverage.test.mjs.bak`.
>
> **What the scan must find on today's tree, so it is not vacuous.** Twelve non-exempt hits across seven files: `.gitignore` (`:43`, `:45`), `lib/evals/rubric.mjs:33`, `package.json:35`, `scripts/run-tests.mjs:92`, `skills/eval/default-rubric.yaml` (`:9`, `:16`), `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml:2`, and `tests/lib/evals/rubric-legacy-scale.test.mjs` (`:190`, `:198`, `:199`, `:208`). All seven files are on this plan's Modify list — Task 5 clears `rubric-legacy-scale.test.mjs` and `scripts/run-tests.mjs`, this task clears the rest — **so the enumeration is complete and the clearance is reachable.** Verify that count before writing the test; if the tree yields a hit in an eighth file, the Modify list is stale and that is the finding.

**(c) The rule flips.** Change Task 1's pinned expected-failure set from `["brainstorm.yaml", "plan.yaml", "specify.yaml"]` to `[]`, and enable the real-root ENOENT case: the `skill-compression` root no longer exists and `RUBRIC_LEGACY_SURVIVES` must treat that as a pass, while the `skill-regression/rubrics/` root — which now holds real files — is asserted to have been scanned with a non-zero file count. Both halves matter: without the second, the rule could pass by scanning nothing.

- [ ] **Verify test fails**

Run: `npm test`
Expected: FAIL on all three groups — the six new data files do not exist, the post-conditions describe a tree that is still present, and the flipped `deepEqual` reports the three files still on disk.

- [ ] **Implement — the authoring half first**

| Rubric | Scored input | Elements / criteria | Load-bearing notes |
|---|---|---|---|
| `specify` | the written `.spec.md` | 8 / 5 | Cites `PV-07/KC-07`. A producer that detects while producing — writing a spec is where a charter-scope escape is either introduced or caught |
| `plan` | the written `.plan.md` | 8 / 4 | Cites `PV-10/KC-10`. At least one element asserts every task declares a TDD expectation, phrased against the catalog's `detect_when` |
| `brainstorm` | the written charter | 7 / 4 | Cites `PV-07/KC-07`. The tier's second 7-element floor case |

All three scenarios drive the skill against the **hermetic fixture on disk**, not against a project described in prose inside the scenario file. That is the substantive gain over what is being deleted: a described project cannot be asserted against, so the legacy rubrics could only regex-match the skill's own narration of what it did. Each carries the every-scenario token set, and each is a project-relative writer — `specify` and `plan` write into `.context-index/specs/features/`, `brainstorm` writes a charter — so cwd and per-write containment are the binding mechanism, not `tasks.db_path`.

- [ ] **Implement — the removal half, in this order**

1. **Derive the anchor.** `migrationRoot` = `execFileSync("git", ["rev-parse", "--show-toplevel"], …)` of the migration's own cwd, as an argv array with `shell: false`. Explicitly **not** `resolveMainRoot`, which returns the *main* repo root: a migration run from a `.claude/worktrees/` checkout — this repository's normal mode — would containment-check, and delete, against the wrong tree.
2. **Re-assert the ordering, and run the enumeration pre-flight.** The relocation destination exists and holds both suites. Then, still before any removal: `git ls-files tests/evals/skill-compression` returns exactly **20** paths, and the union of the five enumerated tracked subpaths **set-equals** those 20 **in both directions** — a one-way subset check passes on an enumeration that misses a file, which is the failure mode this exists for. **Halt the migration on any mismatch.** Capture the 20 paths and the set-equality result for the commit body; this is a pre-flight, not a hosted test, because the deletion in this same commit makes it false (see group (b)). Only then does anything get removed.
3. **Remove the five tracked subpaths** with `git rm -r`, each as an `execFileSync` argv array with `shell: false` and `-C migrationRoot` — git resolves pathspecs against the process cwd, which is the same anchor divergence the containment compare below closes, one door over. **Literal repo-relative paths, never computed or interpolated ones.** The literal is **not** `tests/evals/skill-compression`: `token-budget-eval/` was a child of that path, and naming the six retired subpaths is what keeps the command from reaching the preserved subtree even if the ordering above were violated.
4. **Remove the sixth, untracked target.** `tests/evals/skill-compression/outputs/` is ignored and untracked, so `git rm` cannot reach it, and it is the **only irreversible removal in the set** — nothing in git restores it, and the `eval:skill-compression` script that regenerates it dies in this same commit. Therefore: `const target = join(migrationRoot, "tests/evals/skill-compression/outputs")`, and before the call, `isContained(lenientRealpath(target), lenientRealpath(join(migrationRoot, "tests/evals/skill-compression")))`, with the **same anchored value** handed to `rmSync(target, { recursive: true, force: true })`.

   Three properties of that assert, each stated because each is a way to get it wrong:
   - **Both sides anchored on `migrationRoot`.** `lenientRealpath` opens with `resolve()`, which anchors a bare relative literal on `process.cwd()`; run from a subdirectory, target and base diverge. It fails closed rather than deleting wrongly, but `lib/extensions/exec-payload.mjs`'s `assertContained` resolves its candidate *against the base* for exactly this reason.
   - **The base is the retired tree, not `repoRoot`.** A base of `repoRoot` admits every path in the repository and would pass any future edit to the literal — an assert that self-satisfies. Bounded to the retired tree, it fires on exactly one input: a `tests/evals/skill-compression/outputs` symlink resolving outside it. That single rejecting input is what separates this compare from the worktree-exclusion compare the spec labels a defensive no-op.
   - **Two stated divergences from `applyExecPayload`**, close but not equal: its `rmSync` is non-recursive on a single file where this one is `{ recursive: true }` on a tree; and `lenientRealpath` — unlike `exec-payload.mjs:158::assertContained`, which refuses an unresolvable candidate — appends a missing remainder literally rather than refusing. Safe here, because `force: true` makes a nonexistent target a no-op and an existing symlink is resolved. A divergence, not an equivalence, and it is written into the code comment.
5. **`package.json`** — delete the `eval:skill-compression` script line. Nothing else in that file; release-please owns `version` (ADR-0008).
6. **`.gitignore`** — delete the `:45` rule. **Edit** the `:43` comment to drop its `/ eval:skill-compression` clause rather than deleting the line: `:43` heads two rules and deleting it whole orphans the surviving `tests/evals/repomap/*/` entry at `:44`. The `outputs/` removal in step 4 and this edit are one ordered step for a reason the spec states — a machine that has run `eval:skill-compression` must not end up with previously-ignored output turning git-visible, which would falsify both the tree-no-longer-exists post-condition and the next Tier B pass's status baseline.
7. **Three prose references** — `lib/evals/rubric.mjs:33` (names the rubric *shape*; a bare-token hit, not a path), `skills/eval/default-rubric.yaml:9,16` (cites the retired rubrics as the house pattern — reword to describe the shape without naming a dead tree), `tests/fixtures/evals/rubrics/legacy-weight-scale.yaml:2` (cites them as what it is modelled on — reword to past tense, since the fixture is now the *only* remaining instance of that shape and that is worth saying).

- [ ] **Verify test passes**

Run: `npm test`, then **immediately** `npm run test:evals`
Expected: PASS on both. The second run is not optional and the spec pins it separately: `npm test` does not reach the `tests/evals/` bucket, so it cannot observe a relocation that dropped `token-budget-eval/`'s two suites, and the step immediately after the deletion is the only moment at which that is checked before other work masks it.

- [ ] **Prove the migration by re-introduction**

A green run proves the files are gone; it does not prove the rule would have noticed. Restore one — `git checkout <pre-migration-sha> -- tests/evals/skill-compression/rubrics/plan.yaml` — run `npm test`, and **confirm `RUBRIC_LEGACY_SURVIVES` is red before removing it again.** Record the failing output in the commit body. Repeat once with the file restored to `tests/evals/skill-regression/rubrics/plan.yaml` instead — the other enumerated root, and the likelier accident, since that is where a confused author would put it.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Enumeration completeness | drop `variants/` from the five-subpath list | the **pre-flight** in removal step 2 halts, naming the twelve unlisted files. A one-way subset check would pass. Falsified against the pre-flight, not against a test file — the check is unhostable because this commit falsifies it |
| Preserved subtree | run `git rm -r tests/evals/skill-compression` instead of the enumeration | the two-files-at-the-destination post-condition and `npm run test:evals`. **Scratch checkout only** — this is the blast-radius failure the enumeration exists to prevent, and seeing it once is worth more than the paragraph arguing for it |
| Ordering | remove before relocating | the destination-exists pre-condition halts the migration before any `git rm` runs |
| Containment base | widen the `rmSync` base from the retired tree to `repoRoot` | plant a `tests/evals/skill-compression/outputs` symlink pointing outside the tree; with the retired-tree base the assert fires, with `repoRoot` it passes. The one input that distinguishes them |
| Anchor derivation | swap `migrationRoot` for `resolveMainRoot` | run the migration from a `.claude/worktrees/` checkout: the paths resolve against the main repo. **Dry-run only** — assert the divergence, do not execute the removal |
| argv discipline | pass the `git rm` as a shell string | a pathspec with a space or a glob reaches the shell; assert the argv form on the call site rather than on the outcome |
| Reference clearance | leave `lib/evals/rubric.mjs:33` unedited | the bare-token `git grep` test, naming that file |
| Exemption width | add `docs/` to the exempt array | the pinned-literal assertion — the exemption must not widen by accident |
| Host exemption is load-bearing | drop `tests/lib/evals/rubric-coverage.test.mjs` from the exempt array | the clearance test, naming its own host file's `legacyRoots` line. The row that proves the exemption is needed rather than defensive |
| Host exemption is not a prefix | copy the host to `tests/lib/evals/rubric-coverage.test.mjs.bak` with the token in it | the clearance test — a prefix-matched exemption would let the copy through, a whole-path one does not |
| Clearance non-vacuity | revert Task 5's and this task's prose edits and run the scan | it reports **twelve** hits across **seven** files. Confirms the scan reaches real hits rather than passing on an empty corpus |
| `.gitignore` `:43` | delete the whole line instead of editing the comment | `tests/evals/repomap/*/` at `:44` is orphaned under no comment; assert the surviving rule still has its heading |
| Rule flip | leave the pinned expected-failure set at the three names | the `deepEqual` — the deletion must be *observed* by the checker, not merely believed |
| Scan non-emptiness | point `legacyRoots` at two nonexistent directories | the scanned-file-count assertion, **not** the reports-nothing assertion |
| Re-introduction | (above) | `RUBRIC_LEGACY_SURVIVES`, from both roots, confirmed red before the file is removed again |
| `test:evals` timing — **observation, not a guard** | run only `npm test` after the deletion | nothing — and that is the finding. `npm test` is green over a dropped eval suite, which is why the spec pins the second command to this exact step |

Revert each.

- [ ] **Commit**

`refactor(eval-harness)!: re-author specify/plan/brainstorm rubrics and retire the skill-compression harness`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 6`
Body: the twenty deleted paths, the one untracked tree, the two relocated suites (from Task 5), the re-introduction proof output, and the falsification confirmations. **Plus the two one-time facts moved out of the test file** (group (b)): the enumeration pre-flight's 20 paths and its both-directions set-equality result, and the `git show --stat -M HEAD` blast-radius output showing exactly 20 deletions under `tests/evals/skill-compression/` and zero elsewhere under `tests/evals/`. These are evidence recorded at the commit that makes them true, not standing assertions.

---

### Task 7: Orchestrators `build` and `work`, the `landed:` amendment, the real-root flip [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/rubrics/{build,work}.yaml`, `tests/evals/skill-regression/scenarios/{build,work}.md` (committed test data)
- Modify: `tests/evals/skill-regression/tiers.yaml` — `landed:` gains `core_lifecycle`
- Modify: `tests/lib/evals/rubric-coverage.test.mjs` (the two-stem conformance test, the orchestrator and refusal predicates, **and the final amendment of the sibling-owned landed-tier test — 21 → 23, in this same commit**)
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** the last two rubrics, and then the assertion the whole plan has deferred — `checkRubricSet()` with **no arguments**, over the real `tiers.yaml`, the real roots and the real `skills/`, returning zero errors with all fourteen rules reached.

> **The `landed:` interlock.** `tiers.yaml`'s `landed:` scalar goes from `"change_imminent"` to `"change_imminent,core_lifecycle"` **in this commit and no earlier**, because the spec ties it to "the same change that adds the twelve rubrics" and this is the commit at which the twelfth exists. Two consequences, both asserted here: `RUBRIC_TIER_UNCOVERED` — scoped bucket-agnostically by the sibling precisely so this works — now reaches all twenty-three slugs, and without the edit the 23-slug coverage criterion is not merely unproven but *unsatisfiable*. Landing it earlier would park `RUBRIC_TIER_UNCOVERED` red across Tasks 3–6; landing it later leaves twelve rubrics present and unchecked, which is the failure the rule is named after.
>
> **Adjudicated and settled — this placement is sound; do not relitigate it.** Review checked the obvious objection, that twelve rubrics sitting on disk across Tasks 3–6 while `landed:` still reads `"change_imminent"` might trip some *other* rule, and confirmed it does not. `RUBRIC_TIER_UNCOVERED` is **`landed:`-scoped**, so it does not reach an unlanded bucket's slugs; and `RUBRIC_TIER_ORPHAN` fires on "a slug in **no** tier", while these twelve are in the `core_lifecycle` bucket of `tiers.yaml` from the moment the sibling wrote that file. The twelve are therefore **neither orphans while unlanded nor covered until the flip** — exactly the window this ordering needs, and it exists by the sibling's design rather than by luck. The only real-root count that *does* move during that window is the sibling's landed-tier test, which is why this plan amends it per task rather than deferring it here.

**Context to load:** the Tasks 3–4, 6–7 Context Packet. Read `skills/build/SKILL.md` and `skills/work/SKILL.md` in full, plus the fixture's `.context-index/lifecycle-state/{create-order,shipping-rates}.jsonl` and both `.spec.md` frontmatters.

- [ ] **Write failing test**

1. `test('the two orchestrator rubrics conform')` — two stems, zero errors, filter matched two.
2. **`test('the orchestrators cite no downstream artifact')`** — the spec's criterion, and it needs a predicate rather than review. `build.yaml` and `work.yaml` carry **no** `skill-regression:` source (they assert decisions, not ground truth) and **no** `artifact:` source naming a file a downstream skill wrote — pinned as a deny-list of the artifact paths the other ten rubrics score (`.spec.md`, `.plan.md`, charter, hygiene report, review sidecars, task diffs). Scoring an orchestrator on its children's artifacts double-counts those children's rubrics and marks the orchestrator `not_met` for a downstream skill's regression.
3. **`test('the work rubric asserts a refusal')`** — at least one `required_elements` entry whose `met_when` is a *negative*: a next step the fixture's lifecycle state makes ineligible and the skill must not take. Predicate: an element id matching `/refus|must-not|not-routed/` with a `met_when` naming a `/adev:` target. Assert **two** such elements exist, because the fixture makes two different branches decidable and they guard different things.
4. **Amend — do not re-declare — `test('the landed tier is complete at the real roots')`.** This test is **owned by the sibling plan** (`rubric-set-change-imminent.plan.md:690`) and has already been amended by Tasks 3, 4 and 6 of this plan; this is its **fourth and final** amendment, **21 → 23**. Writing it as a *new* `test()` here would duplicate the name inside one file, which is the bug this note exists to prevent — under `node:test` two same-named tests both run and a reader cannot tell which one a failure came from, and the stale 21-count copy would be red forever. Edit the existing test in place: both counts to **23**, and the expected stem set from the Task 6 literal list to the plain **union of `tiers.yaml`'s `change_imminent` and `core_lifecycle` buckets**, compared **in both directions** — this is the first commit at which the derived union is correct, because it is the first at which all twelve core-lifecycle rubrics exist. `errors` deep-equals `[]` at the defaults. Assert the counts **before** the error assertion: a zero-error result over an empty root is the heuristic's named failure mode.
5. `test('every rule was reached at the real roots')` — the `checked` set contains all fourteen codes, and `RUBRIC_CORE_ELEMENT_FLOOR`'s counter is exactly **12** (not 23 — the bucket scoping) while `RUBRIC_ELEMENT_FLOOR`'s is 23.
6. `test('tiers.yaml declares the amended landed scalar')` — the literal `"change_imminent,core_lifecycle"`, still exactly five top-level keys, still no `tiers_version`.

- [ ] **Verify test fails**

Run: `npm test`
Expected: FAIL — `build.yaml` and `work.yaml` do not exist, so the amended 23-file counts fail on 21 (the number Task 6 left them at), and `RUBRIC_TIER_UNCOVERED` fires for `build` and `work` once `landed:` is amended. **This is the first commit at which the real-root assertion can be green**, which is why it lands here.

- [ ] **Implement**

| Rubric | Scored input | Elements / criteria | What it asserts |
|---|---|---|---|
| `build` | the pipeline transcript and the artifacts each stage left | 7 / 3 | Stage sequencing and gate satisfaction across a `--full` chain — *that* each stage ran and left its artifact, never *how good* that artifact is, which is its own rubric's job |
| `work` | the classification and the skill it routed to | 7 / 3 | The classification, the chosen next step, and **two refusals** |

**`work`'s two refusals, and why the log rather than the frontmatter.** The fixture's `shipping-rates.jsonl` shows `specify` completed with **no `review` step** and **no `plan` step**. `work` must route to `/adev:review-specs`; it must route to **neither** `/adev:plan` (the review gate is unsatisfied) **nor** `/adev:implement` (no `plan` step, so the resume override does not fire despite `shipping-rates.plan.md` sitting on disk). The two refusals guard different branches, and the `/adev:implement` one is the branch the fixture was built to make decidable. Every element anchors on the **lifecycle log**, which is what `work` routes on; the matching `review-pending` frontmatter on `shipping-rates.spec.md` is the visible half but not the load-bearing one, and an element anchored on the frontmatter would score `met` against a log that says otherwise. The catalog carries both artifacts as **scaffolding** (`SC-10`, `SC-17`), not as ground truth, which is why neither rubric cites a `PV`.

**Both scenarios carry the `ADEV_NO_INFRA=1 in the step's own env` token** — the shared table's one slug-scoped row, and this tier's two scenarios are its only real inputs. Three things about it, all inherited rather than invented here:

- It is an **operator** act, never an agent one. `skills/validate/SKILL.md:55,87` and `skills/eval/SKILL.md:35` state that the agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously, and Difference 1 anchors these rubrics' `reference` values on those same SKILL.mds — so a scenario instructing the scored skill to pass the flag would put the run in violation of the contract its own rubric scores against.
- **Per invocation, in the command's own `env`** — never a shell `export`. `exec-consent.mjs` states consent is per-install and never persisted; an export is inherited by every later subprocess in that terminal, including `build`'s own propagation, and survives the sweep with nothing to unset it.
- For these two scenarios the env form is **primary** and the `no infra_requirements: in the copy` predicate secondary, which inverts the ordering every other scenario uses. `build --full` chains `specify` → `review` → `plan` → `route` → `implement` → `validate` inside one scenario — and `--full` is invoked precisely so it does, since the default Implement Pipeline writes no spec mid-scenario and the vector would not exist — so the spec-writing step and the `adev preflight run` that consumes it both sit *between* the before-check and the after-check. Say so in both files rather than leaving the inversion implicit.

Then amend `tiers.yaml`'s `landed:` and add the six real-root tests. No production change.

- [ ] **Baseline-and-contract authoring run**

Run both scenarios once. `build --full` is the longest run in either tier and the one whose before/after window is widest; perform the door predicates around it with that in mind. Same spec-wins exit and `spec_behaviour_gap_issue` filing as Tasks 3 and 4.

> **Architecture boundary, both directions.** These two rubrics assert the *existing* lifecycle order, and adding to that order requires human approval. A rubric that would need the order changed is a signal to stop and escalate, not to edit the order. The reverse also needs stating and is easy to miss: when a reordering **is** approved, both rubrics go red, and a red rubric is indistinguishable from a regression. An approved order change therefore carries a same-change update to `build.yaml` and `work.yaml` with a `version` bump, and their post-reorder red verdict is expected output of the approval rather than a finding. Write that into both files' header comments — the same same-commit discipline Task 2 imposes on `covers_skills`, applied to the other direction of the dependency.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — twenty-three rubrics, twenty-three scenarios, fourteen rules all reached, `landed: "change_imminent,core_lifecycle"`, `remaining` and `uncovered` correctly out of scope.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Real-root completeness | `git mv rubrics/work.yaml rubrics/work.yaml.bak` | `RUBRIC_TIER_UNCOVERED` at the real root, naming `work` — the spec's own criterion, proven by removal |
| The `landed:` interlock | revert `landed:` to `"change_imminent"` | **nothing** goes red, and that is the point: the twelve rubrics become invisible to `RUBRIC_TIER_UNCOVERED`. Assert it directly with test 6's literal, since the coverage rule cannot catch its own un-scoping |
| `landed:` validity | set `landed: "change_imminent,core_lifecyle"` | `RUBRIC_LANDED_INVALID` branch (a) — the sibling's rule, now load-bearing for this tier's typo |
| 23-file count | add a stray `rubrics/foo.yaml` | the count assertion **and** `RUBRIC_TIER_ORPHAN` — two independent guards, both must fire |
| Stem set equality | rename `debug.yaml` to `debugging.yaml` | the set comparison in **both** directions |
| Floor counter scoping | change `RUBRIC_CORE_ELEMENT_FLOOR` to iterate all rubrics | its counter reads 23 instead of 12, and the change-imminent rubrics at 5 elements go red |
| Orchestrator artifact ban | add `source: "artifact: .context-index/specs/features/orders/shipping-rates.spec.md"` to `build.yaml` | the deny-list predicate |
| Refusal count | delete the `/adev:implement` refusal element from `work.yaml` | the two-refusals assertion — a single-refusal rubric passes a rule written as "at least one", which is why the count is pinned at two |
| Refusal anchoring | re-anchor a `work` refusal on `shipping-rates.spec.md`'s frontmatter | run the scenario with the frontmatter and the log disagreeing; the element scores `met` while the routing is wrong. The perturbation that proves the log is the load-bearing half |
| `ADEV_NO_INFRA` token | delete the clause from `build.md` | `RUBRIC_SCENARIO_STEP_MISSING` naming that token — the sibling's branch, receiving its first real input |
| Export vs per-invocation — **observation, not a guard** | `export ADEV_NO_INFRA=1` before the sweep instead | nothing automated goes red, and that is the finding: it is operator discipline, recorded in Task 8's record and unbacked by design |
| Duplicate test name | add test 4 as a **new** `test('the landed tier is complete at the real roots')` instead of amending the sibling's | two same-named tests run, the stale 21-count copy is red, and the failure output names both. Confirm once so the amend-don't-duplicate rule is seen rather than asserted |
| Rule reachability | delete one rule's branch | the fourteen-code `checked` assertion, independently of any rejecting fixture |
| Default bucket | move `rubric-coverage.test.mjs` to `tests/evals/` | the sibling's `--list` assertion — confirm it still fires after this tier's edits |

Revert each.

- [ ] **Commit**

`test(eval-harness): complete the core-lifecycle tier with build, work, and the landed amendment`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 7`

---

### Task 8: The manual Tier B pass over the twelve [specialist: none]

**Charter capability:** Rubric set, core lifecycle tier
**Strategy:** manual — this task runs no automated test, because v1 ships no scenario driver. `scripts/run-tests.mjs` collects only `*.test.mjs` and this tier ships none under `tests/evals/`; `adev eval score --input` consumes a verdict set and `lib/evals/score.mjs` never reads an element's `source`, so no source form resolves. Both gaps belong to the charter's CI-integration capability.
**Files:**
- Create: `.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md`
- Test: none. Every check below is an **operator** obligation; the file halves are already enforced by `RUBRIC_SCENARIO_STEP_MISSING`

**Context to load:** the Task 8 Context Packet.

- [ ] **Perform the pass**

Run all twelve scenarios by hand, one at a time, each against its own fresh copy. The eight operator obligations the sibling's Task 9 enumerates apply unchanged and are not restated; four are different here, and only these four are written out:

1. **Board containment, second instance.** `implement` is the tier's board-touching skill. `isContained(lenientRealpath(resolveStorageRoot(...)), lenientRealpath(copyDir))`, with the vacuity trap recognised: with `db_path` absent, `resolveStorageRoot` falls through to the git-common-dir branch and returns the copy root, so containment **passes vacuously**. A vacuous pass is not a pass.
2. **`HEAD` equality carries real weight here.** Six of the twelve mutate and `implement` commits. No `git status` of any kind sees a commit, which leaves the tree clean. Capture `git status --porcelain --ignored=traditional --untracked-files=all` **and** `git rev-parse HEAD` at **every** root `git worktree list --porcelain` prints, the enumeration anchored at `-C resolveMainRoot(startCwd)` and taken **before any chdir into the copy** — run from inside the copy it prints exactly one root, the copy, which the exclusion then removes, leaving an empty root set and an equality that passes vacuously. Assert the root set is **non-empty** and **contains `resolveMainRoot(startCwd)`**, both sides through `lenientRealpath`. Equality, never emptiness: the ignored baseline is never empty in a clean tree. Captures are **in-memory only** and never committed — they enumerate every ignored and untracked path across every checkout, which on a developer machine includes `.env*` files and local scratch. A mismatch is reported as the differing repo-relative paths, or their count, to the operator console — never the raw capture, and never into the record.
3. **The widest before/after window in either tier.** `build --full` chains six skills inside one scenario, so the two door predicates — no `infra_requirements:` in any markdown under the copy, and no `.claude/` or `.mcp.json` **anywhere** under the copy at any depth — are checked before **and** after each scenario, not once per pass. The copy root is what the agent runtime resolves as the project root, so a `.claude/settings.json` written there grants a **later step inside the same scenario** an unprompted execution surface. A trip of **either** predicate **halts the sweep**: no Tier B record is written, and the copy is **retained** for out-of-band inspection — read by path, **never re-entered as a cwd under an agent runtime**, which is the exploitation path the halt exists to prevent. Neutralising the offending file carries `isContained(lenientRealpath(hit), lenientRealpath(copyDir))` before the delete, and the scan does not follow symlinks: a scored skill writing `copy/x → /somewhere/.claude` would otherwise yield a hit whose neutralisation lands outside the copy. A failed **capture comparison** is the same shape — no record, console-only report.
4. **`ADEV_NO_INFRA=1` per invocation, in the `build` and `work` steps' own `env`.** Never a shell `export`, never set by the agent. Confirm by eye that no `ADEV_NO_INFRA` survives in the shell after the sweep.

- [ ] **Write the record**

`.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md`, under the convention the change-imminent tier defines — same-day ordinal from `-01`, present from the first report of the day rather than added on collision; an existence pre-check plus `{flag: 'wx'}`, terminal rather than a retry; readers glob `tier-b-*.md` in name order. This tier defines nothing and writes one per pass.

Three properties of the write, all inherited and all load-bearing:

- **When.** Strictly **after** the post-run capture is taken and compared — outside the before/after window — then committed, so the next run's before-capture starts from a clean tree. Written inside the window it reddens the one gate standing between twelve mutating skills and the real `.context-index/`, and `.gitignore` would not save it: the capture enumerates ignored paths file by file.
- **What it carries.** Element and criterion **ids and verdict values only**. **Not evidence** — `lib/evals/score.mjs`'s `assertVerdictSetValid` refuses a `met`/`not_met` verdict with empty `evidence` (`SCORE_EMPTY_EVIDENCE`) and `buildVerdictTable` carries it into the result, and for `artifact:` elements that evidence is a span quoted out of files twelve mutating skills wrote inside the copy — agent-authored text, which must not land verbatim in a git-tracked project file. Tier B runs no judge, so no *model* output reaches the record either; both exclusions are stated because only one of them is obvious.
- **Static backing: none**, like the halt. A once-per-pass write has no per-scenario token to hang on. Stated rather than left as an asymmetry between the two operator obligations in the same block.

Content: per scenario, the deterministic verdicts, which exit each rubric took at its authoring run, any `spec_behaviour_gap_issue` filed, and the operator confirmations above. Registered on the CI-integration intake list the sibling declares, since that capability replaces this pass and inherits its history.

- [ ] **Two gates this task does not run, recorded so the absence is deliberate**

- **The Tier B sweep is wired to no automated or scheduled trigger** while the CI-integration capability has not supplied the automated halt. The halt is operator discipline at v1, and the stated hazard is a surface created mid-run being inherited by a later step of the same scenario — so an automated sweep without an automated halt is the unsafe combination.
- **Tier C is wired into no scheduled or CI trigger** while the budget-threshold capability is unlanded. **Vacuously true on landing** — Tier C is wired nowhere, so nothing goes red if a schedule is added later; enforcement is handed whole to the CI-integration capability with no interim checker. Recorded rather than implied by a criterion that cannot fail. A nightly is unattended by construction, so the observed-not-governed cost posture is only safe while the pass does not run unattended at all.

- [ ] **Falsify the pass itself**

The pass has no automated assertion, so its falsification is a set of deliberate trips run once, on a scratch copy, **before** the real pass — otherwise the operator has never seen any of these halt:

| Check | Trip | Expected |
|---|---|---|
| Door predicate (`.claude/`) | `mkdir <copy>/.claude` mid-`build` | the after-run check halts the sweep and **no record is written** |
| Door predicate (`infra_requirements:`) | add the key to a spec `specify` just wrote into the copy | same halt, different branch — and the branch a pre-first-scenario-only check would miss |
| `HEAD` equality | let `implement` commit, then compare only `git status` | status matches while `HEAD` moved; the comparison must still fail |
| Root enumeration | run `git worktree list` with cwd inside the copy | the enumeration returns the copy alone, the exclusion empties it, and the non-empty assertion must fire rather than the equality passing |
| Copy is a repo | build the copy with `createTempDir()` | `git rev-parse --show-toplevel` no longer equals the copy root, and `implement`'s commit lands in an ambient repository |
| Board containment | delete `tasks.db_path` from the copy | containment **passes vacuously**; the operator must recognise it as such |
| `ADEV_NO_INFRA` shape | `export` it instead of passing it per invocation | nothing goes red — the recorded, unbacked case |
| Record timing | write the record before the post-run capture | the capture reports a new untracked file at the main root |
| Record collision | write `-01` twice | `{flag: 'wx'}` refuses terminally |

- [ ] **Commit**

`docs(eval-harness): record the manual Tier B pass over the core-lifecycle tier`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`, `Plan-task: 8`

---

## Spec Coverage Map

Every acceptance criterion in spec revision 13, in spec order, with the task that discharges it. Criteria the plan does **not** discharge with a test are marked and say why. This table exists so a reviewer can check coverage by reading rather than by re-deriving it, and so a later spec revision shows up here as an unmapped row.

Many criteria are explicitly **two-halved** — a file half checked by `RUBRIC_SCENARIO_STEP_MISSING` (a rule the sibling owns) and a runtime half performed by the operator in Task 8. Those rows name both.

| # | Section | Criterion (abbreviated) | Task |
|---|---|---|---|
| 1 | Artifact shape | All 12 `rubrics/<skill>.yaml` and 12 `scenarios/<skill>.md` exist, one per `core_lifecycle` slug | 3, 4, 6, 7 — asserted as a set at the real root in 7, via the **final amendment** of the sibling-owned landed-tier test rather than a second test of the same name |
| 2 | Artifact shape | Every rubric loads through `loadRubric` and satisfies the shared contract | 3, 4, 6, 7 (per file); the eleven rules themselves are the sibling's |
| 3 | Artifact shape | ≥7 `required_elements`, 3–6 `quality_dimensions` | 1 (`RUBRIC_CORE_ELEMENT_FLOOR` + both boundaries + the bucket-scoping proof), 7 (real-root, counter pinned at 12) |
| 4 | Artifact shape | This spec restates no shared contract except Difference 2's two values | **Not discharged by a test, by the spec's own words** — "verified by review, since a copy is what the reference exists to prevent". Recorded as a review item for `/adev:review-specs`, not as a task |
| 5 | Reference anchoring | Every judged `reference` names the SKILL.md, the governing spec, or a named contract — never "current output" | 3 (the predicate), 4, 6, 7 (applied). **Exceeds the spec**: the path-resolution half is a plan-level addition, deliberately scoped to this tier's twelve files because a shared rule would fail the sibling's symbol-form references |
| 6 | Reference anchoring | A spec/behaviour disagreement is filed and pinned in `spec_behaviour_gap_issue`, shape-validated | 3, 4, 6, 7 (the filing). `RUBRIC_EXCEPTION_ID_MALFORMED` is the sibling's. **Shape is the only guarantee** — nothing resolves the id against the board; handed to CI-integration |
| 7 | Orchestrators | `work` and `build` assert routing decisions and cite no downstream artifact | 7 — a deny-list predicate, not review convention |
| 8 | Orchestrators | The `work` rubric asserts at least one refusal | 7 — **two**, pinned, because the fixture makes two branches decidable and "at least one" passes on the weaker |
| 9 | Catalog citations | Every cited id resolves; every `PV` carries its `KC` | 3, 4, 6 (positive, with pinned citation tables), sibling's `RUBRIC_TWIN_UNCITED` (negative), fixture's `CATALOG_UNRESOLVED_CITATION` (resolution) |
| 10 | Catalog citations | Every cited entry lists the citing skill in `covers_skills` | 1 (the rule), 2 (the one extension, red-then-green), 3 (the real citation using it) |
| 11 | Migration | `skill-compression/` gone; `token-optimization/token-budget-eval/` present with both suites passing under `test:evals`; no `eval:skill-compression` script | 5 (relocation), 6 (deletion, script, post-conditions) |
| 12 | Migration | The retarget lands **before** the removal, and `npm test` is green at every step | 5 (the retarget, its own commit), 6 (the removal) |
| 13 | Migration | `git grep -n 'skill-compression'` clean outside `.context-index/`, `CHANGELOG.md`, `.beads/` | 6 — shipped as a test with the exempt set as a pinned literal. **Exceeds the spec's three prefixes by one exact path**: `tests/lib/evals/rubric-coverage.test.mjs` is exempt because it is the file that declares `RUBRIC_LEGACY_SURVIVES`'s `legacyRoots`, one of which is the bare token being scanned for and which group (c) deliberately keeps. Without that fourth entry the criterion is unsatisfiable as the spec words it |
| 14 | Migration | Every migrated rubric loads and declares no `weight`, no `match_pattern`, no `scoring:` — **stated positively** | 6, via `loadRubric` plus `RUBRIC_LEGACY_SURVIVES`. The negative phrasing the spec rejects would be satisfied by a rubric refused for an unrelated reason |
| 15 | Migration | Proven by **re-introduction**, confirmed red before the file is removed again | 6 — twice, once per enumerated root |
| 16 | Coverage check | Each of the three rules proven by a deliberately broken input | 1 — eleven rejecting inputs across the three |
| 17 | Coverage check | `RUBRIC_EXCEPTION_ID_MALFORMED` has a rejecting input on `spec_behaviour_gap_issue` as well as `baseline_exception_issue` | **Inherited obligation; lands with the sibling** (its Task 2, two rejecting inputs, one per key). Not discharged by this plan. Task 7 verifies it landed and files an issue if it did not — **it does not edit the sibling's test**, which belongs to the other spec |
| 18 | Coverage check | `RUBRIC_COVERS_SKILLS_UNLISTED` fires before the catalog extension and passes after — both directions | 2, and that transition is the task's whole product |
| 19 | Coverage check | `RUBRIC_LEGACY_SURVIVES` matches on shape within two roots; no-`rubric_id` and unparseable in scope; passes on a clean checkout; does **not** fire on the 21 out-of-charter rubrics | 1 (five rejecting inputs, the ENOENT case, the 21-file must-not-fire proof with its count pinned), 6 (the real clean-checkout state) |
| 20 | Coverage check | With both tiers landed, `RUBRIC_TIER_UNCOVERED` fails if any of the 23 slugs lacks a rubric — proven by removing one | 7 (the `landed:` amendment, the 23-file counts, and the removal proof) |
| 21 | Gates | All twelve scenarios carry the cwd-and-containment contract | 3, 4, 6, 7 (file half, via the sibling's token rule), 8 (operator half) |
| 22 | Gates | No `infra_requirements:` anywhere under the copy, before **and** after each scenario | 3, 4, 6, 7 (file half), 8 (operator half + the halt). The sibling owns the token row and its rejecting input |
| 23 | Gates | No `.claude/` and no `.mcp.json` anywhere under the copy at any depth, before and after each scenario; halt writes no record; retained copy never re-entered as a cwd | 3, 4, 6, 7 (file half), 8 (operator half + the halt discipline + the containment-asserted neutralisation) |
| 24 | Gates | `npm test` passes at **every step** of the migration | 5, 6 — and the intermediate-commit perturbation in Task 2's table is the same discipline applied to the interlock. **Also 3, 4, 7:** the sibling-owned landed-tier test counts the real rubric and scenario roots, and every task that writes into them amends it in the same commit (11 → 16 → 18 → 21 → 23; see the cross-plan amendment schedule in Task Summary). Without those four amendments this criterion fails at Tasks 3, 4 and 6 |
| 25 | Gates | `npm run test:evals` passes at the step **immediately after** the deletion | 6 — pinned to that exact step, because `npm test` never reaches `tests/evals/` and is green over a dropped suite |
| 26 | Gates | Byte-identical `git status --porcelain --ignored=traditional --untracked-files=all` and unchanged `git rev-parse HEAD` at **every** `git worktree list --porcelain` root | 3, 4, 6, 7 (token half), 8 (capture, comparison, non-empty root set, console-only mismatch) |
| 27 | Gates | The copy is a `createTempGitRepo()` repository whose `rev-parse --show-toplevel` equals the realpathed copy root | 3 (scenario prose, all five; extended by 4, 6, 7), 8 (operator confirmation) |
| 28 | Gates | The Tier B sweep is wired to no automated or scheduled trigger | 8 — **no static backing.** Operator discipline until CI-integration supplies the automated halt; recorded rather than checked |
| 29 | Gates | Tier C is wired into no scheduled or CI trigger | 8 — **vacuously true on landing** and stated as such. No interim checker exists or is proposed; enforcement is handed whole to CI-integration |
| 30 | Gates | The Tier B pass is run by hand and recorded, with the write's three properties | 8 — **manual, no hosted assertion.** A once-per-pass write has no per-scenario token to hang on |
| 31 | Gates | No constitutional violations introduced | Quality Gates; the boundary check in Task Summary; Task 7's lifecycle-order note |

**Twenty-six of thirty-one are discharged by a test in a named task.** The five that are not:

> **Adjudicated and settled — this coverage accounting is honest, and the five undischarged rows are correctly marked.** Review examined whether "26 of 31" overstated the plan's coverage and confirmed it does not: each of the five is marked undischarged **with its reason stated**, none is quietly folded into a neighbouring row, and none of the five is undischarged for a reason the plan could have fixed and chose not to. The two rows that *exceed* the spec (#5's path-resolution half and #7's deny-list) are labelled as exceeding rather than counted as ordinary coverage, and the seven two-halved rows are labelled half-automated rather than automated. This is the accounting a reviewer should be able to trust by reading, which is what the table is for.

- **#4** — the spec itself says "verified by review". A plan cannot check that a document did not copy something; it can only record the obligation, which it does here.
- **#17** — an **inherited** obligation whose rule and host file belong to the sibling. Recorded here because a rule with one branch proven and one unproven can stop matching on the unproven branch without going red; Task 7 verifies rather than re-implements.
- **#28, #29** — both are "nothing is wired", and neither has a checker that could fail at v1. Stating them as unbacked is the honest form; a checker that cannot fail would read as coverage while providing none, which is this plan's named anti-pattern.
- **#30** — inherently manual: `scripts/run-tests.mjs` collects only `*.test.mjs` and this tier ships none under `tests/evals/`. Task 8 owns it, and its "falsify the pass itself" step is the closest thing to a guard the pass can have.

Seven further rows (#21–#23, #26, #27) are **two-halved**: the file half is a real assertion in a rubric task, the runtime half an operator obligation in Task 8. Read those as half-automated, not automated.

**Two rows exceed what the spec asks**, both per the plan's heuristic that a universal coverage claim must ship its predicate: #5's path-resolution half, and #7's deny-list, which the spec words as a property rather than a check.

**Owed back to the sibling, not silently absorbed:** the answer-key redaction list in `rubric-set-change-imminent.plan.md` Task 5 sizes six files. Four more label sites bear on **this** tier's citations — `shipping-rates.spec.md:82` and `tests/rates.test.mjs:7` (`spec-code-drift`, three elements each), `.context-index/governance/validate.yaml:11` (`esm-violation`, two elements) and `src/shipping/rates.mjs:17` (the caps-form `orphan-source-file` known-clean twin) — plus `shipping-rates.plan.md:66` (`plan-task-without-test`, one element) and `.context-index/governance/review.yaml:11`, which announces a plant without naming its class. Task 3 re-derives the list with `git grep -niE 'planted|known-clean'` rather than trusting either plan's enumeration; the adjacent-words form both plans previously used misses four of those sites because the class slug sits *between* the words, the text is hyphenated, or the twin is written in caps.

**Also owed to the sibling, in the other direction:** `test('the landed tier is complete at the real roots')` is the sibling's test, and this plan amends its counts four times (11 → 16 → 18 → 21 → 23) rather than duplicating or replacing it. The coupling is stated in Task Summary's cross-plan amendment schedule and again at Task 7's test 4, so a reader arriving from either plan finds it. Contrast criterion #17, which belongs to the other **spec** and is verified rather than edited.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (`node scripts/run-tests.mjs`) — the project's single gate, and the `id: test, tier: fast` entry in `.context-index/governance/gates.yaml`
- **And `npm run test:evals` passes** — this plan is the first in the charter to need it as a gate rather than a note, because Task 5 relocates two suites the default bucket cannot see and Task 6 deletes a tree it also cannot see. Green at Task 5's commit and again immediately after Task 6's
- The extended guard is still in the default bucket: `node scripts/run-tests.mjs --list` lists `tests/lib/evals/rubric-coverage.test.mjs`
- The tier's data is still **not**: `node scripts/run-tests.mjs --evals --list` lists nothing under `tests/evals/skill-regression/`. The absence is expected and pinned. It **does** list both suites under `tests/evals/token-optimization/token-budget-eval/`, at their new paths and at no old one
- The fixture's own guards stay green: `tests/lib/evals/skill-regression-hermeticity.test.mjs` passes with **zero** diff — this tier consumes the fixture and must not loosen it. `tests/lib/evals/skill-regression-catalog.test.mjs` is modified in exactly one place, Task 2's pin, and `git diff --stat` on it reports that one hunk and no other
- `git ls-files tests/evals/skill-compression` returns nothing, and `git ls-files tests/evals/token-optimization/token-budget-eval` returns exactly two paths
- `git grep -n 'skill-compression'` returns hits only under `.context-index/`, in `CHANGELOG.md`, in `.beads/` — the three history-bearing paths, never rewritten (CHANGELOG is release-please-generated per ADR-0008) — and in `tests/lib/evals/rubric-coverage.test.mjs`, the fourth exemption, which is the file that declares `RUBRIC_LEGACY_SURVIVES`'s `legacyRoots` and must keep the token by design. Exempt by **exact path**, not by prefix
- Every guard has been proven able to fail: each task's falsification table is recorded in its commit body. Across the plan that is roughly ninety perturbation rows, seventeen of them Task 1's. **Not all ninety are guards.** Four rows are labelled **observation, not a guard** — Task 5's "Retarget target" and "Discovery", Task 6's "`test:evals` timing", and Task 7's "Export vs per-invocation" — each of which honestly declares that *nothing goes red* and exists to record a known unbacked property rather than to prove an assertion can fail. Task 8's table is manual throughout and its trips are operator confirmations, not automated reds. Read the ninety as ~86 guards plus four recorded observations; a bare "ninety perturbations" would overstate the automated coverage, which is the same anti-pattern this plan names elsewhere
- No inline Node added to any SKILL.md: `.githooks/pre-commit` → `hooks/pre-commit-no-inline-node.sh` (exit 2 = policy violation). No task touches a SKILL.md body, so this gate is expected to be a no-op — recorded so a surprise is visible
- Source manifest complete and stamped: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md`
- All 31 acceptance criteria from spec revision 13 accounted for in the Spec Coverage Map, with the five undischarged rows (#4, #17, #28, #29, #30) explicitly marked
- Zero new external dependencies (constitution Principle 1). **Zero new production modules and zero new CLI verbs** — five non-test files change and every change is a comment or a config line, with no `.mjs` gaining or losing executable logic
- No version bump in `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` (ADR-0008 — release-please owns those). Task 6 edits `package.json`'s `scripts` block only

`.context-index/governance/gates.yaml` exists; where its definitions differ from the constitution's Quality Gates block, `gates.yaml` wins. Probabilistic gates with no command are noted as skipped by `/adev:validate` rather than run here.

**Not gated here, deliberately:**

- **No gate asserts an automated scenario run.** Nothing in this tier executes a scenario, and `npm run test:evals` discovers nothing for `skill-regression/`. Naming it as this tier's trigger would be a claim that fails the moment anyone checks. It becomes discoverable when the CI-integration capability ships a driver — at which point the sibling's `--evals --list` emptiness assertion goes red, which is the intended signal.
- **No gate asserts a Tier C run.** Tier C is wired to no scheduled or CI trigger until the budget-threshold capability lands. This tier contributes **50** of the projected 86 nightly dispatches when it does — a projection, not a contract: only the floors are enforced, putting the enforced envelope at 36–72 for this tier against 33–66 for the sibling.
- **The three additional rules cover this charter's two rubric roots and nothing else.** The 21 legacy-shaped rubrics under `configurable-governance/`, `data-engineering/`, `integration-sandbox/`, `work-tracking/` and `worktree-parallelization/` are **out of scope by argument, not by oversight**: the charter's Out of Scope assigns `data-engineering`'s six to `eval-projects` by name, `worktree-parallelization/rubrics/parallel-implement.yaml` belongs to that charter's `equivalence-eval.spec.md`, and the remaining fourteen are assigned to no charter at all. A repo-wide shape scan would go red on landing in the gate this plan's own `npm test` criterion depends on. Task 1 ships the must-not-fire proof so the scoping is an assertion rather than a paragraph.
- **`issue-dzxjoa` is not resolved by this plan.** It is a spec-level decision about the fixture. Task 3 names the six elements that depend on its outcome, phrases every one against the catalog's `detect_when` so either resolution drops in cleanly, ships the delete-the-label falsification row that decides it from evidence, and sizes the redaction at twelve label sites across ten files, comment-only, inside `tests/evals/` should this tier end up owning it. The site list is re-derived at execution time with `git grep -niE 'planted|known-clean'`, never with the adjacent-words form, which misses four in-scope sites.
- **The pass-ordering claim in `rubric-legacy-scale.test.mjs` is preserved, not flagged.** It loses its only real input to the retirement, and after Task 6 no composite-shaped file remains anywhere in the repository, so the claim would become permanently unfalsifiable. Review adjudicated the earlier "flag it and let review decide" posture as insufficient: Task 5 **lands** `tests/fixtures/evals/rubrics/legacy-composite-shape.yaml` and a test asserting `RUBRIC_NESTED_MAP` precedes `RUBRIC_LEGACY_SCALE` on it. One committed YAML, zero production code, and the fixture sits outside both `RUBRIC_LEGACY_SURVIVES` roots so it cannot trip that rule.
