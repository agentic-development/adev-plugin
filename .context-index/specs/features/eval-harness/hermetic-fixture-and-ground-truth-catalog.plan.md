# Implementation Plan: Hermetic Fixture and Ground-Truth Catalog

> **Methodology:** adev
> **Charter:** .context-index/specs/features/eval-harness/charter.md
> **Spec:** .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md
> **Review:** PASS_WITH_NOTES (2026-08-22, revision 15)
> **Platform:** JavaScript (ESM, `.mjs`), Node.js, npm, `node:test`

**Goal:** Ship `tests/evals/skill-regression/` — a committed, hermetic mini-project with ten planted-violation / known-clean pairs, a machine-checked catalog binding each pair to the skills that must detect it, and two Tier A tests that keep the catalog honest and the fixture isolated from this repository.

**Architecture:** The fixture is committed data, not code: a `project/` tree that looks like a real adev-managed repo (constitution, manifest, specs, ADRs, lifecycle logs, an issue board) with defects planted at known anchors. `catalog.yaml` is the contract between that tree and every rubric — thirteen `CATALOG_*` integrity rules make a citation that names nothing fail loudly rather than score zero. Two `node:test` files in the default `npm test` bucket enforce it: one for catalog integrity, one for hermeticity (eleven properties, of which nine are static reads of the committed tree). Nothing here executes a scenario; the run model is specified so the two rubric-set tiers can consume it, but no driver ships until the CI-integration capability lands.

**Review notes carried into this plan (PASS_WITH_NOTES):** three warnings from round 15 were applied after the reviewers reported and therefore carry no reviewer sign-off — the `catalog_id` literal pin (Task 3), the default citation-scan root non-vacuity proof (Task 5), and the `CATALOG_*` codes as an exported constant (Task 5). Task 5 and Task 6 are where they land; flag them in `/adev:implement` review if they read wrong.

---

## File Structure

**Create — fixture scaffolding (33 files under `tests/evals/skill-regression/`):**

- `README.md` — the pair-or-do-not-add rule, plus the `--dry-run` and run-copy `tasks.db_path` authoring rules
- `catalog.yaml` — `catalog_id`, `fixture_root`, `planted_violations`, `known_clean`, `scaffolding`
- `project/package.json` — two declared deps, **no** `scripts` key
- `project/CLAUDE.md`, `project/AGENTS.md` — agent files, no `@`-imports
- `project/docs/api.md` — the `undocumented-public-api` twin's reference surface
- `project/src/index.mjs`, `project/src/orders/create-order.mjs`, `project/src/orders/legacy-loader.js`, `project/src/orders/orphaned-helper.mjs`, `project/src/shipping/rates.mjs`
- `project/tests/create-order.test.mjs`
- `project/.context-index/` — `constitution.md`, `manifest.yaml`, `platform-context.yaml`, `deploy.yaml`, `governance/validate.yaml`, `governance/review.yaml`, `specs/product.md`, `specs/features/orders/{charter.md,create-order.spec.md,create-order.plan.md,shipping-rates.spec.md,shipping-rates.plan.md}`, `adrs/0001-esm-only.md`, `memory/heuristics/orders.md`, `samples/order-pipeline-create-order.md`, `lifecycle-state/{create-order.jsonl,shipping-rates.jsonl}`, `evals/{orders-rubric.yaml,config.yaml,orders-verdicts.json}`, `tasks/tasks.json`

**Create — tests:**

- `tests/lib/evals/skill-regression-catalog.test.mjs` — thirteen integrity rules, each with a rejecting fixture
- `tests/lib/evals/skill-regression-hermeticity.test.mjs` — eleven hermeticity properties, the seed-content assertions, two isolation assertions, the loader-level minimum-enabled check, two manifest-key assertions, the bucket check, the zero-argument `createTempGitRepo` assertion, the `--dry-run` and `tasks.db_path` README assertions, and two falsification artifacts
- `lib/evals/catalog-codes.mjs` — exported `CATALOG_ERROR_CODES` constant (ADR-0019 Part A: a code registry is a lib constant, importable by the tier's `rubric-coverage.test.mjs`)

**Modify:**

- `.context-index/manifest.yaml` — add `tests/evals/skill-regression/**` to `repomap.exclude`, by **text splice**, never a parse-and-reserialize

**Reference (read, do not modify):**

- `.context-index/manifest.yaml:286` — the `tests/evals/adev-api-eval/dist/**` precedent for the splice
- `lib/path-safety.mjs` — `resolveContained` / `lenientRealpath` / `isContained`
- `lib/extensions/exec-payload.mjs:158` — `assertContained`, the escape-before-existence ordering this fixture mirrors
- `tests/helpers.mjs:43,58,108` — `createTempDir`, `cleanupTempDir`, `createTempGitRepo`
- `lib/extensions/governance-splice.mjs` — the text-splice rationale for the manifest edit

---

## Context Packets

### Tasks 1–3 Context (scaffolding tree)
- Spec: `hermetic-fixture-and-ground-truth-catalog.spec.md` — Structural Shape, Seed Content, Required Files
- Charter: `eval-harness/charter.md` (capability: Hermetic fixture + ground-truth catalog)
- Reference tree: this repository's own `.context-index/` as the shape to imitate — read for structure, never copied
- Templates: `templates/manifest-template.yaml` (key names and nesting only)
- ADR: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` (the `kind:` requirement, Decision §1 and §3)

### Task 4 Context (dirty slice)
- Spec: Seed Content → the ten-class table, and "Skills the seed does not give a planted violation"
- Tasks 1–3 output: the `create-order` clean slice, as the parity baseline
- Constraint: the two slices differ at exactly three things — anchors, pinned `status:`, lifecycle chains

### Task 5 Context (catalog)
- Spec: Structural Shape → `catalog.yaml` keys; the ten-class table; the `scaffolding` role enum
- Tasks 1–4 output: every path and anchor the catalog cites must already exist
- Constraint: `catalog_id` is pinned to the literal `skill-regression`

### Task 6 Context (README)
- Spec: "The growth rule"; the `--dry-run` obligation; the run-copy `tasks.db_path` authoring rule; the criterion that the committed manifest omits `tasks.db_path`

### Task 7 Context (catalog-integrity test)
- Spec: Catalog Integrity Rules (all thirteen), "Two mechanisms the rules above depend on", "The citation scan's root"
- Source: `lib/path-safety.mjs` (full), `lib/extensions/exec-payload.mjs:158-195` (`assertContained` ordering), `lib/profiles/yaml.mjs` (parser limits)
- Sample: `tests/lib/evals/rubric-legacy-scale.test.mjs` — the house pattern for a rejecting-input test
- Heuristic: "A universal coverage claim must ship with the predicate that checks it" — directly load-bearing for the default-root non-vacuity proof

### Task 8 Context (hermeticity test)
- Spec: Hermeticity Rules (all eleven), Acceptance Criteria → Hermeticity and Isolation
- Source: `tests/helpers.mjs` (full), `lib/worktree.mjs:57`, `lib/repomap/index.mjs:186,278,489`, `lib/governance/validate-config.mjs:337`, `lib/governance/review-config.mjs:623`
- Constraint: the write-escape equality must be proven able to go red before it is trusted green

### Task 9 Context (repomap exclusion)
- Spec: Acceptance Criteria → Isolation
- Source: `.context-index/manifest.yaml:269-286` (the existing `repomap.exclude` block and its precedent entry)
- Reference: `lib/extensions/governance-splice.mjs` header — why this is a text splice

---

## Heuristics

> These heuristics are a snapshot from plan generation for review convenience.
> At execution time, `/adev:implement` reads from the live heuristic store.

### A universal coverage claim must ship with the predicate that checks it (confidence: medium)
- **Pattern:** When closing a coverage gap in a spec or acceptance criterion, state the executable check alongside the claim — the exact command or match, and the paths it runs over. Scope it to live surfaces and exclude directories that archive review artifacts.
- **Anti-pattern:** Widening the assertion to "no occurrence anywhere in the repository". An unbounded universal followed by a bounded list of examples cannot be discharged, and reads as coverage while providing none.
- **Applies to:** Tasks 7 and 8 — every `CATALOG_*` rule and every hermeticity property must name the paths it runs over and ship a rejecting input.

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Every task in this chain either extends a test file its predecessor created or cites files its predecessor authored, and all six touch `skill-regression-hermeticity.test.mjs` or `skill-regression-catalog.test.mjs`. Running any two concurrently is a merge conflict, not a speedup.
- Group B (the two run in parallel with each other, both after Group A): Task 7 completes `skill-regression-catalog.test.mjs`, Task 8 completes `skill-regression-hermeticity.test.mjs` — disjoint files, no overlap.
- Task 9 runs **last**: it modifies the root `.context-index/manifest.yaml` and adds two assertions to `skill-regression-hermeticity.test.mjs`, the file Task 8 last touches. It is not independent and must not be scheduled first — the suite it extends does not exist until Task 1, and the property its effect assertion sits beside is Task 8's.

So the only real concurrency in this plan is Task 7 alongside Task 8. Group B cannot start before Group A completes: both tasks extend suites their Group A predecessors created, and both assert against a fixture tree and catalog that must already be on disk.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Fixture source surface + five static hermeticity properties | medium | unit | — | 7 create, 0 modify |
| 2 | Fixture `.context-index/` config layer + properties 5 and 7 | medium | unit | Task 1 | 6 create, 1 modify |
| 3 | Fixture clean-slice lifecycle artifacts + properties 6 and 9 | medium | unit | Task 2 | 9 create, 1 modify |
| 4 | Plant the dirty slice + seed-content assertions | medium | unit | Task 3 | 9 create, 1 modify |
| 5 | Catalog authoring + code registry + shape conformance | medium | unit | Task 4 | 3 create, 0 modify |
| 6 | README + the three authoring-rule assertions | small | unit | Task 5 | 1 create, 2 modify |
| 7 | Complete the catalog-integrity test (thirteen rejecting fixtures) | large | unit | Task 6 | 0 create, 1 modify |
| 8 | Complete the hermeticity test (run copy + falsification) | large | unit | Task 6 | 0 create, 1 modify |
| 9 | Repomap exclusion + the two pinned isolation assertions | small | unit | Task 8 | 0 create, 2 modify |

All nine tasks resolve to `strategy: unit` (source: fallback — the spec declares no `test_strategy`, `manifest.yaml` declares no `test_strategies` globs, and detection returns `unit` for `tests/**` and `lib/**` paths). Per the Strategy Summary rule that section is omitted. The spec declares no `infra_requirements:` and no task carries a non-unit strategy, so the Test Infrastructure Requirements section is omitted as well. Task 8 shells out to `git status` and copies a tree into `os.tmpdir()`; both are process-local and need no network, credential, or external system, so it is a unit test that happens to fork.

**Test granularity:** `per-behavior` (source: manifest — `test_policy.granularity`). Two suites, one per Tier A obligation the spec names: catalog integrity and hermeticity. The spec's obligations are properties of one artifact rather than numbered behaviours, so the per-behaviour unit here is the property, and each property is its own `test()` inside its suite.

**TDD shape for the data-authoring tasks (1–6).** The fixture tree and the catalog are committed data, not code. Their red state cannot come from a test that would sit red in the repository between commits, so each data task lands *with* the subset of Tier A assertions that covers its own output: Task 1 creates `skill-regression-hermeticity.test.mjs` holding properties 1, 2, 3, 4 and 8; Task 2 adds 5 and 7; Task 3 adds 6 and 9; Task 4 adds the seed-content assertions; Task 5 creates `skill-regression-catalog.test.mjs` with the thirteen rules applied to the real catalog; Task 6 adds the authoring-rule assertions to both suites. Tasks 7 and 8 then complete each file with the rejecting fixtures, the run-copy properties, and the falsification artifacts. Every task is red-then-green on its own assertions, and every commit leaves `npm test` green — no task parks a known-red assertion for a later task to satisfy.

**On task sizing.** Tasks 1–4 each create between six and nine files, above the plan reviewer's five-file guidance. Every one of those files is committed test data under `tests/evals/skill-regression/`, which the guidance excludes: the rule exists because a subagent editing many *production* files loses context and half-implements. The production-file counts here are 0 for Tasks 1–4, 1 for Task 5 (`lib/evals/catalog-codes.mjs`), 0 for Tasks 6–8, and 1 for Task 9 (the manifest splice). The tree was nonetheless split three ways along its natural seams — source surface, config layer, lifecycle artifacts — rather than left as one 24-file task, because each seam has its own hermeticity properties and therefore its own red-green cycle. Splitting further would produce tasks with data but no assertion to turn green.

**Falsification is a required step, not a nicety.** Nine of the eleven hermeticity properties and all thirteen catalog rules are guards over content that is *correct at authoring time*, which is exactly the condition under which a guard that asserts nothing still passes. Every task below therefore names the perturbation that must turn its assertions red before they are trusted green, and Task 6 ships two of those perturbations as durable artifacts (the probe write and the `@`-import rejecting fixture) rather than as one-time manual checks.

**Specialist routing:** `manifest.yaml` declares `specialists: []`, so every task is `[specialist: none]`. No routing tags are available to assign.

**Constitution boundary check:** no task creates a service, touches auth, changes the hook protocol, alters the CLI installation path structure, changes the plugin registration format, or adds a dependency. Tasks 1–4 add committed test data under `tests/evals/`. Tasks 5–6 add tests (explicitly autonomous). Task 9 edits the project manifest's `repomap.exclude` list, which is project configuration rather than plugin registration. **No task bumps `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json`** — release-please owns those (ADR-0008). `governance/boundaries.yaml` rules are content-matched (CommonJS, inline-Node, `~/.claude/` literals): no task touches a `skills/**/SKILL.md`, and `project/src/orders/legacy-loader.js` is a *planted* CommonJS violation inside `tests/evals/`, which the boundary rules' own scope excludes — Task 1 verifies that exclusion rather than assuming it.

---

### Task 1: Fixture source surface + five static hermeticity properties [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files** (the seven fixture files are committed test data under `tests/evals/`; the eighth entry is this task's test):
- Create: `tests/evals/skill-regression/project/package.json`
- Create: `tests/evals/skill-regression/project/CLAUDE.md`, `project/AGENTS.md`
- Create: `tests/evals/skill-regression/project/docs/api.md`
- Create: `tests/evals/skill-regression/project/src/index.mjs`, `project/src/orders/create-order.mjs`
- Create: `tests/evals/skill-regression/project/tests/create-order.test.mjs`
- Create: `tests/lib/evals/skill-regression-hermeticity.test.mjs` (properties 1, 2, 3, 4, 8 only)
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Tests:** create the hermeticity suite holding the five static properties that are decided by the source surface alone. Properties 5, 6, 7 and 9 need the fixture's `.context-index/` and belong to Tasks 2 and 3; properties 10 and 11 need a run copy and belong to Task 8. Nothing is stubbed — a stubbed property is a property that reads as covered.

**Context to load:** the Tasks 1–3 Context Packet above.

- [ ] **Write failing test**

Create `tests/lib/evals/skill-regression-hermeticity.test.mjs` with one `test()` per property, each resolving `FIXTURE = path.join(repoRoot, 'tests/evals/skill-regression')` and walking it with `fs.readdirSync(..., { withFileTypes: true })`:

1. **No symlinks** — walk every entry; `dirent.isSymbolicLink()` is false everywhere. Assert the walk visited a non-zero number of entries.
2. **No submodules** — read `.gitmodules` at the repo root (absent is a pass); no `path = ` value has `tests/evals/skill-regression/` as a prefix.
3. **No container runtime** — no `Dockerfile`, `docker-compose.yml`, or `compose.yaml` anywhere under the fixture.
4. **No install ever runs inside the fixture** — the root `package.json` has no `workspaces` field, or if it gains one, no entry of it matches the fixture path. `project/package.json` parses, declares exactly two dependencies, and has **no** `scripts` key.
8. **No agent-runtime surface** — `project/.claude/`, `project/.mcp.json`, `project/.context-index/skill-extensions/`, `project/.context-index/profiles.yaml`, `project/.context-index/tool-categories.yaml`, `project/.context-index/domains/`, `project/.context-index/extensions/`, `project/adev-workspace.yaml`, `project/workspace.yaml`, `project/.workspace/` all do not exist.
   Two more directories join this list for a different reason — they are where **this repository dynamically imports fixture-authored module code**, not where it loads agent config: `project/lib/` (`resolveVersion`'s `join(projectRoot, 'lib', …)`) and `project/.context-index/diagnostics/`. Assert both absent here, and say in a comment that they are exec doors rather than runtime surfaces, so a later editor does not "tidy" them into the wrong list.

Also assert, in this same file, that the fixture's planted CommonJS will be out of `boundaries.yaml`'s scope: load `.context-index/governance/boundaries.yaml`, and for each content-matched rule confirm its path scope does not select `tests/evals/**`. This is the check that makes Task 4's `legacy-loader.js` safe to land, and it is asserted before that file exists rather than after it starts failing a hook.

(The property numbers here and in Tasks 2, 3 and 8 are the spec's Hermeticity Rules row numbers, kept stable across tasks so a reader can map a test name to a spec row without a translation table.)

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — the fixture directory does not exist, so property 1's non-zero-entries assertion and property 4's `project/package.json` parse both fail on missing paths.

- [ ] **Implement**

Author the seven files. Load-bearing shape notes:

- `project/package.json` declares exactly two dependencies and **no** `scripts` key. It keeps the fixture compliant with constitution principle 1 (nothing installs or resolves those deps, so the repository's tree is unchanged), and its mere presence makes `scripts/run-tests.mjs::isNestedProjectFile` classify `project/tests/` as a nested project's own suite.
- `project/docs/api.md` documents the `create-order` surface and **not** the `shipping-rates` surface — that omission is the `undocumented-public-api` plant Task 4 completes.
- `project/src/orders/create-order.mjs` is the clean twin: ESM, documented, imported by `src/index.mjs`, covered by `project/tests/create-order.test.mjs`.
- `project/CLAUDE.md` and `project/AGENTS.md` contain no `@`-imports (property 9 asserts this in Task 3; the files must be authored that way here).

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS — five properties plus the boundaries-scope assertion.

- [ ] **Falsify each guard**

Apply each perturbation, confirm the named test fails, revert:

| Property | Perturbation |
|---|---|
| 1 | `ln -s ../../../package.json tests/evals/skill-regression/project/link.json` |
| 2 | add a `.gitmodules` stanza whose `path` is under the fixture |
| 3 | `touch tests/evals/skill-regression/project/Dockerfile` |
| 4 (scripts half — criterion 29) | add `"scripts": {"test": "echo"}` to `project/package.json` |
| 4 (workspaces half — criterion 27) | add `"workspaces": ["tests/evals/skill-regression/project"]` to the **root** `package.json` — the two halves are independent criteria and one perturbation cannot prove both |
| 8 | `mkdir tests/evals/skill-regression/project/.claude` |
| 8 (exec doors) | `mkdir tests/evals/skill-regression/project/lib` — must fail for the exec-door reason, separately from the `.claude` case |
| boundaries scope | add a `tests/**` glob to one content-matched rule in `boundaries.yaml` |

Record the eight confirmations in the commit body. A property whose perturbation still passes is a defect in the property, not in the perturbation.

- [ ] **Commit**

`test(eval-harness): add skill-regression fixture source surface + five static hermeticity properties`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 1`

---

### Task 2: Fixture `.context-index/` config layer + properties 5 and 7 [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all six are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/project/.context-index/constitution.md`
- Create: `project/.context-index/manifest.yaml`
- Create: `project/.context-index/platform-context.yaml`
- Create: `project/.context-index/deploy.yaml`
- Create: `project/.context-index/governance/validate.yaml`, `governance/review.yaml`
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs` — properties 5 and 7, the governance-surface scan, and the minimum-enabled check
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Tests:** extend Task 1's suite with the two properties that are decided by the fixture's own configuration, and with the check that keeps the command-free constraint from sliding into a check-free one.

**Context to load:** the Tasks 1–3 Context Packet above.

- [ ] **Write failing test**

5. **No step this repo would spawn** — `project/.context-index/deploy.yaml` parses and every step's `type` is the literal `manual`. Assert on the parsed set, not on the absence of the string `shell`: a comment mentioning shell must not fail, and a `type: gate` must. `lib/deploy.mjs` spawns `step.command` for `shell` (`:308`), `verify` (`:392`), `gate` (`:444`, `executeGate` in a polling loop) **and** `ci-trigger`, so all four are rejected and only `manual` executes nothing. Assert separately that **no step carries a `rollback:` field** — a rollback body is a second command surface the step-type check does not reach.
7. **Every path the fixture manifest declares stays inside `fixture_root`** — parse `project/.context-index/manifest.yaml`, collect **every** path-valued key it declares (do not hardcode a list of key names; derive it by walking the parsed object for string values that look like paths), and assert `isContained(lenientRealpath(resolve(fixtureRoot, v)), lenientRealpath(fixtureRoot))` for each, escape decided before existence. Assert the collected set is non-empty — an empty enumeration passes vacuously and is precisely the failure this plan's heuristic names, and assert it includes `lifecycle.partial_roots`, whose values *widen a containment allowlist* rather than merely naming a path. This property runs against the **committed** tree, not a copy: `tasks.db_path` is deliberately absent from the committed manifest (the board-containment property in Task 8 covers the resolver's output instead), so a walk that finds it here means the fixture was authored wrong.

Plus, in the same commit:

- **Command-free governance — five banned keys, not four.** No `command:`, `poll_command:`, `runner:`, `package:` or `prompt_text:` key appears anywhere under `project/.context-index/governance/`. The first three reach execution. `package:` and `prompt_text:` are banned for a different reason and the test comment must say so: `review-config.mjs` *admits* both as reviewer forms, so a loader-level assertion on the admitted set cannot reject either — `package:` resolves a `package.skill`/`package.adapter` pair the orchestrator dispatches as an external skill, and `prompt_text:` carries fixture-authored reviewer prose inline with no path resolution and no existence check. `runner:` is the one a field-pair ban misses: `lib/diagnostics/index.mjs` resolves `runner: project:<rel>` and `await import`s it in-process with no `--allow-exec`.
- **Three governance files that must not exist** — no `gates.yaml`, no `diagnostics.yaml`, and no `boundaries.yaml` under `project/.context-index/governance/`. `boundaries.yaml` is the file that would compile a `pattern:` into a `RegExp`; nothing the fixture needs requires any of the three. Assert the fixture constitution has no Quality Gates block as well: `/adev:eval` falls back to it when `gates.yaml` is absent (`skills/eval/SKILL.md:75`), which is the door one over from the one the `gates.yaml` ban closes.
- **`prompt:` shape, asserted rather than assumed** — every `prompt:` value under the fixture's governance files matches `^plugin:[a-z-]+/`, and the **loader-resolved** path for each is contained under `<pluginRoot>/skills/`. Assert the resolved path, not merely that the value is "outside the copy": `/etc/anything` is also outside the copy. Assert the iterated `prompt:` set is non-empty.
- **The materialization marker, on exactly one file.** `review.yaml` carries `materialized_at`, so no scenario is pushed onto the `adev governance materialize` path — the path that would pull a domain overlay in. `validate.yaml` carries none and must not: `registry-marker.mjs`'s `MARKED_REGISTRIES` is `{review.yaml, diagnostics.yaml, gates.yaml}`, `assertMaterialized` throws `MARKER_INPUT_INVALID` when pointed at an exempt registry, and `adev governance materialize` refuses it outright. Assert both halves — present on one, absent on the other — since asserting only the present half would pass on a fixture that marked everything.
- **Minimum enabled checks, through the loaders.** Load both configs through `loadValidateConfig` / `loadReviewConfig` **against the fixture root** and assert on the *admitted* sets, never on a raw YAML read: `validate.yaml` admits at minimum the constitution-compliance and spec-compliance checks, and `review.yaml` admits at minimum the reviewer that produces a `charter-scope-escape` finding. A raw read satisfies "enabled" while the loader admits nothing — `resolvePromptUri` returns `null` on `PROMPT_CROSS_PLUGIN`, `PROMPT_PATH_ESCAPE` or `PROMPT_NOT_FOUND`, and the last is the likeliest drift in practice: a renamed check prompt under `<pluginRoot>/skills/` reads as enabled and admits nothing. Assert also that `loadValidateConfig`'s `errors[]` is empty, so a dropped check surfaces rather than vanishing. Command-free is the constraint; check-free would silently unscore the `validate`, `review-specs` and `build` rubrics and make the `esm-violation` pair unassertable, and this pair of assertions is what tells those two apart.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — `deploy.yaml` and `manifest.yaml` do not exist; property 7's non-emptiness assertion fails on an empty set and the loader calls throw on the missing configs.

- [ ] **Implement**

Author the six files. Load-bearing shape notes:

- `manifest.yaml` declares `tasks.backend: json`, declares no `workspace` key (both values are falsified in Task 8, which is where they are asserted), and **declares no `tasks.db_path` at all** — the committed manifest deliberately omits it, so a run resolves the board through `resolveStorageRoot` inside the copy (Task 8's board-containment property) rather than through a committed string. The `tasks.db_path` an author writes into a *run copy* is a README authoring rule (Task 6), not a committed value. `tasks.backend: json` matters on its own: `lib/issues/registry.mjs` selects `BeadsAdapter` on `beads`, which spawns `execFileSync("br", …)` — an external binary inside a fixture whose charter attribute is no network and no container runtime. Containment survives either way, which is why board containment does not catch it and it needs its own assertion (Task 8).
- `validate.yaml` and `review.yaml` ship command-free but **not** check-free. `prompt:` stays: it is required on `subagent-review` checks (`lib/governance/validate-config.mjs:297`) and on reviewer entries (`lib/governance/review-config.mjs:535`), and banning it would break the three core-tier rubrics this file exists to keep scoreable. Use `plugin:validate/checks/<file>.md` in `validate.yaml` and `plugin:review-specs/<file>.md` in `review.yaml` — both resolve into the plugin root, so no fixture-side prompt file ships. `review.yaml` carries `materialized_at`; `validate.yaml` does not.
- `deploy.yaml` carries no `rollback:` field on any step.
- `deploy.yaml` declares only `type: manual` steps, and enough of them that the `deploy` rubric has a `--dry-run` transcript worth scoring.
- `constitution.md` carries no Quality Gates block.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS — Task 1's five properties plus 5, 7, the five-key governance scan, the three banned-file checks, the `prompt:` shape assertion, the marker pair, and the minimum-enabled check.

- [ ] **Falsify each guard**

| Guard | Perturbation |
|---|---|
| 5 | change one `deploy.yaml` step to `type: gate`, then `verify`, then `ci-trigger` — all three must fail |
| 5 rollback | add a `rollback:` field to one `manual` step — must fail while the step type is still legal |
| 7 | point one fixture-manifest path key at `../../../../etc` |
| 7 non-emptiness | empty the manifest of path-valued keys — the non-empty assertion must fail |
| command-free (all five keys) | one at a time: `command: ["echo"]` and `poll_command: ["echo"]` on a `validate.yaml` check, `runner: project:x.mjs` anywhere under `governance/`, and `prompt_text: "..."` then `package: {skill: x}` on a `review.yaml` reviewer — all five must fail, and each must fail naming the key it added |
| banned files | `touch project/.context-index/governance/boundaries.yaml`, then `gates.yaml`, then `diagnostics.yaml` |
| `prompt:` shape | change one `prompt:` to `plugin:no-such-skill/x.md` — the containment-under-`skills/` half must fail even though the regex still matches |
| marker | delete `materialized_at` from `review.yaml`; separately add one to `validate.yaml` — both must fail |
| loader errors | point one `prompt:` at a missing file — `errors[]` must be non-empty and the assertion must fail |
| minimum-enabled | disable every check in `validate.yaml` — must fail even though it stays command-free |

Revert each. The last two together are the point: they must fail on *different* perturbations, or one of them is redundant.

- [ ] **Commit**

`test(eval-harness): add skill-regression fixture config layer + hermeticity properties 5 and 7`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 2`

---

### Task 3: Fixture clean-slice lifecycle artifacts + properties 6 and 9 [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files** (all nine are committed test data under `tests/evals/`):
- Create: `tests/evals/skill-regression/project/.context-index/specs/product.md`
- Create: `project/.context-index/specs/features/orders/charter.md`
- Create: `project/.context-index/specs/features/orders/create-order.spec.md`, `create-order.plan.md`
- Create: `project/.context-index/adrs/0001-esm-only.md`
- Create: `project/.context-index/memory/heuristics/orders.md`
- Create: `project/.context-index/samples/order-pipeline-create-order.md`
- Create: `project/.context-index/lifecycle-state/create-order.jsonl`
- Create: `project/.context-index/tasks/tasks.json`
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs` — properties 6 and 9
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Tests:** the two properties that are decided by the fixture's markdown corpus. Both are only meaningful once there is a corpus, which is why they land here rather than in Task 1.

**Context to load:** the Tasks 1–3 Context Packet above.

- [ ] **Write failing test**

6. **No probe the preflight would run** — no `infra_requirements:` key appears in the frontmatter of any markdown under `project/`: the specs, the plans, the charter, `product.md`. Assert the scanned file set is non-empty and includes each of those four kinds, so the scan cannot pass by having found nothing to read.
9. **No instruction file reaches outside the fixture** — `project/CLAUDE.md`, `project/AGENTS.md`, `.context-index/memory/heuristics/orders.md` and `.context-index/samples/` all exist (they are required, so they cannot be deleted to make the check pass), and no markdown under `project/` contains an `@`-import. Resolve the ban transitively to five hops: an `@`-import in a file that is itself imported must also fail. Assert the iterated file set is non-empty.

Plus: every lifecycle artifact under `specs/` carries a `kind:` frontmatter field (ADR-0009 Decision §1), asserted per file rather than as a spot check.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — the four required instruction paths do not exist, and property 6's "includes each of those four kinds" assertion fails on an empty scan.

- [ ] **Implement**

Author the nine files as the **clean** `create-order` slice: the spec, plan, charter entry, lifecycle chain, heuristic and golden sample are internally consistent and carry no planted defect. Pin the slice's `status:` explicitly and make the `lifecycle-state/create-order.jsonl` event chain agree with it — `CATALOG_STATUS_EVENT_MISMATCH` (asserted against the real catalog in Task 5, given its rejecting fixture in Task 7) is the rule that will hold this pair honest, and this is the half that must be right for the dirty twin to be a real contrast.

`create-order.jsonl` records the completed chain through `validate` — the shape `skills/work/SKILL.md` projects as "past every gate". Its dirty twin in Task 4 records `specify` completed and deliberately **no `review` and no `plan` step**; getting this half right is what makes that contrast readable.

`tasks/tasks.json` is the fixture's issue board, sized so a `/adev:issues` or `/adev:status` scenario has something to read.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS — nine of the eleven hermeticity properties are now green; 10 and 11 arrive in Task 8.

- [ ] **Falsify each guard**

| Guard | Perturbation |
|---|---|
| 6 | add `infra_requirements: [postgres]` to `create-order.spec.md` frontmatter |
| 6 coverage | delete `product.md` — the "includes each of those four kinds" assertion must fail |
| 9 | add `@../../../CLAUDE.md` to `project/CLAUDE.md` |
| 9 transitive | add the `@`-import two hops away, in a file `CLAUDE.md` imports |
| 9 required-files | delete `memory/heuristics/orders.md` — must fail rather than pass on a smaller corpus |
| `kind:` | strip `kind:` from `create-order.plan.md` |

Revert each. The transitive case is the one most likely to be silently unimplemented, so run it before trusting the property.

- [ ] **Commit**

`test(eval-harness): add skill-regression clean slice + hermeticity properties 6 and 9`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 3`

---

### Task 4: Plant the dirty slice + seed-content assertions [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/project/src/orders/legacy-loader.js`, `src/orders/orphaned-helper.mjs`, `src/shipping/rates.mjs`
- Create: `project/.context-index/specs/features/orders/{shipping-rates.spec.md,shipping-rates.plan.md}`
- Create: `project/.context-index/lifecycle-state/shipping-rates.jsonl`
- Create: `project/.context-index/evals/{orders-rubric.yaml,config.yaml,orders-verdicts.json}`
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs` — add the seed-content assertions
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Tests:** extend the suite Tasks 1–3 built. The new assertions are about *seed content* rather than hermeticity, and they belong here because they are what makes the ten classes anchorable — a planted violation nobody asserts exists is the same defect as a catalog entry that cites nothing.

**Context to load:** the Task 4 Context Packet above.

- [ ] **Write failing test**

Add to the hermeticity suite:

- **Slice parity, three ways** — the two slices carry the same **file kinds**, the same **section headings**, and the same **task count**, differing at exactly three things and nothing else: the planted anchors, the two pinned `status:` values, and the two lifecycle chains. Assert all three dimensions, not just the file set: two slices with matching filenames and divergent heading structure would let a rubric score the *shape* difference instead of the planted defect, which is the confound the negative twin exists to remove. Compare heading lists and the plan's task-row count directly.
- **Ten anchorable classes** — for each of the ten planted-violation classes the spec's Seed Content table names, assert the cited file exists and the anchor text occurs in it exactly once. Assert the iterated class set has length ten.
- **The new files stay hermetic** — properties 1, 6, 8 and 9 are directory walks, so they cover the added files for free; the point of re-running them here is that their non-emptiness assertions now hold at a higher count, which is what proves the new files fell inside the walk rather than beside it.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — the `shipping-rates` slice and the four `src/` defects do not exist; the ten-class assertion fails on the first missing file and the length check fails at the count it reached.

- [ ] **Implement**

Author the dirty slice and the four `src/` defects so each of the ten classes has one real, uniquely-anchorable violation. `legacy-loader.js` is the CommonJS plant (`.js` + `require`), `orphaned-helper.mjs` is exported and imported by nothing, `rates.mjs` carries the undocumented public API that `docs/api.md` does not cover, and the `shipping-rates` spec/plan/lifecycle chain carries the spec-side plants. Pin each slice's `status:` explicitly rather than letting a reader infer it.

`shipping-rates.jsonl` is the one file here that is easy to get subtly wrong: it records `specify` completed and **no `review` step and no `plan` step**. The missing `plan` step is deliberate. `shipping-rates.plan.md` is on disk, and `skills/work/SKILL.md`'s resume override routes to `/adev:implement` whenever it finds an incomplete plan — so a stray `plan` event here inverts the core tier's routing assertion while every other check in this plan stays green. Write a comment in the JSONL header saying so.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS.

- [ ] **Falsify each guard**

Delete one planted anchor's text and confirm the ten-class assertion fails naming that class; duplicate one anchor and confirm the exactly-once assertion fails. Then falsify each parity dimension separately, since a single perturbation would not prove all three: add a file to one slice only (file kinds), rename one heading in `shipping-rates.spec.md` (headings), and delete one task row from `shipping-rates.plan.md` (task count). Revert all five.

- [ ] **Commit**

`test(eval-harness): plant the skill-regression dirty slice and assert the ten classes`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 4`

---

### Task 5: Catalog authoring + code registry + shape conformance [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/catalog.yaml`
- Create: `lib/evals/catalog-codes.mjs`
- Create: `tests/lib/evals/skill-regression-catalog.test.mjs`
- Test: `tests/lib/evals/skill-regression-catalog.test.mjs`

**Tests:** create the catalog-integrity suite. This task lands the validator, proves the **real** catalog satisfies all thirteen rules, and adds the four fixture-relationship assertions the rules do not subsume. Task 7 lands the thirteen rejecting fixtures that prove each rule can also say no. Splitting it this way keeps both halves honest: a validator that only ever sees a conforming input is untested, and a rejecting fixture written before the real catalog exists has nothing to be a counterexample to.

**Context to load:** the Task 5 Context Packet above.

- [ ] **Write failing test**

Create `lib/evals/catalog-codes.mjs` last — the test is written first and must fail on the missing import. In the suite:

0. Assert the parsed document carries **exactly** the five documented top-level keys — no more, no fewer. `CATALOG_MISSING_KEY` catches absence; a sixth key nobody reads is the other half, and the minimal parser will not complain about it.
1. Import `CATALOG_ERROR_CODES` from `../../../lib/evals/catalog-codes.mjs` and assert it holds exactly the thirteen codes the spec's Catalog Integrity Rules table names, as a frozen array. This is the registry ADR-0019 Part A requires, and it is what the change-imminent tier's `rubric-coverage.test.mjs` will import rather than re-spelling the strings.
2. Define `validateCatalog(catalogPath, { rubricRoots } = {})` inside the test file, returning `{ errors: [{ code, detail }] }`. It parses `catalog.yaml` with the repository's minimal reader (`lib/profiles/yaml.mjs`) — the same reader a consumer would use, so `CATALOG_NESTED_MAP` is testing the real failure mode rather than a hypothetical one — and applies the thirteen rules. `rubricRoots` defaults to `['tests/evals/skill-regression/rubrics/*.yaml', 'skills/*/default-rubric.yaml']`.
3. Assert `validateCatalog(realCatalogPath).errors` is empty, and assert that the run *reached* each rule: the validator returns a `checked` counter per rule, and every one of the thirteen is greater than zero. A rule that ran over an empty collection reports zero and fails here — without this the "conforming catalog" assertion is thirteen no-ops.
4. Nine assertions the thirteen rules do **not** subsume, hosted in this same suite because each is about the catalog's relationship to a fixture file rather than about the catalog's own shape:
   - **Required Files, enumerated.** A pinned list of the **32** fixture paths that exist as of this task: every one exists, and the fixture tree contains **nothing else** (walk the tree, compare sets both ways). Thirty-two, not thirty-three — `README.md` is Task 6's file, and Task 6 extends this list to 33 in the same commit that creates it. Pinning 33 here would fail this task's own "Verify test passes" step. `CATALOG_PATH_MISSING` only covers paths the catalog happens to cite, and nothing obliges `scaffolding` to enumerate the whole tree — so without this, "every path in Required Files exists" is a claim no assertion makes. The both-ways comparison is what catches a file added to the fixture and never registered anywhere.
   - **`catalog.yaml` sits outside `fixture_root`.** `fixture_root` is `project`, and `catalog.yaml` is not under it. Trivially true today and trivially breakable by a reorganisation that moves the catalog inside the tree it describes, at which point every entry path silently gains a level. (`README.md`'s half of this criterion lands in Task 6, where the file is created.)
   - `project/.context-index/evals/config.yaml` names `orders-rubric.yaml`, so `/adev:eval` resolves it.
   - `project/.context-index/evals/orders-rubric.yaml` loads through `loadRubric` without error. It is scaffolding for a skill that refuses a non-conforming rubric, so "the file exists" is not the property that matters.
   - The `tasks/tasks.json` scaffolding entry carries `role: issue-board` **specifically**. `CATALOG_ROLE_UNKNOWN` is satisfied identically by any enum member, so without a direct assertion a `role: manifest` typo passes every rule while making the board prose silently false.
   - Four `covers_skills` content pins the rules do not reach, each of which encodes a decision another spec depends on: `assess` appears in **no** class (its dimensions are presence-based and reach neither the board nor a spec-versus-source diff); `repomap` appears for `dead-export`; `issues` appears for none; `brainstorm` appears for `charter-scope-escape`. These match the change-imminent tier's detector/producer split and the core-lifecycle tier's ownership of `brainstorm` — assert them here so a later edit that looks harmless breaks loudly in the tier that depends on it.
   - `orphan-source-file`'s `covers_skills` is exactly `codehealth, repomap` and does **not** list `hygiene`. Pin the absence explicitly: the core-lifecycle tier adds `hygiene` as its own task and proves `RUBRIC_COVERS_SKILLS_UNLISTED` red-then-green across that edit, so pre-extending it here would make that proof unreachable. A comment must say why the obvious "improvement" is wrong.
   - The two lifecycle chains have the shapes `work` routes on, asserted through `CATALOG_STATUS_EVENT_MISMATCH` so "consistent" is a predicate rather than a word: `shipping-rates.jsonl` records `specify` completed and **no `review` step and no `plan` step**. The missing `plan` step is load-bearing — `skills/work/SKILL.md`'s resume override routes to `/adev:implement` whenever it finds an incomplete plan, and `shipping-rates.plan.md` is on disk, so a stray `plan` event would invert the core tier's routing assertion while every other check stayed green. `create-order.jsonl` records the completed chain through `validate`.
   - `shipping-rates.spec.md` declares `status: review-pending` and `create-order.spec.md` declares `status: validated`, each asserted **directly** on the frontmatter — not via a catalog `anchor`, and not via `CATALOG_STATUS_EVENT_MISMATCH`, which compares frontmatter to the event chain and would pass on a pair that agreed with each other at the wrong value. `work` must route the first to `/adev:review-specs` and not to `/adev:plan`; a `validated` there silently inverts that assertion.

Containment ordering, since three rules depend on it: `CATALOG_PATH_ESCAPE` is decided lexically via `resolveContained` **before** any `fs` call, then `isContained(lenientRealpath(resolved), lenientRealpath(fixtureRoot))` decides the final verdict; `CATALOG_PATH_MISSING` and `CATALOG_ANCHOR_NOT_UNIQUE` both open the `lenientRealpath`-resolved value that step produced, never the raw declaration and never `resolveContained`'s lexical output.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs`
Expected: FAIL — `Cannot find module '.../lib/evals/catalog-codes.mjs'`, and once that is stubbed, the conformance assertion fails because `catalog.yaml` does not exist.

- [ ] **Implement**

Create `lib/evals/catalog-codes.mjs` exporting `CATALOG_ERROR_CODES` as `Object.freeze([...])` with a one-line comment per code tying it to the spec's table row.

Author `tests/evals/skill-regression/catalog.yaml`: `catalog_id: skill-regression` (the literal — not derived from the directory name, so a rename is a visible edit rather than a silent rebinding), `fixture_root: project`, ten `planted_violations`, ten `known_clean` twins, and the `scaffolding` list. **Every entry field value is a flat scalar — not a map and not a list.** `covers_skills` and `read_by` are comma-joined scalars (`"codehealth, repomap"`), never a YAML list: the minimal reader loads a nested block as silence, and a list form would also fail this task's own `exactly codehealth, repomap` pin. The three top-level collections (`planted_violations`, `known_clean`, `scaffolding`) are lists of entries, which is the only list form the schema admits. Quote every scalar that would otherwise coerce.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs`
Expected: PASS — zero errors, and all thirteen `checked` counters above zero.

- [ ] **Falsify each guard**

The thirteen rejecting fixtures are Task 7's deliverable, but two confirmations belong here because they falsify *this* task's assertions rather than the rules:

1. Rename one `known_clean` id so its `PV` twin dangles — `CATALOG_UNPAIRED_TWIN` must fire. Revert.
2. Strip `covers_skills` from **every** entry, not one. Removing a single entry's field leaves nine others, so `CATALOG_UNKNOWN_SKILL`'s counter stays above zero and the counter proof never runs. `CATALOG_MISSING_KEY` fires either way and is not the signal — the pass criterion is that the "every rule was reached" assertion fails **naming `CATALOG_UNKNOWN_SKILL`**. If it fails naming some other rule, or fails without naming one, the counters are not per-rule and the assertion is weaker than it reads. Revert.
3. Change the `tasks/tasks.json` entry's `role` from `issue-board` to another valid enum member — every one of the thirteen rules must still pass and only the direct `role: issue-board` assertion may fail. If a rule also goes red, the direct assertion is redundant and should be reconsidered rather than kept as decoration.
4. Flip `create-order.spec.md`'s `status:` to `review-pending` **and** its lifecycle chain to match. `CATALOG_STATUS_EVENT_MISMATCH` must stay green (they still agree) while the direct status pin goes red. This is the check that the two mechanisms are actually different, which is the reason the spec asks for both.

- [ ] **Commit**

`feat(eval-harness): add skill-regression catalog, code registry, and conformance test`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 5`

---

### Task 6: README + the three authoring-rule assertions [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `tests/evals/skill-regression/README.md`
- Modify: `tests/lib/evals/skill-regression-catalog.test.mjs` — the growth-rule assertion
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the `--dry-run` authoring-rule assertion
- Test: both files

**Tests:** the README states three rules that only a test keeps true, and the file's own location is a fourth assertion. Assertions land in whichever suite owns the artifact each rule constrains — the growth rule and the README's location constrain the catalog, the `--dry-run` and `tasks.db_path` rules constrain the fixture.

**Context to load:** the Task 6 Context Packet above.

- [ ] **Write failing test**

- **Growth rule** (catalog suite): the README exists and states the pair-or-do-not-add rule, and `planted_violations.length === known_clean.length`. Assert the README's rule text is present as a literal the test pins, so an edit that deletes the rule fails rather than passing on an empty file.
- **README sits outside `fixture_root`** (catalog suite): `README.md` is not under `project/`. This is the second half of the criterion whose first half (`catalog.yaml`) Task 5 asserts; it lands here because the file does not exist until now. Extend Task 5's pinned Required-Files list with `README.md` in the same commit, so the both-ways set comparison does not start failing on an unregistered file.
- **`--dry-run` obligation** (hermeticity suite): the README instructs that the `deploy` scenario is invoked with `--dry-run`, and states the disposition for an unanswered manual step — treated as `abort` and reported, never waited on. Pin both as literals. The mechanism half is already covered by Task 2 property 5 (`type: manual` only); this is the mode half, which the step-type ban does not reach.
- **`tasks.db_path` authoring rule** (hermeticity suite): the README states that whoever prepares a **run copy** writes `tasks.db_path` as an **absolute path inside that copy**. Absolute is not a style preference — `resolveStorageRoot` returns the value verbatim (`lib/issues/resolve-root.mjs:30`) rather than resolving it against the manifest's directory, so a relative value resolves against the caller's `process.cwd()`, which for a driver run from this checkout is this repository's real board. The README must state the reason, not just the rule, or the next author "simplifies" it back to a relative path. Assert the rule's presence as a pinned literal, and assert the **committed** manifest still declares no `tasks.db_path` — the rule governs copies, and a committed value would let `/adev:issues` create, claim or close live issues here. The rule text and the committed absence are two different failures and need two assertions.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — `README.md` does not exist; all three literal pins fail on the missing file.

- [ ] **Implement**

Write `tests/evals/skill-regression/README.md`: what the fixture is, the pair-or-do-not-add growth rule, the `--dry-run` obligation and its abort disposition, and the `tasks.db_path` run-copy authoring rule with its absolute-path reason. Keep the pinned sentences verbatim-stable and say so in the file, so a later editor knows a reword is a test change.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS.

- [ ] **Falsify each guard**

Delete each of the three pinned sentences in turn and confirm the matching assertion fails naming that rule. Add an eleventh `planted_violations` entry with no twin and confirm the growth-rule length assertion fails. Add a `tasks.db_path` to the committed fixture manifest and confirm the committed-absence assertion fails while the README pin stays green. Move `README.md` into `project/` and confirm the outside-`fixture_root` assertion fails **and** Task 5's Required-Files set comparison fails — if only one fires, one of the two is not looking where it claims. Revert all six.

- [ ] **Commit**

`docs(eval-harness): add skill-regression README and pin its three authoring rules`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 6`

---

### Task 7: Complete the catalog-integrity test — thirteen rejecting fixtures [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/evals/skill-regression-catalog.test.mjs`
- Test: `tests/lib/evals/skill-regression-catalog.test.mjs`

**Tests:** one rejecting fixture per rule, plus the containment-ordering case and the citation-scan non-vacuity proof. Task 5 proved the validator accepts; this task proves it refuses, which is the half that decides whether the thirteen rules are guards or decoration.

**Context to load:** the Task 7 Context Packet above.

- [ ] **Write failing test**

For each of the thirteen codes, build a synthetic catalog in a temp directory (`createTempDir()` from `tests/helpers.mjs`) that differs from a conforming baseline in exactly one way, run `validateCatalog` against it, and assert the returned `errors` contains that code **and no other**. A rejecting fixture that trips two rules does not prove the rule it names.

Three cases need more than a one-field mutation:

- **`CATALOG_PATH_ESCAPE` before existence.** The entry path is `../../../../etc/definitely-not-here`. The assertion is that the code is `CATALOG_PATH_ESCAPE`, not `CATALOG_PATH_MISSING`, on a machine where the target does not exist — the ordering `assertContained` (`lib/extensions/exec-payload.mjs:158`) establishes. Add a second case with a **symlinked** `fixture_root` (create the temp base, symlink it, point `fixture_root` through the link) and assert a legitimate in-base path is *not* reported as an escape — the failure a raw `startsWith` would produce, and the reason both sides are realpathed.
- **`CATALOG_UNRESOLVED_CITATION` with an explicit `rubricRoots`.** The rejecting case writes a rubric under a temp root citing `skill-regression:PV-does-not-exist` and passes that root in. This is why `rubricRoots` is a parameter rather than a constant.
- **`CATALOG_UNRESOLVED_CITATION` on the *default* roots — the non-vacuity proof.** Call `validateCatalog(realCatalogPath)` with no `rubricRoots` and assert the scan's reported file list is **non-empty** and contains `skills/eval/default-rubric.yaml`. Today `tests/evals/skill-regression/rubrics/` does not exist and contributes nothing; `skills/eval/default-rubric.yaml` does exist, is scanned, and cites no catalog ids — so the default-root pass is green for a reason rather than green for lack of input. Without this assertion the default branch is untested and would stay untested until a tier lands.

`CATALOG_UNSAFE_SCALAR` needs its own small table of inputs rather than one: a bare digit string, `true`, `null`, an empty string, a value carrying a flow indicator, a value carrying colon-space, and a `covers_skills` component failing `^[a-z][a-z0-9-]*$`. Each must be rejected individually.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs`
Expected: FAIL — the new cases fail before the validator branches exist for them; in particular the escape-before-existence case reports `CATALOG_PATH_MISSING` if the ordering is wrong, and the default-root case fails its non-empty assertion if the glob resolves nothing.

- [ ] **Implement**

Extend `validateCatalog` until every rejecting fixture is refused with its own code and nothing else. Where a rule needs the containment result, consume the `lenientRealpath`-resolved value the escape check already produced rather than re-deriving one.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-catalog.test.mjs`
Expected: PASS — thirteen rejecting fixtures, the symlinked-base acceptance case, the seven `CATALOG_UNSAFE_SCALAR` inputs, the default-root non-vacuity proof, and the Task 5 conformance assertions all green.

- [ ] **Falsify each guard**

For each rule, delete its branch from `validateCatalog` and confirm that **exactly one of the thirteen rejecting fixtures** goes red. Scope the count to the rejecting fixtures only: deleting a branch also drops that rule's `checked` counter to zero, so Task 5's per-rule "every rule was reached" assertion goes red on every deletion by design. Counting total failures instead of rejecting-fixture failures would make the diagnostic misfire thirteen times out of thirteen. Two *rejecting fixtures* going red means two fixtures overlap and one is not isolating what it claims. Then point the default-root glob at a directory that cannot exist and confirm the non-vacuity assertion fails; that is the check that proves the proof.

- [ ] **Commit**

`test(eval-harness): add a rejecting fixture for each of the thirteen catalog rules`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 7`

---

### Task 8: Complete the hermeticity test — run copy, board containment, write-escape equality [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs`
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Tests:** the two properties that need a run copy, the `run-tests --list` bucket check, the zero-argument `createTempGitRepo` assertion, and the file's two durable falsification artifacts. The loader-level minimum-enabled check landed in Task 2 against the committed configs; this task does not repeat it against the copy, because the copy is a byte copy and a second assertion over the same content would read as coverage of the copy step it does not provide.

**Context to load:** the Task 8 Context Packet above.

- [ ] **Write failing test**

- **Property 10 — board resolves inside the run copy, and not by accident.** Copy the fixture into `createTempDir()` (**one copy per scenario** — the copy lifetime the spec pins; do not share one copy across cases). Then do what a scenario driver would do, which the committed tree deliberately does not: **write `tasks.db_path` into the copy's manifest**, per the README run-copy rule. Assert `isContained(lenientRealpath(resolveStorageRoot(copyManifest, copyDir)), lenientRealpath(copyDir))`, realpathed on both sides because the temp base is symlinked on macOS (`/var` → `/private/var`), which a raw prefix check fails.

  Then close the vacuity criterion 42 names. Without the field, `resolveStorageRoot` falls through to `git rev-parse --git-common-dir` (`lib/issues/resolve-root.mjs:33`), and `createTempGitRepo` makes the copy its own git root — so containment would pass on the *fallback*, proving nothing about the field. Assert that the with-field and without-field resolutions **differ**, and that the with-field result is the path the field named. A test where those two are equal has not tested the rule.

  **The path must be absolute.** `resolveStorageRoot` returns `manifest.tasks.db_path` **verbatim** (`resolve-root.mjs:30`) — it does not resolve it against the manifest's directory. A relative `tasks.db_path` therefore resolves against the *caller's* `process.cwd()`, which for a driver run from this checkout is this repository — exactly the "resolves storage to this repository's real board" failure the spec's criterion exists to prevent. Assert the copy's value is absolute and inside the copy, and add a rejecting case: a **relative** `tasks.db_path` in the copy must fail containment when the test's cwd is the repository root.
- **Property 11 — no write escapes the repository.** Before the copy-and-load, capture `git status --porcelain --ignored=traditional --untracked-files=all` and `git rev-parse HEAD` at **every** root `git worktree list --porcelain` prints, anchored with `-C resolveMainRoot(startCwd)` so the enumeration is taken from the main repository rather than from whichever worktree the test happens to run in. Capture again after. Assert equality at every root. Assert the enumerated root list is non-empty and includes the current worktree — a comparison over zero roots is equal for the wrong reason.
- **Two standalone manifest-key assertions.** The copy's manifest declares no `workspace` key, and declares `tasks.backend: json`. Both are asserted directly rather than inferred from property 7's path walk, which says nothing about key presence. The spec phrases both against the *fixture* manifest; asserting them on the copy is equivalent because the copy is a byte copy, and it is where they belong — a driver reads the copy. Task 2 authors these two values and has no falsification for them; the two perturbations in this task's table are their only proof.
- **Bucket check, both buckets.** `node scripts/run-tests.mjs --list` does not list any file under `tests/evals/skill-regression/`, and does list both `tests/lib/evals/skill-regression-*.test.mjs` files. Then the opt-in bucket: `node scripts/run-tests.mjs --evals --list` does **not** list `project/tests/create-order.test.mjs`. The two are different mechanisms and both must hold — the first is the `tests/evals/` bucket rule (about where the file sits), the second is `isNestedProjectFile` seeing `project/package.json` (about what the file belongs to). Losing either one starts executing fixture code as if it were ours, so a single assertion over the default bucket would leave the opt-in run unguarded.
- **Zero-argument `createTempGitRepo`.** Assert `createTempGitRepo` in `tests/helpers.mjs` is callable with no arguments — the shape property 11's capture depends on. If the helper's signature requires a base, this test says so at the point of use rather than at the point of surprise.

Two durable falsification artifacts ship in this file rather than as one-time manual checks:

- **The probe write.** A test that deliberately writes a file into the repository inside the before/after window and asserts the equality **fails**, then removes it and asserts the equality holds. This is what proves property 11 can go red; without it the property is a comparison of two identical strings produced by a run that wrote nothing anyway.
- **The `@`-import rejecting fixture.** A temp copy with `@../../../CLAUDE.md` added to `project/CLAUDE.md` must fail property 9. Task 3 falsified property 9 by hand; this makes it permanent, and it covers the transitive hops a single hand-check does not.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — properties 10 and 11 and both falsification artifacts fail before their helpers exist. The bucket check fails on the assertions themselves, not on tooling: `scripts/run-tests.mjs` already supports `--list`, `--evals` and `--all` (`:138`, `:160`) and already has `isNestedProjectFile`, so there is no flag to add here.

- [ ] **Implement**

Add the copy helper (which writes an absolute `tasks.db_path` into the copy), the git-capture helper, and the two falsification artifacts. Keep the copy per-scenario and clean it with `cleanupTempDir()` in a `finally`, so a failing assertion does not leave a tree behind that the next run's property 11 then reports as a write escape.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS — eleven properties, the two manifest-key assertions, the bucket check, the `createTempGitRepo` assertion, and both falsification artifacts. The two isolation assertions arrive in Task 9.

- [ ] **Falsify each guard**

Property 11's falsification is the shipped probe, and the `@`-import fixture is property 9's. Every other assertion this task adds needs its own perturbation — this task adds nine, and an earlier draft falsified three of them:

| Assertion | Perturbation |
|---|---|
| Property 10, containment | point the copy's `tasks.db_path` at an absolute path outside the copy — containment must fail |
| Property 10, non-vacuity | delete `tasks.db_path` from the copy — the with/without comparison must fail because the two resolutions are now equal |
| Property 10, absolute-path rule | write a *relative* `tasks.db_path` into the copy and run with cwd at the repository root — containment must fail, and fail naming this repository's path, not the copy's |
| `workspace` key absent | add a `workspace:` key to the copy's manifest |
| `tasks.backend: json` | change it to `beads` — must fail without waiting for `execFileSync("br", …)` to be attempted |
| Bucket, default `--list` | rename one guard test out of `tests/lib/` (the "does list both" half); then move a fixture file to a path `--list` collects (the "lists nothing under the fixture" half) |
| Bucket, `--evals --list` | delete `project/package.json` so `isNestedProjectFile` stops classifying `project/tests/` as a nested suite — `create-order.test.mjs` must then appear and the assertion must fail. This is the perturbation that proves the second bucket mechanism is real and not a restatement of the first |
| Zero-argument `createTempGitRepo` | call it with an argument in a scratch copy of the assertion and confirm the shape check rejects it — if it does not, the assertion is documentation, not a guard |
| Root enumeration (criterion 45) | run the enumeration with cwd inside the temp copy instead of anchored at `resolveMainRoot(startCwd)` — the "non-empty and contains the current worktree" assertion must go red. The probe write proves the *equality* can fail; nothing else proves the *root set* is real, and an enumeration that silently returns one wrong root would compare two identical strings and pass |

Revert each. Four of these (`--evals --list`, `tasks.backend`, `createTempGitRepo`, the root enumeration) had no perturbation in an earlier draft and would have shipped untrusted under this plan's own rule.

- [ ] **Commit**

`test(eval-harness): complete skill-regression hermeticity with run-copy and falsification artifacts`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 8`

---

### Task 9: Repomap exclusion + the two pinned isolation assertions [specialist: none]

**Charter capability:** Hermetic fixture and ground-truth catalog
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/manifest.yaml` — add `tests/evals/skill-regression/**` to `repomap.exclude`
- Modify: `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the two isolation assertions
- Test: `tests/lib/evals/skill-regression-hermeticity.test.mjs`

**Depends on Task 8** — it modifies `skill-regression-hermeticity.test.mjs`, which Task 1 creates and Task 8 last touches. An earlier draft of this plan listed it as dependency-free and schedulable "before Group A", which is impossible: the file does not exist yet.

**Tests:** two assertions on the root manifest. `/adev:codehealth` needs no separate change — it consumes repomap output and inherits the exclusion — and the plan does not add an assertion pretending otherwise.

**Context to load:** the Task 9 Context Packet above.

- [ ] **Write failing test**

- **Repomap exclusion is declared.** The root manifest's `repomap.exclude` contains `tests/evals/skill-regression/**`, spliced into the existing list and never as a standalone block.
- **The exclusion actually excludes.** Call `await run(syntheticRoot, 'regex')` from `lib/repomap/index.mjs`. The mode argument is a **string**, not an options object: the signature is `run(root, mode)` (`lib/repomap/index.mjs:278`) and it branches on `mode === 'regex'` / `'tree-sitter'`. An object falls through to the `else` branch, which sets `treeSitterOk = isTreeSitterAvailable()` — so on a machine with tree-sitter installed the test would silently run a different parser and emit `symbol-ranks.json` alongside the `repo-map.md` the assertion reads. It is `async`; `await` it, or the assertion runs before the file is written.

  The synthetic root must hold **at least one *included* source file** as well as the excluded one. `run()` has an explicit `sourceFiles.length === 0` early branch (`:300`) that writes a `repo-map.md` with no symbols in it at all — so a root containing only the excluded file makes "the fixture file's symbols are absent" true because *nothing* was indexed. Assert both directions: the included file's symbols are present and the excluded file's are not. An exclusion assertion over an empty symbol set proves nothing about the exclusion, which is the vacuity class this plan's own heuristic bans.

  Use the synthetic root, not the repository root — running the real repomap here writes into `.context-index/hygiene/` and would turn Task 8's write-escape equality red in the same suite. **Derive the synthetic root's `repomap.exclude` from the real manifest** (read the real list, write it into the synthetic manifest) rather than hardcoding the pattern in the test. Without that, deleting the line from the real manifest turns only the declaration assertion red and the effect assertion keeps passing against a pattern the test supplied itself — a guard that tests the test.
- **`hygiene.source_roots` excludes `tests/`.** Assert the list is exactly `cli/ hooks/ lib/ providers/ skills/ templates/`, pinned as a set. This is verified rather than assumed, so a later widening that pulls `tests/` in fails here instead of surfacing as fixture findings in a hygiene report.

- [ ] **Verify test fails**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: FAIL — `repomap.exclude` does not yet contain the pattern, and the synthetic-root run emits the fixture file's symbols.

- [ ] **Implement**

Add the entry to `.context-index/manifest.yaml` by **text splice** beside the existing `tests/evals/adev-api-eval/dist/**` line (`:286`) — insert the line, do not parse and reserialize. A reserialize rewrites comments and key order across a 300-line manifest and turns a one-line change into an unreviewable diff; `lib/extensions/governance-splice.mjs` documents the same reasoning for governance files.

- [ ] **Verify test passes**

Run: `node --test tests/lib/evals/skill-regression-hermeticity.test.mjs`
Expected: PASS.

- [ ] **Falsify each guard**

Remove the spliced line from the **real** manifest and confirm **both** halves fail — the declaration half directly, and the effect half because the synthetic manifest is derived from the real list. If only one goes red, the derivation was not wired and the effect assertion is testing a constant. Separately, delete the *included* source file from the synthetic root and confirm the "included symbols are present" half fails — that is the check that the root was not empty, and without it the early-exit branch at `:300` satisfies the exclusion assertion for the wrong reason. Add `tests/` to `hygiene.source_roots` and confirm the set assertion fails. Revert both. Also confirm the manifest diff is exactly one added line — `git diff --stat .context-index/manifest.yaml` reports `1 insertion`; anything more means a reserialize slipped in.

- [ ] **One-time manual check (not a hosted assertion)**

Run `/adev:codehealth` on this repository and confirm it reports none of the fixture's planted dead exports, orphan files, or unused dependencies. The spec marks this a manual check performed once at implementation: `/adev:codehealth` is an interactive skill with no library entry point, so there is nothing to assert against. It is a checklist step here rather than a test so that it is not silently dropped — record the result in the commit body. If it *does* report fixture findings, the repomap exclusion did not take effect and the two assertions above are wrong about something.

- [ ] **Commit**

`chore(eval-harness): exclude the skill-regression fixture from repomap`
Trailers: `Spec: .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`, `Plan-task: 9`

---

## Spec Coverage Map

Every acceptance criterion in spec revision 15, in spec order, with the task that discharges it. Criteria the plan does **not** discharge with a test are marked and say why. This table exists so a reviewer can check coverage by reading rather than by re-deriving it, and so a later spec revision shows up here as an unmapped row.

| # | Criterion (abbreviated) | Task |
|---|---|---|
| 1 | `catalog_id` pinned to the literal | 5 |
| 2 | Required Files exist (pinned 33-path list, compared both ways); `evals/config.yaml` names `orders-rubric.yaml` | 5 |
| 3 | `orders-rubric.yaml` loads through `loadRubric` | 5 |
| 4 | `orders-verdicts.json` parses; ids reconcile | 5 |
| 5 | Parses under `parseYaml`; exactly five top-level keys | 5 |
| 6 | `fixture_root` is `project`; catalog + README sit outside it | 5 (catalog), 6 (README) |
| 7 | Every entry carries every field; no map or list values | 5 |
| 8 | Exactly ten `PV`/`KC` pairs | 5 |
| 9 | Twin pairing symmetric, same `class` | 5 |
| 10 | Every `anchor` occurs exactly once | 5 |
| 11 | Every `path` inside `fixture_root` and on disk | 5 |
| 12 | `charter.md` and both specs carry `kind:` | 3 |
| 13 | Board entry carries `role: issue-board` specifically | 5 |
| 14 | Verdict reconciliation under `CATALOG_VERDICT_IDS_UNRESOLVED` | 5, 7 |
| 15 | `covers_skills`/`read_by` slugs resolve; scalars safe | 5 |
| 16 | `assess` in no class; `repomap` for `dead-export`; `issues` none; `brainstorm` for `charter-scope-escape` | 5 |
| 17 | `orphan-source-file` seeds `codehealth, repomap`, not `hygiene` | 5 |
| 18 | Slice parity: file kinds, section headings, task count | 4 |
| 19 | Two `status:` values pinned directly | 5 |
| 20 | Lifecycle chains carry the shapes `work` routes on | 3 (clean), 4 (dirty), 5 (asserted) |
| 21 | Catalog test exists, in default bucket, thirteen rules | 5, 7, 8 |
| 22 | Escape decided before existence | 7 |
| 23 | Symlinked `fixture_root` does not defeat containment | 7 |
| 24 | Rejecting input per rule; `CATALOG_UNSAFE_SCALAR` per sub-condition | 7 |
| 25 | Citation scan fails on a dangling id, not on an uncited entry | 7 |
| 26 | Hermeticity test exists, in default bucket, eleven properties | 1, 2, 3, 8 |
| 27 | `project/` absent from root `workspaces`, proven statically | 1 |
| 28 | `createTempGitRepo()` used in its zero-argument form | 8 |
| 29 | `project/package.json` declares no `scripts` | 1 |
| 30 | Minimum enabled checks, through the loaders | 2 |
| 31 | Five banned governance keys | 2 |
| 32 | `tasks.db_path` recorded as a README authoring rule (absolute, inside the copy) | 6; exercised on a real copy in 8 |
| 33 | `/adev:deploy` runs pass `--dry-run` (README half checkable today) | 6 |
| 34 | `deploy.yaml` manual-only, no `rollback:` | 2 |
| 35 | No `project/lib/`, no `project/.context-index/diagnostics/` | 1 |
| 36 | No `@`-import in any markdown under `project/` | 3, 8 |
| 37 | Fixture manifest declares no `workspace` key | 8 |
| 38 | Fixture manifest declares `tasks.backend: json` | 8 |
| 39 | Every path-valued manifest key contained, incl. `lifecycle.partial_roots` | 2 |
| 40 | No `infra_requirements:` in any fixture frontmatter | 3 |
| 41 | No agent-runtime surface | 1; the `governance/boundaries.yaml` clause of this criterion is Task 2 |
| 42 | Board containment on the copy, with the fallback-vacuity case closed | 8 |
| 43 | `git status` capture, no path filter, every root | 8 |
| 44 | The equality is proven able to go red | 8 |
| 45 | Roots enumerated from `git worktree list --porcelain`, anchored | 8 |
| 46 | `git rev-parse HEAD` unchanged at every root | 8 |
| 47 | Both bucket checks (`--list` and `--evals --list`) | 8 |
| 48 | `repomap.exclude` contains the fixture glob, spliced | 9 |
| 49 | `hygiene.source_roots` does not contain `tests/` | 9 |
| 50 | `/adev:codehealth` reports no fixture findings | 9 — **manual check, no hosted assertion**; the skill has no library entry point, so it is a checklist step whose result is recorded in the commit body |
| 51 | `npm test` passes | Quality Gates |
| 52 | No constitutional violations in this repo's own source | 1 (boundary-scope assertion), Quality Gates |

Fifty-one of the fifty-two are discharged by a test in a named task. The fifty-second (#50) has no hosted assertion available and is scheduled as an explicit manual step rather than dropped.

Three rows are split across tasks rather than owned by one, and say so above: #6 (the catalog half in Task 5, the README half in Task 6, because the README does not exist until then), #32 (the rule text in Task 6, the behaviour on a real copy in Task 8), and #41 (the runtime-surface list in Task 1, the `boundaries.yaml` clause in Task 2, which is where governance files are authored).

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test` (`node scripts/run-tests.mjs`) — the project's single gate, and the `id: test, tier: fast` entry in `.context-index/governance/gates.yaml`
- The fixture is **not** in that run: `node scripts/run-tests.mjs --list` lists nothing under `tests/evals/skill-regression/` (Task 8's bucket check, also enforced independently by `isNestedProjectFile` seeing `project/package.json`)
- Both Tier A guards **are** in that run: `tests/lib/evals/skill-regression-catalog.test.mjs` and `tests/lib/evals/skill-regression-hermeticity.test.mjs` appear in `--list`
- Every guard has been proven able to fail: each task's falsification step is recorded in its commit body, and the two durable artifacts (the probe write, the `@`-import rejecting fixture) ship in Task 8
- No inline Node added to any SKILL.md: `.githooks/pre-commit` → `hooks/pre-commit-no-inline-node.sh` (exit 2 = policy violation). No task in this plan touches a SKILL.md, so this gate is expected to be a no-op — recorded so a surprise is visible
- Source manifest complete and stamped: `adev source-manifest verify --spec .context-index/specs/features/eval-harness/hermetic-fixture-and-ground-truth-catalog.spec.md`
- Manifest diff is minimal: `git diff --stat .context-index/manifest.yaml` reports exactly one insertion (Task 9 — the splice, not a reserialize)
- All acceptance criteria from spec revision 15 satisfied
- Zero new external dependencies (constitution Principle 1); no version bump in `package.json`, `.claude-plugin/plugin.json`, or `.cursor-plugin/plugin.json` (ADR-0008 — release-please owns those)

`.context-index/governance/gates.yaml` exists; where its definitions differ from the constitution's Quality Gates block, `gates.yaml` wins. Probabilistic gates with no command are noted as skipped by `/adev:validate` rather than run here.

**Not gated here, deliberately:** nothing in this plan executes a scenario. The run model the spec describes is consumed by the two rubric-set tiers and by the CI-integration capability; no driver ships with this plan, so no gate asserts one.
