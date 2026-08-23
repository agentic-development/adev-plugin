# Implementation Plan: Rubric Set — Change-Imminent Tier

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md (revision 15)
> **Sibling plan (executed, proven shape):** .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.plan.md
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, `node:test`

**Goal:** Ship a regression baseline for the eleven change-imminent skills — `tiers.yaml`, eleven rubrics, eleven scenarios, and one Tier A conformance test with a rejecting input per rule — so that when any of those eleven is demoted, merged, or compressed, the cost of the change is measurable against what the skill does *today*.

**Architecture:** This tier is rubric **content**, not machinery. The loader (`lib/evals/rubric.mjs::loadRubric`), the scoring engine (`lib/evals/score.mjs`), the CLI verb (`adev eval score`) and the hermetic fixture (`tests/evals/skill-regression/`) all shipped already. What lands here is: a four-bucket tier manifest that makes "every skill is accounted for" a decidable question; twenty-two authored data files; `lib/evals/rubric-coverage-codes.mjs`, the eleven code strings as a frozen array (data, per ADR-0019 Part A — see Task 1); and `tests/lib/evals/rubric-coverage.test.mjs`, a static conformance check in the **default** `npm test` bucket that applies eleven `RUBRIC_*` rules on top of everything `loadRubric` already enforces. Nothing here executes a scenario. The scenarios are markdown procedures an operator performs by hand, and the coverage test reads them for **token presence, never meaning** — that is the honest limit of a static check over prose, and the plan does not pretend past it.

**The two halves rule.** Every runtime obligation in this spec is split in two: the **scenario file must state the step** (checked by `RUBRIC_SCENARIO_STEP_MISSING`) and the **operator performs the assertion** during the manual Tier B pass (Task 9). A task that lands only the file half has landed half a criterion, and the Spec Coverage Map marks which half each task discharges. The one stated exception is baseline fidelity, whose text half is absent by design.

**Review notes carried into this plan:** none — the spec reached `review-passed` at revision 15 and this is the plan's first authoring. Three items below are the plan author's own judgement rather than the spec's text. One is now **decided**: the `RUBRIC_*` code registry ships in `lib/` per ADR-0019 Part A (Task 1). Two remain flagged for `/adev:implement` review at the point they land: the `scripts/` scenario-setup helper's absence from the spec's Required Files table (Task 4), and the answer-key redaction (Task 5, gated on `issue-dzxjoa`).

---

## File Structure

**Create — tier manifest and conformance test:**

- `tests/evals/skill-regression/tiers.yaml` — five top-level keys: `landed`, `change_imminent`, `core_lifecycle`, `remaining`, `uncovered`. Comma-joined scalars, no lists, no `tiers_version`. The four buckets partition `ls skills/` (31 directories) exactly
- `tests/lib/evals/rubric-coverage.test.mjs` — the eleven `RUBRIC_*` rules, each with its own rejecting input; roots (`rubricRoot`, `scenarioRoot`, `tiersPath`) are **parameters defaulting to the two real ones**, so the rejecting cases can be built at all
- `lib/evals/rubric-coverage-codes.mjs` — the eleven `RUBRIC_*` code strings as a frozen array and nothing else. Per ADR-0019 Part A and the `lib/evals/catalog-codes.mjs` precedent (see Task 1). A frozen constant array is **data**, not the machinery the spec bars; the validator (`checkRubricSet`) stays in `tests/`

**Create — rubrics (11 files under `tests/evals/skill-regression/rubrics/`):**

- Detectors: `codehealth.yaml`, `repomap.yaml`, `document.yaml`
- Producers: `deploy.yaml`, `sync.yaml`, `learn.yaml`, `issues.yaml`, `eval.yaml`, `assess.yaml`, `prototype.yaml`
- Responder: `using-adev.yaml`

**Create — scenarios (11 files under `tests/evals/skill-regression/scenarios/`):**

- One per rubric, same stem: `codehealth.md`, `repomap.md`, `document.md`, `deploy.md`, `sync.md`, `learn.md`, `issues.md`, `eval.md`, `assess.md`, `prototype.md`, `using-adev.md`

**Create — scenario setup helper:**

- `scripts/eval-scenario-setup.mjs` — the thin helper the scenario prose names. Builds the run copy (`createTempGitRepo()` zero-argument, `cpSync` flat), splices `tasks.db_path` into the copy's manifest as a **text splice**, and creates the sibling `outputs/` root. **Flagged:** the spec's Scenarios section requires the scenarios to name a `scripts/` helper ("no CLI verb wraps `createTempGitRepo` or `cpSync`, the constitution bars `node -e`") but its Required Files table omits it. See Task 4's note

**Create — Tier B pass record:**

- `.context-index/evals/tier-b-<YYYY-MM-DD>-01.md` — the first manual Tier B record. The naming, collision (`{flag: 'wx'}`, existence pre-check, `-01` upward) and discovery (`glob tier-b-*.md` in name order) convention lands with this tier; the core tier inherits it

**Modify:**

- Nothing. This tier adds no CLI verb and no dependency, and touches no existing production file. Its two **new** non-test production files are `lib/evals/rubric-coverage-codes.mjs` (Task 1, a frozen data array) and `scripts/eval-scenario-setup.mjs` (Task 4). `tests/lib/evals/rubric-coverage.test.mjs` is created once (Task 1) and extended by Tasks 2, 3, 4 and 8

**Reference (read, do not modify):**

- `lib/evals/rubric.mjs` — `loadRubric`, `assertNoNestedMaps` (`:226`, module-private), the `RUBRIC_SOURCE_PATH_ESCAPE`-adjacent containment ordering
- `lib/evals/rubric-schema.mjs` — `REQUIRED_TOP_LEVEL_KEYS` (twelve), `OPTIONAL_TOP_LEVEL_KEYS` (`skill`, `scenario`, `budget_max_*`), `ELEMENT_VERDICTS`, `CRITERION_VERDICTS`, `REQUIRED_ELEMENT_FIELDS`, `REQUIRED_CRITERION_FIELDS`, `RUBRIC_ERROR_CODES`
- `lib/evals/score-schema.mjs` — `HALF_STATUSES`, referenced by the `eval` rubric
- `lib/evals/catalog-codes.mjs` — `CATALOG_ERROR_CODES`; the shape this tier's own code registry imitates
- `skills/eval/default-rubric.yaml` — the exemplar. Every field shape and every point budget comes from here verbatim
- `tests/evals/skill-regression/catalog.yaml` — `catalog_id: "skill-regression"`, `fixture_root: "project"`, ten PV/KC pairs. The six citations this tier makes are `PV-03/KC-03`, `PV-04/KC-04`, `PV-05/KC-05` (`codehealth`), `PV-03/KC-03`, `PV-04/KC-04` (`repomap`), `PV-08/KC-08` (`document`)
- `tests/lib/evals/skill-regression-catalog.test.mjs` — `CATALOG_UNRESOLVED_CITATION` scans `rubrics/*.yaml` from the catalog side; this tier mints no alias
- `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the write-escape equality and board-containment properties this tier must not break
- `tests/helpers.mjs:43,58,108` — `createTempDir`, `cleanupTempDir`, `createTempGitRepo`
- `lib/path-safety.mjs` — `resolveContained`, `lenientRealpath`, `isContained`
- `lib/extensions/governance-splice.mjs` — the text-splice rationale and its seven on-disk forms; Task 4 **widens** form 2 deliberately
- `lib/extensions/governance-values.mjs:92` — `ARGV_TOKEN`'s plain-word branch, the source of the `^[A-Za-z0-9._/-]+$` literal
- `lib/issues/resolve-root.mjs:30,33` — `resolveStorageRoot` returns `tasks.db_path` verbatim, then falls back to `git rev-parse --git-common-dir`
- `lib/worktree.mjs::resolveMainRoot` — the anchor for `git worktree list --porcelain`
- `lib/cli/prototype.mjs` — records that `startServer`'s `close()` is not callable from a one-shot CLI
- `scripts/run-tests.mjs` — `--list`, `--evals`, `isNestedProjectFile`

---

## Context Packets

### Tasks 1–3 Context (the conformance test)
- Spec: `rubric-set-change-imminent.spec.md` — "The shared per-skill rubric contract", "`tiers.yaml`", "Who executes a scenario" (the token table), "Conformance Rules"
- Source: `lib/evals/rubric.mjs` (full), `lib/evals/rubric-schema.mjs` (full), `lib/path-safety.mjs` (full), `lib/profiles/yaml.mjs` (parser limits — flat only, comments discarded)
- Sample: `tests/lib/evals/skill-regression-catalog.test.mjs` — the house pattern for a rejecting-input test, and the `rubricRoots`-as-parameter pattern this test copies
- Reference: `lib/evals/catalog-codes.mjs` — the registry shape, and ADR-0019 Part A
- Constraint: the spec says this tier introduces **no new library module**; Task 1's registry note records the decision to read that as barring machinery, not a frozen data array, and to follow ADR-0019 Part A
- Heuristic: "A universal coverage claim must ship with the predicate that checks it" — every "every scenario states X" claim in this plan names the glob and the match

### Task 4 Context (scenario setup helper)
- Spec: "Scenarios" — the three setup steps, the flat-copy argument, the `tasks.db_path` splice and its refusal set
- Source: `tests/helpers.mjs:108` (`createTempGitRepo`), `lib/extensions/governance-splice.mjs` (the seven forms and `GOVERNANCE_PARSE_REFUSED`), `lib/extensions/governance-values.mjs::assertSafeScalar`, `lib/profiles/yaml.mjs` (`parseMap`'s `unexpected indentation` throw)
- Constraint: Node built-ins only (constitution principle 1). No `cp -R`, no reserialization, no `node -e`

### Tasks 5–8 Context (rubric and scenario authoring)
- Spec: "The Eleven Rubrics" (the row table), "`source` values, and the two kinds of skill in this tier", "Rubrics that must assert against their own output contract", "Running a Scenario Safely" (six properties), "Baseline fidelity"
- Exemplar: `skills/eval/default-rubric.yaml` — field shapes verbatim
- Fixture: `tests/evals/skill-regression/catalog.yaml` and the `project/` tree — every `artifact:` path must exist there
- Skills under test: `skills/<slug>/SKILL.md` for each of the eleven, read as the **current** behaviour the rubric describes. A rubric row describing an intended future is a defect
- Constraint: flat values only; `assertNoNestedMaps` rejects a nested map at load with `RUBRIC_NESTED_MAP`

### Task 9 Context (Tier B pass)
- Spec: "Running a Scenario Safely" (all six properties), the Gates acceptance criteria, "Required Files" row one
- Reference: `.context-index/reports/codehealth-<YYYY-MM-DD>.md` — the same-day-overwrite convention this record deliberately **diverges** from
- Constraint: the record is written strictly **after** the final status comparison, then committed

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When a task claims "every scenario states X" or "every rubric satisfies Y", state the executable check alongside the claim — the exact glob, the exact match, and the paths it runs over. Assert the iterated set is non-empty.
- **Anti-pattern:** Widening to "no occurrence anywhere". An unbounded universal cannot be discharged and reads as coverage while providing none.
- **Applies to:** Tasks 2, 3 and 8 — every `RUBRIC_*` rule names the root it globs (`tests/evals/skill-regression/rubrics/*.yaml`, `.../scenarios/*.md`) and asserts that glob returned 11 entries before asserting anything about their contents. A token check over zero files passes.

### Watch a new test fail before trusting it (confidence: high)
- **Pattern:** A passing guard is not evidence. Reintroduce the defect, confirm the named assertion goes red, and confirm the probe actually applied.
- **Anti-pattern:** "Verify test passes" as the terminal step. Twenty of this plan's assertions are token-presence checks over prose authored correct at the same commit — exactly the condition under which a check that matches nothing still passes.
- **Applies to:** every task. Each carries an explicit perturbation table naming which assertion must go red.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4
  All four either create or extend `tests/lib/evals/rubric-coverage.test.mjs`; Task 4's helper must exist before any scenario can name it. Running any two concurrently is a merge conflict, not a speedup.
- Group B (independent): Task 5, Task 6, Task 7
  Disjoint rubric and scenario files, no shared file, and each is validated by the checker Group A already landed. This is the only real concurrency in the plan.
- Group C (sequential): Task 8 → Task 9
  Task 8 lands the last two data files and flips the checker onto the real roots; Task 9 is the manual Tier B pass over the completed set and cannot start before it.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | `tiers.yaml` + the four tier-manifest rules | medium | unit | — | 3 create, 0 modify |
| 2 | The six shared-contract rules + rejecting inputs | medium | unit | Task 1 | 0 create, 1 modify |
| 3 | `RUBRIC_SCENARIO_STEP_MISSING` — twenty token branches | large | unit | Task 2 | 0 create, 1 modify |
| 4 | Scenario setup helper + the splice refusal set | medium | unit | Task 3 | 1 create, 1 modify |
| 5 | Detector rubrics + scenarios (3 skills) | large | unit | Task 4 | 6 create, 0 modify |
| 6 | Producer rubrics + scenarios, state writers (4 skills) | large | unit | Task 4 | 8 create, 0 modify |
| 7 | Producer rubrics + scenarios, reporters (3 skills) | large | unit | Task 4 | 6 create, 0 modify |
| 8 | Responder rubric + scenario; flip the checker onto the real roots | medium | unit | Tasks 5, 6, 7 | 2 create, 1 modify |
| 9 | The manual Tier B pass + the record convention | medium | manual | Task 8 | 1 create, 0 modify |

All nine tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `tests/**` paths), except Task 9, which runs no automated test at all and is marked `manual` for that reason. Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:`, so the Test Infrastructure Requirements section is omitted as well.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). One suite, `tests/lib/evals/rubric-coverage.test.mjs`; the per-behaviour unit is the conformance rule, and each rule is its own `test()` — with `RUBRIC_SCENARIO_STEP_MISSING` split further into one `test()` per token row, per the spec's explicit per-branch obligation.

**On task sizing.** Tasks 5, 6 and 7 create six to eight files each, above the plan reviewer's five-file guidance. **Every one of those files is committed test data under `tests/evals/skill-regression/`**, which the guidance excludes — the rule exists because a subagent editing many *production* files loses context and half-implements. The **non-test production-file count is 2 for the entire plan**: `lib/evals/rubric-coverage-codes.mjs` in Task 1 (a frozen data array — no functions, no I/O, no imports) and `scripts/eval-scenario-setup.mjs` in Task 4. Nothing else outside `tests/` is created or modified.

The spec's task map has five tasks, three of them "large". This plan splits them nine ways:

- The spec's task 1 ("`tiers.yaml` and the coverage test … all eleven conformance rules") becomes **Tasks 1, 2 and 3**. Eleven rules with a rejecting input each — and `RUBRIC_SCENARIO_STEP_MISSING` alone owing twenty rejecting inputs, one per token row — is not one reviewable unit. The seam is natural: Task 1's four rules read `tiers.yaml` and the filesystem; Task 2's six read YAML rubric structure; Task 3's one reads markdown prose and is the only rule in the set that does.
- The spec's task 3 ("Producer rubrics + scenarios (7)") becomes **Tasks 6 and 7**, split on what the scenario *does to the copy*: Task 6 is the four skills that write project-relative state into the copy (`deploy`, `sync`, `learn`, `issues`) and therefore share property 4's argument; Task 7 is the three that produce a report or a tree (`eval`, `assess`, `prototype`), one of which starts a server and carries five extra tokens of its own. Splitting on kind rather than alphabetically means each task's falsification table is about one mechanism.
- **Task 4 is new** — the spec names a `scripts/` helper in the Scenarios section but omits it from Required Files. It is extracted rather than folded into the scenario tasks because all eleven scenarios name it and it carries the splice refusal set, which needs its own rejecting inputs.
- **Task 9 is new** — the Gates section owes eight operator-half criteria that no automated artifact discharges. Left implicit they would ship as unperformed checkboxes; as a task they have an owner and a written record.

Splitting further would produce tasks with data but no assertion to turn green.

**Ordering, and why every commit stays green.** `RUBRIC_TIER_UNCOVERED` applied to the real roots is red until the eleventh rubric lands. Rather than park it red across seven commits, Tasks 1–3 prove every rule against **synthetic roots in a temp directory** — the parameterisation the spec already requires for the `ADEV_NO_INFRA` branch — and **Task 8** adds the single real-root application once all eleven files exist. `tiers.yaml` ships with `landed: "change_imminent"` from Task 1 (the spec pins that literal); it is the *application to the real roots*, not the manifest value, that is deferred. Every commit leaves `npm test` green, and no task parks a known-red assertion for a later task to satisfy.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`.

**Constitution boundary check:** no task creates a service, touches auth, changes the hook protocol, alters the CLI installation path structure, changes the plugin registration format, or adds a dependency. Tasks 1–3 and 5–8 add tests and committed test data (explicitly autonomous). Task 4 adds one zero-dependency `scripts/` helper using Node built-ins only. Task 9 writes one markdown record under `.context-index/evals/`. **No task touches a SKILL.md**, so `hooks/pre-commit-no-inline-node.sh` is a no-op throughout — recorded so a surprise is visible. **No task bumps `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json`** — release-please owns those (ADR-0008).

---

### Task 1: `tiers.yaml` + the four tier-manifest rules [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/tiers.yaml` (committed test data)
- Create: `lib/evals/rubric-coverage-codes.mjs` (frozen data array — see the registry note below)
- Create: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** the four rules decided by `tiers.yaml` and the filesystem alone — `RUBRIC_TIER_INCOMPLETE`, `RUBRIC_TIER_ORPHAN`, `RUBRIC_LANDED_INVALID` (two branches), `RUBRIC_TIER_UNCOVERED` (synthetic roots only; the real-root application lands in Task 8). The six YAML-structure rules are Task 2's and the markdown rule is Task 3's.

**Context to load:** the Tasks 1–3 Context Packet.

- [ ] **Write failing test**

Create `tests/lib/evals/rubric-coverage.test.mjs` exporting an internal `checkRubricSet({ tiersPath, rubricRoot, scenarioRoot, skillsRoot })` whose four arguments **default to the four real paths** and whose return is `{ errors: [{ code, detail }], checked: Set<string> }`. The parameterisation is not a convenience: the spec requires it (`rubric-coverage.test.mjs` takes its rubric and scenario roots as parameters defaulting to the two real ones), and several rejecting cases cannot be built otherwise.

Declare the eleven codes as a frozen array in `lib/evals/rubric-coverage-codes.mjs` and import it here, and assert every rule's `checked` counter was reached — the same "every rule was reached" pattern `skill-regression-catalog.test.mjs` uses, so deleting a branch goes red on the counter as well as on its rejecting fixture.

> **Registry placement — decided: ADR-0019 wins over the spec's sentence.** ADR-0019 Part A makes an error-code set a lib constant. `lib/evals/catalog-codes.mjs:9-15` states the rule and names *this very test* as a future importer — "the change-imminent tier's rubric-coverage test (not yet written) will read this array rather than re-spelling the strings, which is what makes 'one emitted code, one spelling' a construction rather than a convention." That precedent also draws the boundary this tier needs: the **validator** stays in `tests/` (`tests/lib/evals/catalog-validator.mjs`) and only the frozen code array lives in `lib/`.
>
> So do the split **here, in Task 1**, not later: Tasks 2, 3, 4 and 8 all import the array, and a deferred move would touch four commits instead of one. `lib/evals/rubric-coverage-codes.mjs` holds the eleven strings and nothing else — no functions, no I/O, no imports, the same shape as `lib/evals/score-schema.mjs`. `checkRubricSet` and its eleven branches stay in the test file.
>
> The spec's "introduces **no new CLI verb and no new library module**" is satisfied on both halves: no CLI verb, and a frozen constant array is **data**, not a library module in the sense the sentence protects — which is machinery a caller invokes. Record this reading in the commit body so review sees the deviation was reasoned rather than overlooked.

Rules, each its own `test()`:

1. **`RUBRIC_TIER_INCOMPLETE`** — the four buckets partition `readdirSync('skills/', { withFileTypes: true }).filter(d => d.isDirectory())` **exactly**: every directory appears in exactly one bucket, and no bucket token names a directory that does not exist. Assert the enumerated directory set is non-empty and has 31 members, and assert the union of the four buckets equals it as a set comparison in both directions — a one-way subset check passes on a bucket that lists nine of eleven.
2. **`RUBRIC_TIER_ORPHAN`** — every `rubrics/*.yaml` stem appears in some bucket. Glob the rubric root; assert the glob is non-empty in the synthetic case (in the real case at this task's landing state it is legitimately empty, which is why the real-root application waits for Task 8).
3. **`RUBRIC_LANDED_INVALID`** — **two disjoint branches, each with its own rejecting input**: (a) a `landed:` token naming no declared bucket key (`core_lifecycl`); (b) a `landed:` token that is the literal `uncovered`.
4. **`RUBRIC_TIER_UNCOVERED`** — for every bucket key named in `landed:`, every slug in that bucket has a `rubrics/<slug>.yaml`. Prove it on a synthetic tiers file + rubric root: `landed: "b1"`, bucket `b1` with two slugs, one rubric file present — fires once, naming the missing slug. Prove the negative too: a bucket **absent** from `landed:` with no rubric files must **not** fire.

Also assert the artifact shape of the real `tiers.yaml`: it parses under `parseYaml`, carries exactly five top-level keys, carries no `tiers_version`, every **bucket** token matches `^[a-z][a-z0-9-]*$`, and `landed:` is the literal `change_imminent`. State the predicate: `Object.keys(parseYaml(read(tiersPath)))` sorted, compared to the literal five-element array.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — `tests/evals/skill-regression/tiers.yaml` does not exist, so the shape assertions throw on a missing path and the partition check has nothing to partition.

- [ ] **Implement**

Author `tiers.yaml` exactly as the spec's Structural Shape block declares it — comma-joined scalars, no lists, `landed: "change_imminent"`, and the four buckets summing to all 31 directories under `skills/` (11 + 12 + 7 + 1). Then implement the four rule branches until the suite is green.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS — four rules, five rejecting inputs (two for `RUBRIC_LANDED_INVALID`), one negative case, and the `tiers.yaml` shape assertions.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| `RUBRIC_TIER_INCOMPLETE`, missing slug | `mkdir skills/zzz-probe` | the partition test, naming `zzz-probe` (this is acceptance criterion 31's own case — keep it as a shipped rejecting fixture over a synthetic `skillsRoot`, not a one-time `mkdir`) |
| `RUBRIC_TIER_INCOMPLETE`, phantom slug | add `nonexistent` to `remaining` | the partition test, naming `nonexistent` — a *different* branch from the one above |
| `RUBRIC_TIER_INCOMPLETE`, double-listed | add `codehealth` to `remaining` as well | must fire; a set-union check that ignores multiplicity would pass here |
| directory-set non-emptiness | point `skillsRoot` at an empty temp dir | the non-empty assertion must fail. It cannot fail *alone*: with 31 bucketed slugs and zero directories on disk, `RUBRIC_TIER_INCOMPLETE`'s phantom-slug branch fires 31 times as well. Either write the non-empty check to **short-circuit** — return before the partition branch runs — and assert `errors` is exactly the one non-emptiness code, or assert only that the non-emptiness code is present and make no "not the partition" claim |
| `RUBRIC_TIER_ORPHAN` | synthetic rubric root with `nosuchskill.yaml` | fires once |
| `RUBRIC_LANDED_INVALID` (a) | `landed: "core_lifecycl"` | fires |
| `RUBRIC_LANDED_INVALID` (b) | `landed: "change_imminent,uncovered"` | fires — and must fire on branch (b), not (a) |
| `RUBRIC_TIER_UNCOVERED` positive | remove one rubric from the synthetic root | fires naming that slug |
| `RUBRIC_TIER_UNCOVERED` negative | add slugs to a non-`landed` bucket with no rubrics | must **not** fire; if it does, the rule is bucket-agnostic in the wrong direction |
| five-key shape | add `tiers_version: 1` to `tiers.yaml` | the key-count assertion fails |

Revert each. Record the ten confirmations in the commit body.

- [ ] **Commit**

`test(eval-harness): add skill-regression tiers.yaml and the four tier-manifest conformance rules`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 1`

---

### Task 2: The six shared-contract rules + rejecting inputs [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** the six rules that read a rubric's YAML structure. All six operate on a synthetic rubric root built from a conforming baseline mutated in **exactly one way** — a rejecting fixture that trips two rules does not prove the rule it names.

**Context to load:** the Tasks 1–3 Context Packet.

- [ ] **Write failing test**

Build a `makeConformingRubric(slug)` factory in the test file (five `required_elements`, three `quality_dimensions`, the shipped point budgets, both `exclude_from_denominator` policies, `insufficient_evidence_threshold_percent: 40`) and mutate it per case. Each case asserts `errors` contains its code **and no other**.

5. **`RUBRIC_ID_MISMATCH`** — `rubric_id !== 'skill-regression-' + stem`, **or** `skill !== stem`. **Two branches, two rejecting inputs**: a wrong `rubric_id` with a correct `skill`, and the reverse. One input cannot prove both.
6. **`RUBRIC_SCENARIO_MISSING`** — the `scenario` key names no file under `scenarioRoot`. The rule checks **existence and containment only**; it does not read the file (that is Task 3's rule, with its own code).
7. **`RUBRIC_SOURCE_PATH_ESCAPE`** — an `artifact:` source, or a `scenario` value, resolves outside its base (`fixture_root` and `scenarioRoot` respectively). **Escape is decided before existence**, and both sides are realpathed: `resolveContained` for the lexical pre-check, then `isContained(lenientRealpath(candidate), lenientRealpath(base))`, with the base realpathed first — on macOS the temp base is reached through `/var` → `/private/var`, so handing a raw base to the lexical step fails closed on every candidate. **Three rejecting inputs**: an `artifact:` value of `../../../../etc/definitely-not-here` (must report escape, **not** absence, on a machine where the target does not exist); a `scenario` value of `../../../../etc/passwd`; and a **symlinked base** acceptance case — symlink the temp base, point the root through the link, and assert a legitimate in-base path is **not** reported as an escape.
8. **`RUBRIC_ELEMENT_FLOOR`** — fewer than 5 `required_elements`, or `quality_dimensions` outside 3–6. **Three rejecting inputs**: 4 elements; 2 criteria; 7 criteria. The boundary values 5, 3 and 6 each get an accepting case, so an off-by-one in the comparison goes red.
9. **`RUBRIC_EXCEPTION_ID_MALFORMED`** — either issue-id key, `baseline_exception_issue` or `spec_behaviour_gap_issue`, is present and fails `^[a-z][a-z0-9-]*-[0-9a-z]+$`. **Two rejecting inputs, one per key** — the spec makes this explicit so neither branch can stop matching without going red. Add a third case: the key **absent** must not fire (the rule is present-and-malformed, not required).
10. **`RUBRIC_TWIN_UNCITED`** — a rubric cites `skill-regression:PV-nn` without also citing its `KC` twin. Resolve the twin through `catalog.yaml`'s `twin:` field rather than by string arithmetic on the id, so a catalog that ever renumbers does not silently un-pair. **Two rejecting inputs**: `PV-03` cited alone; `PV-03` cited with the *wrong* twin (`KC-04`). Accepting case: `PV-03` + `KC-03`.

Also, per the heuristic: every rule that globs a root asserts the glob returned a non-zero count before asserting anything about contents.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the six branches do not exist in `checkRubricSet`, so every rejecting fixture returns an empty `errors` array; in particular the escape-before-existence case returns nothing rather than `RUBRIC_SOURCE_PATH_ESCAPE`.

- [ ] **Implement**

Extend `checkRubricSet` with the six branches. Load every rubric through `lib/evals/rubric.mjs::loadRubric` **first** and let its own codes surface unmodified — the tier's rules sit *on top of* the loader's, never in place of them. Where a rule needs a resolved path, consume the value the escape check already produced rather than re-deriving one.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS — Task 1's four rules plus these six, thirteen rejecting inputs and five accepting boundary cases.

- [ ] **Falsify each guard**

For each of the six rules, **delete its branch** from `checkRubricSet` and confirm that **exactly the rejecting fixtures belonging to that rule** go red. Scope the count to rejecting fixtures: deleting a branch also zeroes its `checked` counter, so the per-rule reachability assertion goes red on every deletion by design and counting total failures would misfire six times out of six. Two rejecting fixtures from *different* rules going red means one fixture is not isolating what it claims.

Then the ordering probe, which no branch deletion proves: reorder `RUBRIC_SOURCE_PATH_ESCAPE` to test existence before containment and confirm the traversal case reports absence rather than escape — that is the assertion that proves the ordering is real and not incidental.

- [ ] **Commit**

`test(eval-harness): add the six shared-contract rubric conformance rules with rejecting inputs`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 2`

---

### Task 3: `RUBRIC_SCENARIO_STEP_MISSING` — twenty token branches [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** the eleventh rule, and the only one in the set that reads markdown rather than YAML. The spec's obligation is **per token branch, not per rule**: "a rule-level proof lets any single token check be dropped without going red." Twenty rows, twenty rejecting inputs.

This task is large and stays one task because splitting a single rule's branch table across commits would leave the rule half-proven at a commit boundary — the exact "can be dropped without going red" state the obligation exists to prevent.

**Context to load:** the Tasks 1–3 Context Packet, with the spec's token table read in full.

- [ ] **Write failing test**

Declare the token table **as data** in the test file — `{ token, scope }` where `scope` is `'every'`, a slug list, or `'prototype'` — and drive both the checking loop and the rejecting-input loop from that one array. This is what keeps the twenty-branch obligation from drifting: adding a row adds both a check and a rejecting case, and the test asserts `TOKEN_TABLE.length` against a pinned literal so a silently deleted row goes red.

Fourteen tokens are required in **every** scenario:

| # | Token |
|---|---|
| 1 | `createTempGitRepo` |
| 2 | `flat copy of fixture_root contents into <copy-root>` |
| 3 | `tasks.db_path` |
| 4 | `cwd: realpath(<copy-root>)` |
| 5 | `isContained under <copy-root>` |
| 6 | `artifact: sources re-resolved under <copy-root> after the run` |
| 7 | `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` |
| 8 | `copy root matches ^[A-Za-z0-9._/-]+$ before any typed command` |
| 9 | `teardown deletes only the two mkdtempSync-returned roots` |
| 10 | `tasks.backend: json survives the splice, and the manifest's comments survive it` |
| 11 | `db_path read back as <copy-root>` |
| 12 | `no infra_requirements: in the copy` |
| 13 | `no .claude/ or .mcp.json anywhere under <copy-root>` |
| 14 | `git status and rev-parse HEAD equality at every worktree root` |

Five are required in the `prototype` scenario only: `kill <recorded-pid>`, `loopback`, `recorded PID and bound port each match ^[0-9]+$ before any typed command`, `no listener on <port> after teardown`, `scored tier: non-functional`.

One is required in the `build` and `work` scenarios only: `ADEV_NO_INFRA=1 in the step's own env`. **Neither scenario is authored by this tier**, so its rejecting input lands here against a **synthetic `build`-shaped scenario fixture** under a temp `scenarioRoot` — a branch whose only real inputs live in another tier would otherwise ship dead, and a dead branch can be dropped without going red.

The check is **literal substring presence, never meaning**. Say so in a comment at the table: a scenario naming every step in the wrong order still passes, and that is the honest limit of a static check over prose. The operator's half is Task 9.

The predicate, stated executably per the heuristic: for each `f` in `readdirSync(scenarioRoot).filter(n => n.endsWith('.md'))`, and for each row whose scope selects `basename(f, '.md')`, `readFileSync(f, 'utf8').includes(row.token)` must be true. The **non-empty** precondition is asserted per call, over whatever root that call was handed.

**Task 3 never invokes `checkRubricSet` with default roots** — stated explicitly, because a Task 3 that did would ship red at its own commit. `tests/evals/skill-regression/rubrics/` and `tests/evals/skill-regression/scenarios/` **do not exist yet** at this task's landing state: the real scenario root holds zero `.md` files until Task 5 lands the first three, and exactly eleven only once Task 8 lands. So "non-empty" is a property of each synthetic root this task builds in a temp directory, **not** a standing claim about the real root, and "exactly eleven at the real root" belongs to Task 8, which is the plan's first invocation with defaults.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the branch does not exist, so all twenty rejecting fixtures return an empty `errors` array.

- [ ] **Implement**

Add the `RUBRIC_SCENARIO_STEP_MISSING` branch, reporting one error per missing token with the token in `detail` — a rule that reports "some token missing" cannot be falsified per branch.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS — eleven rules, twenty new rejecting inputs.

- [ ] **Falsify each guard**

Twenty perturbations, one per row: for each, build a synthetic scenario carrying **every other** token and omitting exactly that one, and assert the rule fires **naming that token**. A perturbation that omits two tokens proves neither.

Then two probes on the harness itself, which no single-row perturbation reaches:

| Probe | Must go red |
|---|---|
| Delete one row from `TOKEN_TABLE` | the pinned `TOKEN_TABLE.length` assertion — the guard against a row silently disappearing |
| Point `scenarioRoot` at an empty temp dir | the non-empty-glob assertion, **not** the token loop. A token check over zero files passes, which is the plan heuristic's exact anti-pattern |

Revert each. Record all twenty-two confirmations in the commit body.

**Moved to Task 8:** the scope-application probe — change the `prototype`-scoped rows to `'every'` and confirm the ten non-`prototype` scenarios go red. It needs eleven real, stem-named scenario files to redden, and at Task 3 none exist. Running it here against synthetic fixtures would prove the loop, not the scoping of the shipped table, so it lands where the real files do.

- [ ] **Commit**

`test(eval-harness): prove RUBRIC_SCENARIO_STEP_MISSING per token branch, twenty rejecting inputs`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 3`

---

### Task 4: Scenario setup helper + the splice refusal set [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `scripts/eval-scenario-setup.mjs` — one of the plan's **two** non-test production files (the other is Task 1's frozen `lib/evals/rubric-coverage-codes.mjs` data array)
- Modify: `tests/lib/evals/rubric-coverage.test.mjs` (the splice refusal cases)
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

> **Flag for review.** The spec's Scenarios section requires this helper — "invoked through a thin `scripts/` helper the scenario prose names", because no CLI verb wraps `createTempGitRepo` or `cpSync` and the constitution bars `node -e` — but its Required Files table lists only `tiers.yaml`, the 22 data files, the test, and the Tier B record. The helper is therefore **spec-mandated in prose and spec-omitted from the file list**. This plan lands it, because eleven scenarios cannot name a helper that does not exist and the alternative shell realisation (`cp -R` into a `TMPDIR`-derived destination, hand-rolled `git init`) is barred by the same section. If review decides otherwise, Tasks 5–8's scenario prose changes and nothing else does.

**Tests:** the splice's refusal set. The copy mechanism itself is exercised by the operator in Task 9; what needs a unit test here is the **enumerate-and-refuse** discipline, because best-effort on an ambiguous manifest form is what silently drops `tasks.backend: json`.

**Context to load:** the Task 4 Context Packet.

- [ ] **Write failing test**

Add a `spliceDbPath(manifestText, value)` unit block driven by a table of on-disk forms. It **accepts** exactly two: `tasks:` present as a block map (append a nested `db_path:` at the correct indent), and the literal `tasks: {}` (rewrite to a block map). It **refuses** everything else, each with a distinct reason in the thrown message:

| Form | Behaviour |
|---|---|
| `tasks:` absent | refuse |
| `db_path:` already present under `tasks:` | refuse |
| `tasks:` duplicated | refuse |
| `tasks: {backend: json}` (non-empty inline map) | refuse — rewriting it would drop `backend: json`, the pin every rubric cites |
| `tasks: []` (empty inline sequence) | refuse — `governance-splice.mjs` gates on the literal `inline !== '[]'`, and rewriting an empty flow *sequence* into a map is a different operation from rewriting an empty flow map |
| `tasks: {}` (empty inline map) | **accept** — the deliberate widening of the module's form 2, admissible only because an empty flow map is provably carrying nothing to drop |
| `tasks:` present but not a map (scalar value) | refuse — the nested-key analogue of the module's form-7 refusal |
| mixed or lone-CR line endings | refuse |

Plus three assertions on the accepted path:

- The value passes `assertSafeScalar` **before** the splice and is **re-checked at emission**, so an unsafe value cannot be escaped into safety. A `mkdtempSync` root inherits an operator-controlled `TMPDIR`; a value carrying a flow indicator or colon-space reparses into structure.
- **Round-trip pin:** after the splice, `parseYaml(result).tasks.db_path` is a **string** equal to the value, `parseYaml(result).tasks.backend === 'json'`, and — on the **text**, since `parseYaml` discards comments — every comment line present before the splice is still present. This is the pin `governance-splice.mjs` keeps for its own splice and the hand-rolled variant would otherwise inherit only the rationale.
- **Emitted at the right indent.** `resolveStorageRoot` reads `manifest?.tasks?.db_path` with optional chaining: a leaf at the wrong indent reads back `undefined` and falls through to the git-common-dir branch, which under the flat model returns the copy root and makes containment pass **vacuously**. Assert it in two parts.

  **Part one, the parsed leaf.** `parseYaml(result).tasks.db_path` — already pinned by the round-trip assertion above — is a string equal to the realpathed copy root, and reads back `undefined` when the leaf is emitted at top level. This is the assertion that actually detects the indent error.

  **Part two, and *not* a same-cwd difference.** Do **not** assert that spliced and unspliced `resolveStorageRoot` differ at the copy root. Measured: for a `mkdtempSync` + `git init` root, `dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: dir }))` returns exactly `realpathSync(dir)` — byte-identical to the value the splice writes. Spliced and unspliced therefore return the **same string** on correct code, so the assertion is red before any perturbation, and they stay the same under the wrong-indent perturbation, so the perturbation cannot fire either. Task 9's falsification table already records this identity in its "Board containment" row; the two now agree.

  The differ-assertion is only meaningful against a **different cwd**. Build a second `createTempGitRepo()` root and assert both directions: `resolveStorageRoot(parseYaml(spliced), otherRoot) === realpathSync(copyRoot)` — the splice wins over cwd — and `resolveStorageRoot(parseYaml(unspliced), otherRoot) === realpathSync(otherRoot)` — the fallback answers for cwd. Those two values genuinely differ, so the assertion is green on correct code and goes red the moment the leaf lands at the wrong indent.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — `scripts/eval-scenario-setup.mjs` does not exist, so the import throws.

- [ ] **Implement**

Author `scripts/eval-scenario-setup.mjs`. Node built-ins only. Three exported steps plus a thin CLI entry so a scenario can name one command:

1. `createTempGitRepo()` in its **zero-argument form** — the form that keeps the helper's one interpolated token, `git checkout -b ${branch}`, out of reach.
2. `cpSync(fixtureRoot, copyRoot, { recursive: true, dereference: false, verbatimSymlinks: false })` — the **contents** of `fixture_root` **flat** into the repo root, never into a subdirectory. Flat placement makes the copy root simultaneously the git root and the project root carrying `.context-index/manifest.yaml`; nest `project/` one level down and `resolveStorageRoot`'s git-common-dir fallback returns the temp root instead.
3. `spliceDbPath` as above, writing the **realpathed** copy root.
4. A second `mkdtempSync` for `outputs/`, **beside** the copy root, outside every worktree root and outside the copy. Per-run rather than a fixed name: a fixed-name sibling would sit directly in the shared, predictable `tmpdir()` and survive across runs, outside any `cleanupTempDir` reach.

The helper **prints both `mkdtempSync`-returned roots and exits**. It performs no teardown: at v1 the operator types the delete, and the two roots printed here are the only two values the teardown token permits — never a composed path.

Note in the file header that `createTempGitRepo` is pre-existing `execSync` shell strings including a `&&` compound, safe only in the zero-argument form because no caller-supplied value crosses them; the argv discipline for every other probe is on the CI-integration intake list.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS — the eight form cases and the three accepted-path assertions.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Each of the **seven** refusals — (1) `tasks:` absent, (2) `db_path:` already present under `tasks:`, (3) `tasks:` duplicated, (4) `tasks: {backend: json}`, (5) `tasks: []`, (6) `tasks:` present as a non-map scalar, (7) mixed or lone-CR line endings | make `spliceDbPath` best-effort for that one form | that form's case, and only it. **Seven** perturbations, one per refusal row of the form table above — the table lists seven refusals and one acceptance (`tasks: {}`), so the earlier "each of the six refusals" left one form shipping unfalsified |
| `tasks: {}` acceptance | make the widening refuse `{}` too | the acceptance case — proving the widening is deliberate, not an accident of the regex |
| `assertSafeScalar` pre-check | pass a value carrying `: ` | must throw before any write |
| `assertSafeScalar` re-check at emission | bypass only the emission check and pass a value that becomes unsafe after interpolation | must still throw |
| Comment survival | reserialize instead of splicing | the comment assertion goes red while `parseYaml` round-trip still passes — this is the pair that tells a splice from a rewrite |
| `tasks.backend: json` survival | splice with a line range anchored one line early | the `backend` assertion goes red |
| Indent correctness | emit `db_path:` at top level instead of nested | the **parsed-leaf** assertion (`parseYaml(result).tasks.db_path` is `undefined`, not the copy root) **and** the different-cwd assertion (`resolveStorageRoot(parsed, otherRoot)` returns `realpathSync(otherRoot)` instead of the copy root). The **same-cwd** comparison stays green under this perturbation by construction, which is why it is not an assertion |
| Flat copy | change `cpSync` to copy `project/` as a subdirectory | the git-root/project-root identity assertion goes red |

Revert each.

- [ ] **Commit**

`feat(eval-harness): add the scenario setup helper and its manifest-splice refusal set`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 4`

---

### Task 5: Detector rubrics + scenarios — `codehealth`, `repomap`, `document` [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all six are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/rubrics/{codehealth,repomap,document}.yaml`
- Create: `tests/evals/skill-regression/scenarios/{codehealth,repomap,document}.md`
- Test: `tests/lib/evals/rubric-coverage.test.mjs` (already green from Tasks 1–4; these files are validated by pointing the parameterised roots at the real directories for these three stems)

**Tests:** no new rule. These three files are validated by the checker that already exists — which is the point of landing the checker first. The task adds one `test()` that runs `checkRubricSet` over a root containing **only** these three stems and asserts zero errors, so a rubric that fails a rule fails at the commit that authors it rather than at Task 8.

**Context to load:** the Tasks 5–8 Context Packet. Read `skills/codehealth/SKILL.md`, `skills/repomap/SKILL.md` and `skills/document/SKILL.md` in full — the rubrics describe what these produce **today**.

- [ ] **Write failing test**

Add `test('the three detector rubrics conform')` calling `checkRubricSet({ rubricRoot, scenarioRoot, tiersPath, onlyStems: ['codehealth','repomap','document'] })` and asserting `errors` is empty **and** that the stem filter matched three files — an empty filter result would pass vacuously.

Add three detector-specific assertions the generic rules do not cover:

- Each of the three cites at least one `skill-regression:PV-nn` **and** its `KC` twin (acceptance criterion 19; `RUBRIC_TWIN_UNCITED` proves the negative, this proves the positive is non-empty).
- Every cited id resolves in `catalog.yaml`. **This tier mints no alias** — the assertion here is that the fixture's own `CATALOG_UNRESOLVED_CITATION` scan covers this root, proven by running `validateCatalog` with default roots and asserting its reported scanned-file list now **contains** the three new rubric paths. Before this task that list contained only `skills/eval/default-rubric.yaml`; asserting it grew is what proves the guarantee transferred rather than assuming it.
- Each rubric's `skill` appears in each cited entry's `covers_skills`. Convention in this tier, `RUBRIC_COVERS_SKILLS_UNLISTED` in the core tier — asserted here as a plain test so the two specs do not read as contradicting each other. The six citations already satisfy it: `PV-03`/`PV-04` carry `codehealth, repomap`, `PV-05` carries `codehealth`, `PV-08` carries `document`.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the six files do not exist; the stem-filter-matched-three assertion fails on zero.

- [ ] **Implement**

Author the three rubrics against the exemplar's field shapes verbatim (`required_elements`: `id`, `description`, `source`, `met_when`, `not_applicable_when`; `quality_dimensions`: `id`, `criterion`, `reference`, `met_when`, `not_met_when`, `unknown_when`). All values flat.

| Rubric | Scored input | Citations | Shape |
|---|---|---|---|
| `codehealth` | the severity-tiered report | `PV-03`/`KC-03` (orphan-source-file), `PV-04`/`KC-04` (dead-export), `PV-05`/`KC-05` (unused-dependency) | 7 elements / 4 criteria |
| `repomap` | `.context-index/hygiene/dependency-graph.json`, `.context-index/hygiene/symbol-ranks.json` | `PV-03`/`KC-03`, `PV-04`/`KC-04` | 6 / 3 |
| `document` | `docs/architecture.md` + per-module docs; **plus `artifact: docs/api.md`** for the `undocumented-public-api` pair | `PV-08`/`KC-08` | 6 / 4 |

Row counts are indicative; only the floors are enforced. Load-bearing shape notes:

- **`repomap`'s scenario pins `--mode tree-sitter`.** It is the only mode that writes the two JSON artifacts (`runRegexMode` writes `repo-map.md` alone) and it fails loudly on a missing parser rather than degrading silently. Without the pin a healthy skill scores `not_met` in an environment ADR-0001 documents as supported, and baseline fidelity would misread that as a rubric describing an intended future.
- **`document`'s `undocumented-public-api` element reads `artifact: docs/api.md`**, not `docs/architecture.md` — the twin is defined against the fixture-shipped file, which `architecture.md` does not replace. `architecture.md` is the skill's own output and is scored by the other elements.
- Every `artifact:` value is relative to `fixture_root` and resolves against the copy's root.
- No `baseline_exception_issue` unless the authoring run in the next step actually produces one.

Author the three scenarios. Each carries the fourteen every-scenario tokens verbatim, names `scripts/eval-scenario-setup.mjs`, states its working directory as a temp-tree copy of `tests/evals/skill-regression/project` (never the committed tree), and states where `outputs/` lives.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS — the three-stem conformance test plus the three detector-specific assertions.

- [ ] **Baseline-fidelity authoring run (the criterion no artifact can check)**

Run each of the three scenarios once, by hand, against the current skill, and confirm the **deterministic half scores full marks**. A `not_met` here means the rubric described an intended future. It resolves in **one pass, never by re-running**: either correct the rubric text to today's behaviour, or — where today's behaviour is plainly wrong — record `met` anyway, file the defect via `/adev:issues`, and pin its id in `baseline_exception_issue` (shape-validated by `RUBRIC_EXCEPTION_ID_MALFORMED`; nothing resolves it against the board at v1). Record which exit each rubric took in the commit body.

> **Answer-key dependency — `issue-dzxjoa` (P1, undecided).** The fixture labels planted defects **in-file with their exact catalog class slug**: `src/orders/orphaned-helper.mjs` opens `Planted violation: orphan-source-file`, `src/shipping/rates.mjs` carries `Two planted violations live here` and `It is the dead-export planted violation`, and `src/index.mjs` names the `orphan-source-file` known-clean twin. All three of this task's citation sets read those files.
>
> **Which assertions depend on the outcome:** the `PV-03`, `PV-04` and `PV-08` sensitivity elements in `codehealth.yaml`, `repomap.yaml` and `document.yaml` — six elements in total. `PV-05` (`unused-dependency`) is **unaffected**: its anchor is `"ajv": "^8.17.1"` in `package.json`, which carries no comment.
>
> If the label stays, those six elements measure whether the skill read a comment naming the answer, not whether it analysed the tree — and their `met` verdicts are not evidence of detection.
>
> **Author them so either resolution drops in cleanly:** phrase each element's `met_when` against the catalog's `detect_when` clause (the *finding*, e.g. "the orphan list names `src/orders/orphaned-helper.mjs` as unreachable from `src/index.mjs`"), never against the label text. A `met_when` written that way survives redaction with no edit. Do **not** write an element whose `met_when` could be satisfied by echoing the comment.
>
> **If redaction becomes this tier's job** rather than the fixture's: it is **thirteen files, not six**, and the edits are **not all comment-only**.
>
> **Re-derive the list, do not trust this one.** The command is:
>
> ```
> git grep -lE "planted|known-clean" -- tests/evals/skill-regression/project
> ```
>
> Run it at the moment the redaction starts — the fixture may have grown labels since this plan was authored, and a stale hand-copied list is exactly how a residual label survives a redaction. As of authoring it returns thirteen paths, all committed test data under `tests/evals/skill-regression/project/`:
>
> | Path (under `tests/evals/skill-regression/project/`) | Form |
> |---|---|
> | `src/orders/orphaned-helper.mjs` | comment (`:2`, `:6`) |
> | `src/shipping/rates.mjs` | comment (`:8`, `:12`, `:14`, `:17`, `:71-73`) |
> | `src/index.mjs` | comment (`:6-8`, `:18-22`, `:32`) |
> | `src/orders/create-order.mjs` | comment (`:8`) |
> | `src/orders/legacy-loader.js` | comment (`:10`) |
> | `tests/rates.test.mjs` | comment (`:7`, names `spec-code-drift`) |
> | `tests/create-order.test.mjs` | comment (`:3`) |
> | `.context-index/governance/review.yaml` | comment (`:9-11`, names `charter-scope-escape`) |
> | `.context-index/governance/validate.yaml` | comment (`:11`, names `esm-violation`) |
> | `.context-index/evals/config.yaml` | comment (`:3`) |
> | `.context-index/specs/features/orders/shipping-rates.plan.md` | **body prose** (`:66`, `:68`) |
> | `.context-index/specs/features/orders/shipping-rates.spec.md` | **body prose** (`:82`, names `spec-code-drift`) |
> | `.context-index/constitution.md` | **body prose** (`:11`) |
>
> Three of the thirteen are markdown **body prose**, not comments. Redacting those is an edit to the fixture's readable content and a different review question from deleting a code comment, which is why the earlier "all comment-only edits" characterisation is dropped rather than restated at a larger count.
>
> **No catalog anchor changes**: every anchor is a code or frontmatter string (`export function orphanedTotalCents`, `export function formatLegacyTotal`, `export function calculateRate`), never a comment or a prose sentence, so `CATALOG_ANCHOR_NOT_UNIQUE` is unaffected. The fixture's own hermeticity suite is unaffected too — none of its eleven properties reads a comment. Size it as one commit inside this task; do not spread it across Tasks 5–7.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Twin citation | delete the `KC-03` citation from `codehealth.yaml` | `RUBRIC_TWIN_UNCITED` |
| Wrong twin | cite `KC-04` alongside `PV-03` | `RUBRIC_TWIN_UNCITED`, not silence |
| Citation resolution | cite `skill-regression:PV-99` | `CATALOG_UNRESOLVED_CITATION` from the **fixture's** suite, not this one — confirming the scan really covers this root |
| Scan-root growth | move the three rubrics out of `rubrics/` | the "scanned list contains these paths" assertion goes red; without it the guarantee is assumed rather than proven |
| `covers_skills` | cite `PV-01` (`hygiene, validate, debug`) from `codehealth.yaml` | the convention assertion |
| `artifact:` containment | set `document.yaml`'s source to `../../../../etc/hosts` | `RUBRIC_SOURCE_PATH_ESCAPE` |
| Element floor | drop `repomap.yaml` to 4 elements | `RUBRIC_ELEMENT_FLOOR` |
| Token presence | delete the `tasks.db_path` line from `repomap.md` | `RUBRIC_SCENARIO_STEP_MISSING` naming that token |
| `--mode tree-sitter` pin | remove the mode pin from `repomap.md` and re-run the authoring pass | the two JSON artifacts are absent and the deterministic half scores `not_met` — the perturbation that proves the pin is load-bearing rather than decorative |
| Answer-key independence | **not run at v1** — see the note below the table | — |

Revert each.

> **Answer-key independence is *not* falsified by this plan, and the earlier attempt is withdrawn.** An earlier draft ran one `codehealth` pass with the `Planted violation:` comment deleted from `src/orders/orphaned-helper.mjs` and read a still-`met` `PV-03` as proof the element measures the tree rather than the label. That experiment is unsound in two independent ways and would produce a **false negative** — a green result licensing the belief the answer key does not matter.
>
> **First, deleting one comment does not remove the answer.** The skill reads the whole tree, and every class keeps residual labels in *other* files. A sound run must strip **every** label for that class:
>
> | Class | Every residual label to strip for that class's run |
> |---|---|
> | `PV-03` — `orphan-source-file` | `src/orders/orphaned-helper.mjs:2` (`Planted violation: orphan-source-file`); `src/orders/orphaned-helper.mjs:6` (names the known-clean twin); `src/index.mjs:20-22` (`the orphan-source-file known-clean twin. The planted violation for that class …`); `src/shipping/rates.mjs:17` (`The file itself is the orphan-source-file KNOWN-CLEAN twin`); `src/shipping/rates.mjs:73` (names the class alongside the dead-export label) |
> | `PV-04` — `dead-export` | `src/shipping/rates.mjs:8` (`Two planted violations live here`); `src/shipping/rates.mjs:12` (`dead-export — formatLegacyTotal is exported and referenced by …`); `src/shipping/rates.mjs:71-73` (`It is the dead-export planted violation`) |
> | `PV-08` — `undocumented-public-api` | `src/index.mjs:6-8` (`calculateRate deliberately does NOT — it is the planted undocumented-public-api violation, and it is the ONLY undocumented public …`); `src/shipping/rates.mjs:14` (`undocumented-public-api — calculateRate is re-exported from …`) |
>
> A run that strips only `orphaned-helper.mjs`'s opening comment leaves `src/index.mjs:6-8`, `src/shipping/rates.mjs:71` and `src/index.mjs:20-22` stating the other classes' answers verbatim, so a still-`met` verdict is uninformative.
>
> **Second, one LLM run in each direction is not evidence.** A `not_met` flip is as likely to be run-to-run variance as signal, and a still-`met` result is equally uninformative at n=1. This plan's own baseline-fidelity contract forbids re-running, so this task cannot legitimately gather the samples the inference needs.
>
> **What a sound experiment would be:** a **paired A/B** — for each of `PV-03`, `PV-04` and `PV-08`, a label-free copy of the fixture with every residual label for that class stripped (the table above), scored against the labelled copy, repeated enough times per arm to separate a verdict flip from variance. That needs a scenario driver and a multi-run budget, and this tier ships neither.
>
> **So it is out of scope at v1 and recorded as an open question, not as a proof.** It joins the charter's **CI-integration** capability intake as a twelfth item: *does the fixture's in-file answer key inflate detector scores? Resolve by paired A/B over label-stripped copies once a scenario driver and a repeat budget exist.* Note it on `issue-dzxjoa` as evidence the decision is still waiting on. This task's *actual* protection against the answer key is the authoring rule stated above — phrase every `met_when` against the catalog's `detect_when` clause, never against the label text — which is a construction and needs no experiment to hold.

- [ ] **Commit**

`test(eval-harness): add change-imminent detector rubrics and scenarios for codehealth, repomap, document`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 5`

---

### Task 6: Producer rubrics + scenarios, state writers — `deploy`, `sync`, `learn`, `issues` [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all eight are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/rubrics/{deploy,sync,learn,issues}.yaml`
- Create: `tests/evals/skill-regression/scenarios/{deploy,sync,learn,issues}.md`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** a four-stem conformance test, the same shape as Task 5's, plus the producer-specific convention assertion.

**Context to load:** the Tasks 5–8 Context Packet. Read `skills/{deploy,sync,learn,issues}/SKILL.md` in full, plus `.context-index/manifest.yaml`'s constitution-to-agent-file mapping (the `sync` rubric's required `reference`).

- [ ] **Write failing test**

`test('the four state-writer rubrics conform')` — `checkRubricSet` over these four stems, zero errors, filter matched four.

Plus: **no producer rubric in this tier cites a catalog id.** The spec marks this review-time convention with no code, because `RUBRIC_TWIN_UNCITED` fires only on a `PV` without its `KC` and would pass a producer citing both. Land it here as a plain test scoped to these four stems rather than leaving it unbacked — the predicate is `!/skill-regression:/.test(yamlText)` over `rubrics/{deploy,sync,learn,issues}.yaml`, and it is stated as a *this-tier* assertion, not a universal, because the core tier's `Kind` column is descriptive and does not carry the restriction.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the eight files do not exist; the filter-matched-four assertion fails on zero.

- [ ] **Implement**

| Rubric | Scored input | Shape | Required `reference` anchor |
|---|---|---|---|
| `deploy` | the `--dry-run` transcript | 6 / 3 | — |
| `sync` | the rewritten `CLAUDE.md` / `AGENTS.md` | 6 / 3 | **the constitution-to-agent-file mapping declared in `.context-index/manifest.yaml`** — at least one judged criterion, so the rubric is not inventing a standard |
| `learn` | the written heuristic file | 5 / 3 | — |
| `issues` | the created/updated work items | 6 / 3 | **the board-granularity invariant** (a Feature carries `spec_ref`, never `planRef` + `planTask`), owned by the `agent-reliable-state-artifacts` charter |

Sources are `output:` and `artifact:` only. Note in each file's header comment that **`output:` has no v1 machine reader** — `lib/evals/score.mjs` never reads an element's `source` — so its v1 consumer is the operator performing the Tier B pass, and its automated consumer is the CI-integration capability's resolver.

`deploy` is scored on `--dry-run` because the fixture's `deploy.yaml` is restricted to `manual` steps with no `rollback:`; a live pipeline would be a spawn the fixture's Hermeticity Rules close.

`issues` sits in this tier as a **producer**, not a detector: it *manages* work items rather than auditing them, so the `missing-issue-binding` class belongs to `reconcile`, `status` and `hygiene`, and the fixture's `covers_skills` omits `issues` accordingly. Its rubric cites no catalog id.

All four scenarios carry the fourteen every-scenario tokens. Property 4 is what binds this group: **`tasks.db_path` bounds the board, and only the board.** `issues` resolves storage through `resolveStorageRoot`; `sync` (`CLAUDE.md` / `AGENTS.md`) and `learn` (`.context-index/memory/heuristics/`) are **project-relative** writers that resolve against cwd. So each of the four scenarios states cwd as the realpathed copy root **and** that each written path is `isContained` under it — the board mechanism is not transferable, and borrowing it would leave three of four writers unbounded.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS.

- [ ] **Baseline-fidelity authoring run**

Same one-pass contract as Task 5: run each of the four scenarios once against the current skill, confirm the deterministic half scores full marks, and take one of the two exits. Record which in the commit body. These four are the group most likely to hit the `met`-anyway exit, since three of them write state and today's write locations are exactly what a queued demotion would change.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| No-catalog-citation convention | add `source: "skill-regression:PV-05"` to `deploy.yaml` | the convention test — and confirm `RUBRIC_TWIN_UNCITED` **stays silent**, which is why the convention needs its own predicate |
| `sync` reference anchor | change the `reference` to free prose | the anchor assertion; if there is no anchor assertion the criterion is unbacked review convention and must be written as one |
| `issues` reference anchor | as above | as above |
| `id`/`skill` binding | set `sync.yaml`'s `skill:` to `sync-v2` | `RUBRIC_ID_MISMATCH` on the `skill` branch |
| Scenario binding | point `learn.yaml`'s `scenario:` at `../../../etc/passwd` | `RUBRIC_SOURCE_PATH_ESCAPE`, decided before existence |
| Missing scenario | rename `issues.md` | `RUBRIC_SCENARIO_MISSING` |
| Criterion ceiling | give `deploy.yaml` 7 `quality_dimensions` | `RUBRIC_ELEMENT_FLOOR` |
| Nested value | make one `met_when` a nested map | `RUBRIC_NESTED_MAP` from `loadRubric`, surfaced unmodified — proving the tier's rules sit on top of the loader's rather than replacing them |
| Project-relative containment | run `sync` with cwd at the repository root instead of the copy | the write lands on this repository's `CLAUDE.md` and the fixture's write-escape equality goes red. **Do this in a scratch checkout, never in a worktree carrying work** — it is the perturbation that proves property 4's "not transferable" claim, and it is the one with real blast radius |

Revert each.

- [ ] **Commit**

`test(eval-harness): add change-imminent producer rubrics and scenarios for deploy, sync, learn, issues`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 6`

---

### Task 7: Producer rubrics + scenarios, reporters — `eval`, `assess`, `prototype` [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all six are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/rubrics/{eval,assess,prototype}.yaml`
- Create: `tests/evals/skill-regression/scenarios/{eval,assess,prototype}.md`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** a three-stem conformance test, the no-catalog-citation convention extended to these three, and the `prototype` scenario's five extra token rows asserted **at the real root** (Task 3 proved the rule on synthetic input; this is the first real scenario the `prototype`-scoped branch selects).

**Context to load:** the Tasks 5–8 Context Packet. Read `skills/{eval,assess,prototype}/SKILL.md` in full, plus `lib/evals/rubric-schema.mjs`, `lib/evals/score-schema.mjs` and `lib/cli/eval.mjs`'s score-report table (the `eval` rubric's required `reference`s), and `lib/cli/prototype.mjs`.

- [ ] **Write failing test**

`test('the three reporter rubrics conform')` plus:

- The `prototype` scenario carries all five `prototype`-scoped tokens, asserted against the **real** `scenarios/prototype.md`. This is the branch's first non-synthetic input; assert the scope selector actually selected it (the stem matched), or the five checks pass by never running.
- The no-catalog-citation convention over these three stems.
- The `eval` rubric anchors at least one judged `reference` on **each** of the four named contracts: `skills/eval/default-rubric.yaml`, `ELEMENT_VERDICTS`/`CRITERION_VERDICTS` in `lib/evals/rubric-schema.mjs`, `HALF_STATUSES` in `lib/evals/score-schema.mjs`, and the rendered score-report table in `lib/cli/eval.mjs`. Predicate: each of the four literals appears in some `reference` value in `eval.yaml`.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — the six files do not exist.

- [ ] **Implement**

| Rubric | Scored input | Shape | Notes |
|---|---|---|---|
| `eval` | the score report and its verdict table | 6 / 4 | Must cite the four contracts above. An `eval` rubric scoring `eval` against a freshly invented notion of a good score report would be measuring the rubric author's taste |
| `assess` | the maturity score table | 6 / 3 | **Producer, not detector.** Its eleven dimensions are presence-based and none opens a board or diffs a spec against its source; citing `spec-code-drift` or `missing-issue-binding` would name ground truth the skill cannot reach, and the fixture's `covers_skills` omits `assess` for exactly that reason |
| `prototype` | the generated prototype tree | 5 / 3 | Scored at the **wireframe or mockup** tier, never functional — the functional tier pulls CDN imports, network egress a `git status` cannot observe |

The `prototype` scenario additionally states, each as its own literal clause: `scored tier: non-functional`; `loopback`; `kill <recorded-pid>`; `recorded PID and bound port each match ^[0-9]+$ before any typed command`; `no listener on <port> after teardown`. And it states **what happens when the last is false** — the scenario **fails and is reported**, not retried and not escalated silently. `lib/cli/prototype.mjs` records that `startServer`'s `close()` is not callable from a one-shot CLI, so a teardown step alone can pass review while a listener survives.

`prototype` also writes `.adev/prototype/<module>/` and splices a managed block into `<cwd>/.gitignore` via `ensure-gitignore`. `.adev/` is **gitignored**, so a plain `git status` would report clean while an escape stood — which is why the capture is `--ignored=traditional --untracked-files=all` and why the scenario's cwd pin is load-bearing rather than cosmetic.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: PASS.

- [ ] **Baseline-fidelity authoring run**

Same one-pass contract. Run `prototype` last and perform its teardown before moving on.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Each of the five `prototype` tokens | delete that one clause from `scenarios/prototype.md` | `RUBRIC_SCENARIO_STEP_MISSING` naming that token — five separate perturbations |
| Scope selection | rename `prototype.md` to `proto.md` and update the rubric | the five checks must stop running **and the stem-matched assertion must go red**; if only the former happens, the branch silently stopped covering anything |
| `eval` reference anchors | replace one of the four literals with prose | that literal's assertion, and only it — four separate perturbations |
| No-catalog-citation | add a `skill-regression:PV-08` source to `assess.yaml` | the convention test |
| Element floor | drop `prototype.yaml` to 4 elements | `RUBRIC_ELEMENT_FLOOR` |
| Teardown reality | run the `prototype` scenario, skip the `kill`, then probe the port | a listener survives. This is the perturbation that proves the post-teardown check is a real assertion and not prose the scenario gestures at |

Revert each.

- [ ] **Commit**

`test(eval-harness): add change-imminent producer rubrics and scenarios for eval, assess, prototype`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 7`

---

### Task 8: Responder rubric + scenario; flip the checker onto the real roots [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/rubrics/using-adev.yaml`, `tests/evals/skill-regression/scenarios/using-adev.md` (committed test data)
- Modify: `tests/lib/evals/rubric-coverage.test.mjs`
- Test: `tests/lib/evals/rubric-coverage.test.mjs`

**Tests:** the eleventh rubric, and then the assertion the whole plan has been deferring — `checkRubricSet()` with **no arguments**, over the real `tiers.yaml`, the real `rubrics/`, the real `scenarios/` and the real `skills/`, returning zero errors. This is the landing-state criterion the spec pins explicitly.

**Context to load:** the Tasks 5–8 Context Packet. Read `skills/using-adev/SKILL.md` in full.

- [ ] **Write failing test**

1. `test('the responder rubric conforms')` — the one-stem case.
2. `test('the landed tier is complete at the real roots')` — `checkRubricSet()` with defaults, `errors` deep-equals `[]`. Assert first that `rubrics/*.yaml` globbed **exactly 11** entries and `scenarios/*.md` globbed **exactly 11**, and that the eleven stems set-equal `tiers.yaml`'s `change_imminent` bucket in both directions. A zero-error result over an empty root is the failure mode this plan's heuristic names.
3. `test('every rule was reached at the real roots')` — the `checked` set contains all eleven codes. A green run that exercised nine rules is not a green run.
4. `test('rubric-coverage.test.mjs is in the default bucket')` — `node scripts/run-tests.mjs --list` lists this file. Acceptance criterion 24; a per-PR gate that only runs nightly is not a gate.
5. `test('the evals bucket discovers nothing for this tier')` — `node scripts/run-tests.mjs --evals --list` lists **nothing** under `tests/evals/skill-regression/`. The absence is expected and pinned so it is not mistaken for a broken harness. Assert the command produced non-empty output overall, or the check passes on a crashed subprocess.
6. `test('every scenario states where outputs/ lives')` — the token-7 check at the real root, asserted separately from Task 3's synthetic proof because acceptance criterion 28 names it on its own. Predicate: token 7 present in all eleven files.
7. `test('the responder rubric cites no catalog id')` — coverage-map criterion #12 reads "no producer **or responder** rubric cites a catalog id", and Tasks 6 and 7 land the predicate for the **seven producers only**. `using-adev.yaml` is the tier's **sole responder** and is authored here, so the eleventh stem's share of the criterion lands here too. Predicate: `!/skill-regression:/.test(readFileSync(join(rubricRoot, 'using-adev.yaml'), 'utf8'))`, plus an assertion that the read returned a non-empty string, so the negative match cannot pass on a missing or empty file. Scoped to this tier, for the reason Task 6 gives — the core tier's `Kind` column is descriptive and carries no restriction. Without this test the criterion's "or responder" clause is discharged in prose only.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/rubric-coverage.test.mjs`
Expected: FAIL — `using-adev.yaml` and `using-adev.md` do not exist, so the eleven-file count assertions fail on ten and `RUBRIC_TIER_UNCOVERED` fires for `using-adev` at the real root. **This is the first commit at which the real-root assertion can be green**, which is why it lands here.

- [ ] **Implement**

Author `using-adev.yaml` — responder, 5 elements / 3 criteria, scored on **the answer text**, `output:` sources only, no catalog citation. And `using-adev.md`, carrying the fourteen every-scenario tokens.

Then add the six real-root tests. No production change.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — the full default bucket, with `rubric-coverage.test.mjs` green at `landed: "change_imminent"`, eleven rubrics present, `core_lifecycle` and `remaining` unrubriced and correctly out of scope.

- [ ] **Contract cross-reference**

The spec's task-map row "Confirm the core-lifecycle spec references this spec's shared contract rather than copying it" lands here rather than as its own task — it is a read and, at most, a one-line spec edit.

`.context-index/specs/features/eval-harness/rubric-set-core-lifecycle.spec.md` **exists**, and at the time of planning it already references rather than copies: its header names this spec as the source of the shared contract (`:21`, `:37`), it declares "This spec restates no part of the shared contract except the two values Difference 2 overrides" as its own acceptance criterion (`:498`), it treats `RUBRIC_EXCEPTION_ID_MALFORMED` as owned here and inherited there (`:522`, `:545`), and it cites the Tier B record convention as "the convention the change-imminent tier defines" (`:368`, `:591`). So this step is a **re-confirmation against the landed artifacts**, not an authoring step.

Confirm three things and record the result in the commit body: (a) the eleven `RUBRIC_*` codes as landed match the names the sibling spec inherits by reference — a rename in Task 1 or 2 would silently break the sibling's inheritance; (b) the sibling has not acquired a restatement of the contract table since revision 15; (c) the sibling's `spec_behaviour_gap_issue` branch is the one Task 2 already proved, so the rule covers both keys with no widening on the sibling's side. **If any of the three has drifted, file it as an issue and note it — do not edit the sibling spec from this task**, which is a plan for the change-imminent tier.

- [ ] **Falsify each guard**

| Assertion | Perturbation | Must go red |
|---|---|---|
| Real-root completeness | `git mv rubrics/using-adev.yaml rubrics/using-adev.yaml.bak` | `RUBRIC_TIER_UNCOVERED` at the real root, naming `using-adev` |
| Eleven-file count | add a twelfth stray `rubrics/foo.yaml` | the count assertion **and** `RUBRIC_TIER_ORPHAN` — two independent guards, both must fire |
| Stem set equality | rename `deploy.yaml` to `deployment.yaml` | the set comparison in **both** directions; a one-way subset check would pass one of the two |
| Rule reachability | delete one rule's branch | the `checked`-set assertion, independently of any rejecting fixture |
| Default bucket | move the test to `tests/evals/` | the `--list` assertion |
| Evals bucket emptiness | add a `tests/evals/skill-regression/runner.test.mjs` | the `--evals --list` assertion. This is the guard that will fire the day the CI-integration capability lands a driver, which is the intended signal, not a false positive |
| `--evals --list` non-crash | point the command at a nonexistent flag | the non-empty-output assertion must fail, not the emptiness assertion |
| Token 7 at the real root | delete the `outputs/` clause from `using-adev.md` | `RUBRIC_SCENARIO_STEP_MISSING` naming token 7 |
| Responder no-catalog-citation | add `source: "skill-regression:PV-03"` to `using-adev.yaml` | the responder convention test — and confirm `RUBRIC_TWIN_UNCITED` **stays silent** when the `KC-03` twin is cited alongside, which is exactly why the convention needs its own predicate rather than riding on the twin rule |
| Scope application (moved here from Task 3) | change the `prototype`-scoped rows in `TOKEN_TABLE` to `'every'` scope | the ten non-`prototype` **real** scenarios must go red, proving the scoping is applied and not decorative. This probe needs eleven real, stem-named scenario files to redden and could not run at Task 3, where none existed |

Revert each.

- [ ] **Commit**

`test(eval-harness): complete the change-imminent tier with using-adev and the real-root coverage assertions`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 8`

---

### Task 9: The manual Tier B pass + the record convention [specialist: none]

**Charter capability:** Rubric set, change-imminent tier
**Strategy:** manual — this task runs no automated test, because v1 ships no scenario driver. `scripts/run-tests.mjs` collects only `*.test.mjs` and this tier ships none under `tests/evals/`; `adev eval score --input` consumes a verdict set and `lib/evals/score.mjs` never reads an element's `source`. Both gaps belong to the charter's CI-integration capability.
**Files:**
- Create: `.context-index/evals/tier-b-<YYYY-MM-DD>-01.md`
- Test: none. Every check below is an **operator** obligation, and the file halves are already enforced by `RUBRIC_SCENARIO_STEP_MISSING`

**Context to load:** the Task 9 Context Packet.

- [ ] **Perform the pass**

Run all eleven scenarios by hand, one at a time, each against its own fresh copy. For each, discharge the eight operator-half criteria:

1. **Copy-root predicate, by eye.** `^[A-Za-z0-9._/-]+$` applied to the `mkdtempSync`-derived copy root **before pasting it into any typed command** — the enumeration of commands is deliberately open; the point is the paste, not the verb. This is the whole reason the regex is written out rather than named as `assertSafeArgvToken`, which no CLI verb exposes.
2. **Both door predicates, before and after each scenario.** No `infra_requirements:` key in any markdown under the copy; no `.claude/` or `.mcp.json` **anywhere** under the copy root at any depth. **Halt the pass on a trip.** A halt writes **no** Tier B record; the copy is retained for out-of-band inspection, read by path and **never re-entered as a cwd under an agent runtime** — a loaded hooks block or MCP server is exactly what tripped the predicate. Once the finding is recorded, neutralise the offending file or discard the copy, with the neutralisation containment-asserted via `isContained(lenientRealpath(hit), lenientRealpath(copyDir))` and the scan not following symlinks.
3. **Both splice tokens.** After the `tasks.db_path` write, re-`parseYaml` the copy's manifest: the value is a **string** equal to the realpathed copy root, and `tasks.backend: json` survived. Then check the **text** for the manifest's comments — `parseYaml` discards them, which is exactly what a text splice makes checkable.
4. **Write-escape capture.** `git status --porcelain --ignored=traditional --untracked-files=all` and `git rev-parse HEAD` at **every** root `git worktree list --porcelain` prints, the enumeration anchored at `-C resolveMainRoot(startCwd)` and taken **before any chdir into the copy** — otherwise `git worktree list` answers for the copy alone. Byte-identical **equality**, not emptiness: the ignored baseline is never empty. The run copy is deliberately **not** among the capture roots. A failed comparison is reported to the operator console, **not** into the record.
5. **`artifact:` re-resolution.** After each run, re-resolve every `artifact:` source under `lenientRealpath(copyRoot)` with `isContained`, realpathed on both sides. Lint-time `RUBRIC_SOURCE_PATH_ESCAPE` runs against the **committed** `fixture_root` and does not transfer to a mutated copy: a run that creates a symlink or redirects `docs/` makes an `artifact:` value resolve outside the copy while the lint check still passes.
6. **Board containment — the `issues` scenario only.** `isContained(lenientRealpath(resolveStorageRoot(...)), lenientRealpath(copyDir))`. `issues` is the only board-touching skill in this tier; `reconcile` and `status` are v2, `implement` is core-lifecycle, and both inherit this as a contract.
7. **`prototype` post-teardown.** After `kill <recorded-pid>`, confirm **no listener on the bound port**. If one survives, the scenario **fails and is reported** — not retried, not escalated silently.
8. **Teardown.** Delete **only the two `mkdtempSync`-returned roots**, never a composed path. Each passes the copy-root predicate before being pasted. A teardown that still fails **reports the leaked roots and fails the pass** rather than leaving them unmentioned — a stranded temp tree is the state the next run's baseline would otherwise absorb.

- [ ] **Write the record**

`.context-index/evals/tier-b-<YYYY-MM-DD>-01.md`. Convention, landing here because this tier's pass is the first to write one:

- **Naming and collision:** every same-day report suffixed from `-01`; an existence pre-check plus `{flag: 'wx'}`, and **the refusal is terminal, not a retry**. At v1 the operator picks the next free ordinal by eye, so there is no scan to bound; the `{flag: 'wx'}` half binds the CI-integration writer that inherits the convention, which must increment at most to `-99` and then fail the write loudly.
- **Discovery:** readers glob `tier-b-*.md` in name order.
- **Deliberate divergence** from `.context-index/reports/codehealth-<YYYY-MM-DD>.md`, which same-day-overwrites: that file is a regenerable snapshot; this one is accumulated history two named readers consume, so overwriting would destroy the thing it exists for.
- **Three properties of the write**, because `.context-index/evals/` is git-tracked and the record is therefore a **committed** artifact: (a) written strictly **after** the final status comparison, or the new untracked file at the main root breaks criterion 4's byte-identical capture — the same argument that put `outputs/` outside the repository, applied to the one output that stays inside it; (b) committed rather than left untracked; (c) any interpolated path reduced to a placeholder or passed through `assertSafeScalar` before transcription, and any **skill-transcript span summarised, never pasted verbatim** — `assertSafeScalar` is a YAML-reparse guard and would be a category error on markdown prose, so the span needs its own treatment.

Content: per scenario, the deterministic verdicts, which of the two baseline-fidelity exits each rubric took, any `baseline_exception_issue` filed, and the eight operator confirmations above.

- [ ] **Falsify the pass itself**

The pass has no automated assertion, so its falsification is a set of deliberate trips run once, on a scratch copy, before the real pass — otherwise the operator has never seen any of these halt:

| Check | Trip | Expected |
|---|---|---|
| Door predicate (`.claude/`) | `mkdir <copy>/.claude` mid-scenario | the after-run check halts the pass and **no record is written** |
| Door predicate (`infra_requirements:`) | add the key to one markdown in the copy | same halt, different branch |
| Write-escape capture | `touch <main-root>/probe.txt` inside the before/after window | the comparison reports a mismatch to the console, **not** into the record |
| Root enumeration | run `git worktree list` with cwd inside the copy | the enumeration returns the copy alone — the failure the `-C resolveMainRoot(startCwd)` anchor exists to prevent |
| Splice round-trip | hand-edit the copy's manifest to drop `tasks.backend: json` | the splice check fails |
| Board containment | delete `tasks.db_path` from the copy | `resolveStorageRoot` falls through to the git-common-dir branch and returns the copy root — containment **passes vacuously**. The operator must recognise this as a vacuous pass, not a pass. This is the trip that makes the anti-vacuity argument concrete, and it is the **same identity Task 4 records**: at the copy root the git-common-dir fallback and the spliced value are byte-identical, which is why Task 4 asserts on the parsed leaf and against a *different* cwd rather than on a same-cwd difference |
| `prototype` teardown | skip the `kill` | a listener survives the probe and the scenario is reported failed |
| Record collision | write `-01` twice | `{flag: 'wx'}` refuses terminally |

- [ ] **Commit**

`docs(eval-harness): record the first manual Tier B pass over the change-imminent tier`
Trailers: `Spec: .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`, `Plan-task: 9`

---

## Spec Coverage Map

Every acceptance criterion in spec revision 15, in spec order, with the task that discharges it. Criteria the plan does **not** discharge with a test are marked and say why. This table exists so a reviewer can check coverage by reading rather than by re-deriving it, and so a later spec revision shows up here as an unmapped row.

Many criteria in this spec are explicitly **two-halved** — a file half checked by `rubric-coverage.test.mjs` and a runtime half performed by the operator. Those rows name both tasks.

| # | Section | Criterion (abbreviated) | Task |
|---|---|---|---|
| 1 | Artifact shape | `tiers.yaml` parses, exactly five top-level keys, no `tiers_version`, bucket tokens match `^[a-z][a-z0-9-]*$`, four buckets partition `ls skills/` | 1 |
| 2 | Artifact shape | All 11 rubrics and 11 scenarios exist, one per `change_imminent` slug | 5, 6, 7, 8 (asserted as a set at the real root in 8) |
| 3 | Artifact shape | Every rubric loads through `loadRubric` without error | 2 (mechanism), 5–8 (applied per file) |
| 4 | Artifact shape | Every rubric satisfies the shared contract table | 2 (rules), 8 (real-root application) |
| 5 | Artifact shape | ≥5 `required_elements`, 3–6 `quality_dimensions` | 2 (`RUBRIC_ELEMENT_FLOOR` + boundary cases) |
| 6 | Artifact shape | No nested map, no list inside a list item | 2 — surfaced from `loadRubric`'s `RUBRIC_NESTED_MAP` unmodified, with its own rejecting input |
| 7 | Baseline fidelity | Every element describes the skill **as it behaves today**, verified once at authoring time, resolving in one pass | 5, 6, 7, 8 — **the one criterion with no file half by design.** A rubric author verifying a baseline at authoring time leaves nothing in the scenario file to check. Discharged as an explicit authoring-run step per task, with the exit taken recorded in the commit body; **no hosted assertion exists or can exist at v1** |
| 8 | Baseline fidelity | A `met`-anyway behaviour is filed and pinned in `baseline_exception_issue`, shape-validated | 2 (`RUBRIC_EXCEPTION_ID_MALFORMED`), 5–8 (the filing). **Shape is the only guarantee**: nothing resolves the id against the board — handed to CI-integration as intake item 8 |
| 9 | Detector coverage | Each detector rubric cites ≥1 `PV-nn` and its `KC` twin | 5 (positive assertion), 2 (`RUBRIC_TWIN_UNCITED` negative) |
| 10 | Detector coverage | Every cited catalog id resolves, via the fixture's `CATALOG_UNRESOLVED_CITATION`; no alias minted here | 5 — discharged by asserting the fixture scan's file list **grew** to include the three new rubric paths |
| 11 | Detector coverage | `RUBRIC_SOURCE_PATH_ESCAPE` fires for an escaping `artifact:` and an escaping `scenario`, realpath-contained, escape before existence, proven by a nonexistent traversal path | 2 (three rejecting inputs incl. the symlinked-base acceptance case) |
| 12 | Detector coverage | No producer or responder rubric cites a catalog id | 6, 7, 8 — **spec marks this review-time convention with no code; this plan lands a predicate anyway** (`!/skill-regression:/` over all **eight** producer/responder rubrics), scoped to this tier because the core tier does not carry the restriction. Task 6 covers the four state writers, Task 7 the three reporters, and **Task 8 the sole responder** (`using-adev.yaml`, authored there) — the eleventh stem, without which the criterion's "or responder" clause would be prose only |
| 13 | Coverage check | `rubric-coverage.test.mjs` in the default bucket (`run-tests.mjs --list`) | 8 |
| 14 | Coverage check | Each of the eleven rules proven by a rejecting input; `RUBRIC_SCENARIO_STEP_MISSING` proven **per token branch**; the `ADEV_NO_INFRA` branch proven here against a synthetic `build`-shaped fixture | 1 (4 rules), 2 (6 rules), 3 (the eleventh, 20 branches) |
| 15 | Coverage check | `RUBRIC_TIER_UNCOVERED` fires for a missing rubric in a `landed:` bucket, and does **not** fire for a bucket absent from it | 1 (both directions, synthetic), 8 (real root) |
| 16 | Coverage check | At the landing state — `landed: "change_imminent"`, 11 rubrics, `core_lifecycle`/`remaining` unrubriced — the rule does not fire and `npm test` is green | 8 |
| 17 | Coverage check | Each scenario states where `outputs/` lives (token 7); the containment itself verified by the operator | 3 (file half, synthetic), 8 (file half, real root), 9 (operator half) |
| 18 | Coverage check | `RUBRIC_EXCEPTION_ID_MALFORMED` fires on **either** key, each with its own rejecting input | 2 |
| 19 | Coverage check | Adding a new `skills/` directory fails `RUBRIC_TIER_INCOMPLETE` until bucketed | 1 — shipped as a rejecting fixture over a synthetic `skillsRoot`, not a one-time `mkdir` |
| 20 | Gates | `npm test` passes | 8, Quality Gates |
| 21 | Gates | The Tier B pass is run by hand and recorded in `.context-index/evals/tier-b-<date>-<NN>.md`, with the naming/collision/discovery convention and the three write properties | 9 — **manual, no hosted assertion.** The convention's `{flag: 'wx'}` half binds the CI-integration writer (intake items 5 and 10), not the v1 operator |
| 22 | Gates | `run-tests.mjs --evals --list` lists nothing under `tests/evals/skill-regression/` | 8 |
| 23 | Gates | The operator confirms teardown removed only the two `mkdtempSync`-returned roots | 3 (token 9 file half), 9 (operator half) |
| 24 | Gates | The operator applies `^[A-Za-z0-9._/-]+$` to the copy root by eye before pasting | 3 (token 8 file half), 9 (operator half) |
| 25 | Gates | The operator half of the **two door predicates**, before and after each scenario; halt writes no record; retained copy never re-entered as a cwd | 3 (tokens 12 and 13 file halves), 9 (operator half + the halt discipline) |
| 26 | Gates | The operator half of the **two splice tokens** — `db_path` string equality, `tasks.backend: json` survival, comment survival on text | 3 (tokens 10 and 11 file halves), 4 (the splice's own unit proof), 9 (operator half on a real copy) |
| 27 | Gates | The `issues` scenario is where board containment is confirmed | 6 (scenario), 9 (operator half) |
| 28 | Gates | **Every** scenario states the before/after `git status` + `rev-parse HEAD` equality at every `git worktree list --porcelain` root | 3 (token 14, all eleven), 9 (capture and comparison) |
| 29 | Gates | **Every** scenario states cwd = realpathed copy root, per-write `isContained`, and `artifact:` re-resolution after the run | 3 (tokens 4, 5, 6), 9 (containment confirmed) |
| 30 | Gates | The `prototype` scenario states all four clauses, each with its own literal, plus the fail-and-report behaviour | 7 (file half, real root), 3 (the branch's rejecting inputs), 9 (operator half). The **automated** argv discipline for the port and git probes is **not discharged here** — this tier ships no artifact in which an argv form could be written; handed to CI-integration as intake item 11 |
| 31 | Gates | No constitutional violations introduced | Quality Gates; the boundary check in Task Summary |

**Twenty-nine of thirty-one are discharged by a test in a named task.** The two that are not:

- **#7 (baseline fidelity)** — has no file half **by the spec's own design**, and no artifact in this tier can run a scenario. Scheduled as an explicit authoring-run step in Tasks 5, 6, 7 and 8, with the exit recorded in the commit body. This is the criterion most at risk of being silently skipped, which is why every rubric task names it separately from its falsification table.
- **#21 (the Tier B pass)** — inherently manual at v1: `scripts/run-tests.mjs` collects only `*.test.mjs` and this tier ships none under `tests/evals/`. Task 9 owns it, and its "falsify the pass itself" step is the closest thing to a guard the pass can have.

Eight further rows (#17, #23–#30) are **two-halved**: their file half is a real assertion in Task 3, 7 or 8, and their runtime half is an operator obligation in Task 9. A reviewer checking coverage should read those rows as half-automated, not as automated.

Two rows exceed what the spec asks. #12 is spec-labelled "enforced by no code" and this plan lands a predicate anyway, per the plan's own heuristic — a universal coverage claim must ship with the predicate that checks it. #19's case is shipped as a durable rejecting fixture rather than the one-time `mkdir` the criterion's wording suggests.

**Not in the acceptance criteria, tracked anyway:** the three reference-anchoring requirements (`eval`, `sync`, `issues`) are spec-labelled review-time convention with no predicate. Tasks 6 and 7 land predicates for all three, and the coverage map records this as a plan-level addition rather than a criterion.

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (`node scripts/run-tests.mjs`) — the project's single gate, and the `id: test, tier: fast` entry in `.context-index/governance/gates.yaml`
- The new guard **is** in that run: `node scripts/run-tests.mjs --list` lists `tests/lib/evals/rubric-coverage.test.mjs`
- The tier's data is **not**: `node scripts/run-tests.mjs --evals --list` lists nothing under `tests/evals/skill-regression/`. The absence is expected and pinned, not a broken harness
- The fixture's own guards stay green and unmodified: `tests/lib/evals/skill-regression-catalog.test.mjs` and `tests/lib/evals/skill-regression-hermeticity.test.mjs` both pass, and `git diff --stat` reports **zero** changes to either file. This tier consumes the fixture; it must not loosen it
- Every guard has been proven able to fail: each task's falsification table is recorded in its commit body. Across the plan that is roughly seventy perturbations, twenty of them Task 3's per-token branches
- No inline Node added to any SKILL.md: `.githooks/pre-commit` → `hooks/pre-commit-no-inline-node.sh` (exit 2 = policy violation). No task touches a SKILL.md, so this gate is expected to be a no-op — recorded so a surprise is visible
- Source manifest complete and stamped: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/rubric-set-change-imminent.spec.md`
- All 31 acceptance criteria from spec revision 15 accounted for in the Spec Coverage Map, with the two undischarged rows (#7, #21) explicitly manual
- Zero new external dependencies (constitution Principle 1). **Two** new non-test production files: `lib/evals/rubric-coverage-codes.mjs` (a frozen data array — no functions, no I/O, no imports) and `scripts/eval-scenario-setup.mjs` (Node built-ins only). No new CLI verb, and no new library **module** in the sense the spec bars — the codes file is data, per ADR-0019 Part A and the `lib/evals/catalog-codes.mjs` precedent, whose own validator likewise stays in `tests/`
- No version bump in `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` (ADR-0008 — release-please owns those)

`.context-index/governance/gates.yaml` exists; where its definitions differ from the constitution's Quality Gates block, `gates.yaml` wins. Probabilistic gates with no command are noted as skipped by `/adev:validate` rather than run here.

**Not gated here, deliberately:**

- **No gate asserts an automated scenario run.** Nothing in this tier executes a scenario, and `npm run test:evals` discovers nothing for it. Naming it as this tier's trigger would be a claim that fails the moment anyone checks. It becomes discoverable when the charter's CI-integration capability ships a driver under `tests/evals/skill-regression/` — at which point Task 8's `--evals --list` emptiness assertion goes red, which is the intended signal.
- **No gate asserts a Tier C run.** Tier C is wired to no scheduled or CI trigger until the budget-threshold capability lands. This tier contributes 36 of the nightly dispatches when it does — one per judged criterion, single-criterion isolation being a property of `buildJudgeContext`, not of the dispatch count.
- **Eleven obligations are handed to the CI-integration capability**, listed in the spec's own intake section, plus a **twelfth this plan adds** — the answer-key paired A/B (Task 5). Three of them bear directly on this plan and are restated so they are not mistaken for gaps in it: the scenario driver (Task 9 is manual because of it), the source resolver (`output:` has no machine reader, so no gate can resolve one), and the argv discipline for the automated port and git probes (criterion #30's automated half).
- **`issue-dzxjoa` is not resolved by this plan, and no experiment in this plan makes it decidable.** It is a spec-level decision about the fixture. Task 5 states which six assertions depend on its outcome, phrases them so either resolution drops in cleanly, and sizes the redaction at **thirteen** files inside `tests/evals/skill-regression/project/` — re-derived by `git grep -lE "planted|known-clean"`, three of them markdown body prose rather than comments — should this tier end up owning it. The question *does the in-file answer key inflate detector scores?* needs a paired A/B over label-stripped copies with a repeat budget; it is handed to the CI-integration capability rather than answered by one run in each direction.
