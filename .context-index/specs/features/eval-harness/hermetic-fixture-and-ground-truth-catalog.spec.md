---
partial_schema: spec@1
charter: eval-harness
kind: artifact
status: review-pending
risk_level: medium
milestone: v1
revision: 1
charter-revision: 4
created: 2026-08-21
updated: 2026-08-21
---

# Artifact Spec: Hermetic Fixture Project and Planted Ground-Truth Catalog

<!-- Artifact Spec within the eval-harness charter.
     Parent Charter: .context-index/specs/features/eval-harness/charter.md
     This spec delivers the charter capability "Hermetic fixture project and
     planted ground-truth catalog". It is the hard prerequisite for both rubric
     tiers: a rubric cannot assert that a skill caught something unless a
     catalog says what was planted and where. -->

## Structural Shape

The artifact is one directory, `tests/evals/skill-regression/`, holding three
things: a **catalog** that declares the ground truth as data, a **fixture
project** that carries the ground truth as files, and a **README** that states
the rule for adding to either.

```
tests/evals/skill-regression/
├── README.md          # authoring rules; the only prose in the artifact
├── catalog.yaml       # the Fixture entity, as flat YAML
└── project/           # the hermetic adev project tree (fixture_root)
    ├── package.json
    ├── CLAUDE.md
    ├── AGENTS.md
    ├── docs/
    ├── src/
    ├── tests/
    └── .context-index/
```

### Why the project tree sits one level down

`project/` is the fixture root, not the directory itself, so that a skill
pointed at the fixture sees a clean adev project — a root whose only children
are the ones a real project has. `catalog.yaml` and `README.md` are harness
files about the fixture; they are deliberately outside it. A skill that globs
the project root must not find them.

### `catalog.yaml` — top-level keys

The catalog is the charter's `Fixture` entity written as data: `path`,
`planted_violations`, `known_clean`, `scaffolding_manifest`. It carries six
top-level keys.

| Key | Shape | Meaning |
|---|---|---|
| `catalog_id` | scalar | `skill-regression`. Names the fixture in rubric `source` fields. |
| `version` | scalar integer | Catalog revision. Bumped when an entry is added, removed, or re-classed. |
| `fixture_root` | scalar | Path to the project tree, relative to the catalog file. Must be exactly `project`. |
| `planted_violations` | list of flat maps | Defects that a skill under test **must** catch. |
| `known_clean` | list of flat maps | Artifacts that a skill under test **must not** flag. |
| `scaffolding` | list of flat maps | The context files skills read to do their job at all. This is the entity's `scaffolding_manifest`. |

The catalog obeys the same flat-YAML discipline the rubric schema enforces
(`lib/evals/rubric.mjs`, `RUBRIC_NESTED_MAP`): a top-level value is a scalar, a
list of scalars, or a list of maps whose properties are all scalars. Nothing
nests further. The reason is not stylistic — the repo's minimal YAML reader
(`lib/profiles/yaml.mjs::parseYaml`) cannot represent a nested map and
materialises one as an empty value, so a nested block would load as silence
rather than as an error. Where an entry needs to name several things, it names
them as one comma-joined scalar (`covers_skills`, `read_by`), never as a nested
list.

### `planted_violations` entry fields

| Field | Shape | Meaning |
|---|---|---|
| `id` | scalar | `PV-<nn>`, zero-padded, unique across the catalog. |
| `path` | scalar | File containing the defect, relative to `fixture_root`. |
| `class` | scalar | Violation class slug (see the seed table below). Shared with its twin. |
| `anchor` | scalar | A literal string that occurs **exactly once** in `path`, at the defect site. |
| `covers_skills` | scalar | Comma-joined skill slugs whose rubrics may cite this entry. |
| `twin` | scalar | The `known_clean` id that is this entry's negative twin. |
| `detect_when` | scalar | One sentence naming the observable that proves the skill caught it. |

`anchor` exists instead of a line number. A line number drifts the moment
anyone edits the file above the defect, and drifts silently — the catalog would
still parse, still validate, and still point at the wrong place. A literal
string asserted to be unique in its file drifts loudly: the integrity check
fails the moment the anchor is edited away or duplicated.

### `known_clean` entry fields

Identical to `planted_violations`, with `detect_when` replaced by
`must_not_flag_when` — one sentence naming what a false positive would look
like — and `id` numbered `KC-<nn>`.

### `scaffolding` entry fields

| Field | Shape | Meaning |
|---|---|---|
| `id` | scalar | `SC-<nn>`, unique across the catalog. |
| `path` | scalar | Path relative to `fixture_root`. |
| `role` | scalar | What the file is (`constitution`, `manifest`, `charter`, `live-spec`, `plan`, `adr`, `heuristic`, `lifecycle-log`, `deploy-config`, `agent-file`, `golden-sample`, `rubric`). |
| `read_by` | scalar | Comma-joined skill slugs expected to open this file. |

`read_by` is the declaration the disclosure-fidelity capability later compares
an observed `ReadTrace` against. This spec ships the declaration; it does not
ship the comparison.

### The negative-twin pairing

Every `planted_violations` entry names exactly one `known_clean` entry in
`twin`, that entry names it back, and both carry the same `class`. This is the
charter invariant "every fixture assertion has a negative twin" expressed as a
checkable bijection rather than as an aspiration. A rubric that cites `PV-03`
without also citing `KC-03` is measuring sensitivity with no specificity
control — it would score full marks for a skill that flags everything.

## Seed Content

The catalog ships with ten violation classes, each as one `PV`/`KC` pair, and a
scaffolding list covering every context file the change-imminent and core
lifecycle tiers read. Ten pairs is not an arbitrary number: it is the set of
defect classes that are (a) resident in a file, so a static fixture can carry
them, and (b) cited by at least one skill in either tier.

| Class | Planted violation (`PV`) | Known-clean twin (`KC`) | Skills that may cite it |
|---|---|---|---|
| `spec-code-drift` | `shipping-rates.spec.md` describes a rounding rule `src/shipping/rates.mjs` no longer implements | `create-order.spec.md` and `src/orders/create-order.mjs` agree | hygiene, validate, debug |
| `stale-spec-frontmatter` | `shipping-rates.spec.md` `updated:` predates its newest source file by more than the staleness threshold | `create-order.spec.md` `updated:` postdates its source | hygiene, status |
| `orphan-source-file` | `src/orders/orphaned-helper.mjs` is imported by nothing | `src/shipping/rates.mjs` is imported by `src/index.mjs` | codehealth, repomap |
| `dead-export` | `formatLegacyTotal` is exported and referenced nowhere | `createOrder` is exported and referenced | codehealth |
| `unused-dependency` | `package.json` declares a dependency no file imports | it declares one that `src/index.mjs` imports | codehealth |
| `esm-violation` | `src/orders/legacy-loader.js` uses `require()` against the fixture constitution's ESM-only principle | `src/orders/create-order.mjs` uses `import` | validate, implement, review-specs |
| `charter-scope-escape` | `shipping-rates.spec.md` covers a capability absent from `orders/charter.md` | `create-order.spec.md` covers a charted capability | specify, review-specs, brainstorm |
| `undocumented-public-api` | `calculateRate` is exported and absent from `docs/api.md` | `createOrder` is exported and documented | document |
| `missing-issue-binding` | `shipping-rates.spec.md` has no Feature work item in the fixture issue store | `create-order.spec.md` has one | reconcile, issues, status |
| `plan-task-without-test` | a task in `shipping-rates.plan.md` declares no TDD test expectation | every task in `create-order.plan.md` declares one | plan, write-test, route |

The pattern is deliberate and load-bearing: the `shipping-rates` slice is the
dirty one and the `create-order` slice is the clean one, all the way down. A
skill that has learned "flag anything under `shipping/`" would score perfectly
against a fixture where the two slices differ only in name, so the two slices
are otherwise structurally identical — same file kinds, same section headings,
same task counts — and differ only at the anchors.

### Skills the seed does not give a planted violation

The change-imminent tier includes skills that do not scan a project for
defects at all: `sync`, `learn`, `deploy`, `eval`, `assess`, `using-adev`,
`prototype`, and — from the core tier — `work`, `build`, `implement`, and
`brainstorm`. Their rubrics assert on process and output shape, and consume the
fixture only as **scaffolding**. This is why the entity carries a scaffolding
manifest alongside the violation catalog rather than treating every fixture
file as ground truth. The seed scaffolding therefore includes the files those
skills need to run at all: `deploy.yaml` for `deploy`, `memory/heuristics/` for
`learn`, `CLAUDE.md` and `AGENTS.md` for `sync`, a rubric and a verdict input
for `eval`, `lifecycle-state/` for `work` and `build`, and `samples/` for
`implement`.

Nothing here claims the seed is complete. It is sized to unblock the two rubric
tiers, and the growth rule below is what keeps it honest as they land.

### The growth rule

A rubric authored under either tier may cite a catalog id that does not yet
exist only by adding it. Referential integrity runs in the opposite direction
from coverage: the integrity check asserts that **every catalog id a rubric
cites resolves**, and never that every catalog entry is cited. An uncited entry
is a fixture waiting for a rubric; an unresolvable citation is a rubric
asserting against nothing.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `tests/evals/skill-regression/README.md` | repo | this spec |
| `tests/evals/skill-regression/catalog.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/package.json` | repo | this spec |
| `tests/evals/skill-regression/project/CLAUDE.md` | repo | this spec |
| `tests/evals/skill-regression/project/AGENTS.md` | repo | this spec |
| `tests/evals/skill-regression/project/docs/api.md` | repo | this spec |
| `tests/evals/skill-regression/project/src/index.mjs` | repo | this spec |
| `tests/evals/skill-regression/project/src/orders/create-order.mjs` | repo | this spec |
| `tests/evals/skill-regression/project/src/orders/legacy-loader.js` | repo | this spec |
| `tests/evals/skill-regression/project/src/orders/orphaned-helper.mjs` | repo | this spec |
| `tests/evals/skill-regression/project/src/shipping/rates.mjs` | repo | this spec |
| `tests/evals/skill-regression/project/tests/create-order.test.mjs` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/constitution.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/manifest.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/platform-context.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/deploy.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/product.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/charter.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.spec.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.plan.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.spec.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.plan.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/adrs/0001-esm-only.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/memory/heuristics/orders.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/samples/create-order.sample.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/lifecycle-state/create-order.jsonl` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/evals/orders-rubric.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/issues.json` | repo | this spec |
| `tests/lib/evals/skill-regression-catalog.test.mjs` | repo | this spec (Tier A integrity check) |
| `tests/lib/evals/skill-regression-hermeticity.test.mjs` | repo | this spec (Tier A hermeticity check) |
| `.context-index/manifest.yaml` | repo | this spec (adds one `repomap.exclude` entry) |

## Consumers

- **`tests/lib/evals/skill-regression-catalog.test.mjs`** — reads `catalog.yaml`
  with `parseYaml` from `lib/profiles/yaml.mjs` and enforces every integrity
  rule below. This spec introduces **no new library module**: the catalog is
  read with the reader the rubric loader already uses, so the charter's
  Interface Contracts table gains no entry.
- **Rubrics under both v1 tiers** — cite catalog ids in a `required_elements`
  entry's `source` field, in the form `skill-regression:PV-03`. The
  `source` field is free text to `lib/evals/rubric.mjs`; the catalog is what
  gives that text a referent.
- **`/adev:eval` and `npm run test:evals`** — drive skills against
  `project/` as their working tree.
- **The disclosure-fidelity capability (later, same charter)** — compares an
  observed `ReadTrace` against the `read_by` declarations in `scaffolding`.
  That capability is out of scope here; this spec only ships the declaration it
  will read.

### Where the integrity tests live, and why not beside the fixture

`scripts/run-tests.mjs::isEvalFile` puts **everything** under `tests/evals/`
into the opt-in `npm run test:evals` bucket. The charter requires the Tier A
schema and coverage checks to run "on every PR", which is the default `npm
test` bucket. A catalog-integrity test placed next to the fixture it guards
would therefore never run on a PR — it would look like a gate and behave like a
comment. The two integrity tests consequently live in `tests/lib/evals/`,
beside the rubric and score tests that already occupy the default bucket, and
only the fixture **data** lives under `tests/evals/skill-regression/`.

This is a refinement of the charter's Naming attribute, not a departure from
it: the charter's "fixtures and evals in `tests/evals/skill-regression/`" is
satisfied — the fixture and the eval harnesses are there. A unit test asserting
that a committed data file is well-formed is neither.

## Catalog Integrity Rules

The Tier A integrity check rejects a catalog that violates any of the
following. Each rule names the failure it exists to prevent; a rule whose
failure mode is "the catalog looks fine and means nothing" is the reason this
section is not left to a schema.

| Rule | Rejected when | Failure it prevents |
|---|---|---|
| `CATALOG_NESTED_MAP` | any value is a map, or a list item holds a list or a map | the minimal YAML reader loads the block as silence and the catalog scores as empty |
| `CATALOG_MISSING_KEY` | a top-level key or an entry field is absent | an entry that parses but cannot be resolved |
| `CATALOG_DUPLICATE_ID` | two entries share an `id` | a rubric citation resolving to whichever entry parsed last |
| `CATALOG_UNPAIRED_TWIN` | a `PV` names a `KC` that does not name it back, or the two carry different `class` values | a sensitivity assertion shipped with no specificity control |
| `CATALOG_PATH_ESCAPE` | an entry `path` resolves outside `fixture_root` | the catalog pointing at repo files, making the fixture non-hermetic by reference |
| `CATALOG_PATH_MISSING` | an entry `path` does not exist on disk | ground truth asserted about a file nobody wrote |
| `CATALOG_ANCHOR_NOT_UNIQUE` | an entry's `anchor` occurs zero times or more than once in its `path` | the catalog pointing at a defect site that moved or multiplied, silently |
| `CATALOG_UNKNOWN_SKILL` | a `covers_skills` or `read_by` slug names no skill under `skills/` | a rubric tier authored against a skill that does not exist |
| `CATALOG_UNRESOLVED_CITATION` | a rubric's `source` cites `skill-regression:<id>` and no such id exists | a rubric asserting against nothing while scoring green |

`CATALOG_UNRESOLVED_CITATION` is the growth rule's enforcement point and is the
only rule that reads outside the fixture directory: it scans rubric files for
`skill-regression:` citations. It deliberately does not assert the converse —
see "The growth rule" above.

## Hermeticity Rules

The charter requires fixtures to resolve "without network access, submodules,
or container runtimes". The second Tier A test asserts that as four checkable
properties rather than as an intention:

| Property | Check |
|---|---|
| No symlinks | no entry under `tests/evals/skill-regression/` is a symbolic link |
| No submodules | no `.gitmodules` path entry has `tests/evals/skill-regression/` as a prefix |
| No container runtime | no `Dockerfile`, `docker-compose.yml`, or `compose.yaml` under the directory |
| No installable dependencies | `project/package.json` declares empty (or absent) `dependencies` and `devDependencies` |

The `project/package.json` requirement is doing two jobs. It keeps the fixture
zero-dependency per constitution principle 1, and its mere presence makes
`scripts/run-tests.mjs::isNestedProjectFile` classify `project/tests/` as a
nested project's own suite — so the fixture's planted test files are never
handed to this repo's runner, independently of the `tests/evals/` bucket rule.
Two mechanisms guard the same thing on purpose: the bucket rule is about where
the file sits, the nested-project rule is about what the file belongs to, and
losing either one should not start executing fixture code as if it were ours.

## Isolation From Repo Tooling

The fixture is a project tree living inside another project tree. Three of this
repo's own tools walk directories and would otherwise treat fixture files as
repo source:

| Tool | Behaviour today | Required change |
|---|---|---|
| `/adev:repomap` | `DEFAULT_EXCLUDE` in `lib/repomap/index.mjs` does not exclude `tests/`, so fixture `.mjs` files would be parsed and their symbols ranked | add `"tests/evals/skill-regression/**"` to `repomap.exclude` in `.context-index/manifest.yaml`, following the existing `tests/evals/adev-api-eval/dist/**` precedent |
| `/adev:codehealth` | consumes repomap output, so it would report the fixture's *deliberately* dead exports as real findings | inherits the repomap exclusion; no separate change |
| `/adev:hygiene` | `hygiene.source_roots` lists `cli/ hooks/ lib/ providers/ skills/ templates/` and does not include `tests/` | none — verified, not assumed; the acceptance criteria pin it so a later widening of `source_roots` is caught here |

Every path-rooted consumer of `.context-index/` (`lib/lifecycle-state.mjs`,
`lib/spec-drift.mjs`, `lib/manifest.mjs`, and the rest) resolves from the
project root and never recurses into `tests/`, so the fixture's nested
`.context-index/` is invisible to them. That is a property of how those modules
resolve paths, and the acceptance criteria assert it rather than restating it.

## System Constitution Reference

- **Principle 1, "Minimize external dependencies"** — Applies twice: the
  fixture itself declares no dependencies, and reading its catalog reuses
  `lib/profiles/yaml.mjs::parseYaml` rather than introducing a YAML library or
  a new loader module.
- **Principle 3, "Pure ESM"** — Applies with one deliberate exception. The
  fixture contains `src/orders/legacy-loader.js`, a CommonJS file, because the
  `esm-violation` class needs a real violation to plant. It violates the
  *fixture's* constitution, which is the point; it is not this repo's source
  and is excluded from repomap for exactly that reason.
- **Architecture boundary, "Autonomous (Agent May Decide): adding tests"** —
  The two Tier A integrity tests fall inside the autonomous boundary.
- **Charter Quality Attribute, "Portability"** — "Fixtures resolve with no
  network, no submodules, and no container runtime, so Tier A and Tier B run on
  a clean CI checkout." The Hermeticity Rules section is that attribute made
  executable.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| Fixture scaffolding tree | Author `project/` — package.json, agent files, `docs/`, `src/`, `tests/`, and the full `.context-index/` skeleton with the `create-order` clean slice | large |
| Plant the dirty slice | Author the `shipping-rates` slice and the four `src/` defects so each of the ten classes has a real, anchorable violation | medium |
| Catalog authoring | Write `catalog.yaml`: 10 `PV`, 10 `KC`, and the scaffolding list | medium |
| README | State the rule for adding an entry: pair or do not add | small |
| Tier A catalog-integrity test | `tests/lib/evals/skill-regression-catalog.test.mjs` — the nine integrity rules, each with a rejecting fixture | large |
| Tier A hermeticity test | `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the four hermeticity properties | small |
| Repomap exclusion | Add the `repomap.exclude` entry and pin it plus `hygiene.source_roots` in the tests | small |

## Acceptance Criteria

**Artifact shape**

- [ ] Every path in Required Files exists.
- [ ] `catalog.yaml` parses under `lib/profiles/yaml.mjs::parseYaml` and the parsed document carries exactly the six documented top-level keys.
- [ ] `fixture_root` is `project`, and `catalog.yaml` and `README.md` sit outside it.
- [ ] Every `planted_violations`, `known_clean`, and `scaffolding` entry carries every field its table lists, and no entry value is a map or a list.

**Ground truth**

- [ ] The catalog holds exactly ten `PV`/`KC` pairs at v1, one per class in the seed table.
- [ ] Every `PV` names a `KC` in `twin`, that `KC` names it back, and both carry the same `class`.
- [ ] Every entry `anchor` occurs exactly once in its `path`.
- [ ] Every entry `path` resolves inside `fixture_root` and exists on disk.
- [ ] Every `covers_skills` and `read_by` slug names a directory under `skills/`.
- [ ] The `create-order` and `shipping-rates` slices carry the same file kinds, the same section headings, and the same task count, differing only at the anchors.

**Integrity check**

- [ ] `tests/lib/evals/skill-regression-catalog.test.mjs` exists, is in the default `npm test` bucket (`node scripts/run-tests.mjs --list` lists it), and rejects a catalog for each of the nine rules with the named code.
- [ ] Each rejection case is proven by a failing input, not only by a passing one: the test supplies a deliberately broken catalog per rule and asserts the specific code, so a check that silently stopped running would go red.
- [ ] `CATALOG_UNRESOLVED_CITATION` scans rubric files for `skill-regression:<id>` citations and fails on an id absent from the catalog; it does **not** fail on a catalog entry no rubric cites.

**Hermeticity**

- [ ] `tests/lib/evals/skill-regression-hermeticity.test.mjs` exists, is in the default bucket, and asserts all four properties.
- [ ] `project/package.json` declares no `dependencies` and no `devDependencies`, and `npm ci` at the repo root neither installs nor warns about it.
- [ ] `node scripts/run-tests.mjs --list` does not list any file under `tests/evals/skill-regression/`, and `node scripts/run-tests.mjs --evals --list` does not list `project/tests/create-order.test.mjs` (the nested-project exclusion).

**Isolation**

- [ ] `.context-index/manifest.yaml` `repomap.exclude` contains `tests/evals/skill-regression/**`, and a repomap run indexes no symbol whose file is under that path.
- [ ] `hygiene.source_roots` does not contain `tests/`, asserted in the test so a later widening surfaces here.
- [ ] Running `/adev:codehealth` on this repo reports none of the fixture's planted dead exports, orphan files, or unused dependencies.

**Gates**

- [ ] `npm test` passes.
- [ ] No constitutional violations introduced in this repo's own source. The fixture's ESM violation is confined to `tests/evals/skill-regression/project/` and excluded from repomap.

## Open Questions

- The seed covers ten file-resident violation classes. Classes that live in
  **git history** rather than in a file — an untraced commit missing its
  `Spec:` trailer, a plan whose tasks never produced commits — cannot be
  planted in a directory and are therefore absent. `/adev:retro` and
  `/adev:reconcile` rubrics that need them will require a fixture form this
  spec does not provide (a committed `git log` transcript, or a throwaway
  repository built in a temp dir). Both skills sit in the v2 "remaining tier",
  so the gap does not block either v1 tier — but it should be answered before
  that tier is specified, not discovered inside it.
