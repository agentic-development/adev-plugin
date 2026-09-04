---
charter: eval-harness
kind: artifact
status: validated
risk_level: medium
milestone: v1
revision: 15
charter-revision: 6
created: 2026-08-21
updated: 2026-08-23
source-manifest:
  sha: "bd58e48"
  files:
    - lib/evals/catalog-codes.mjs
    - tests/evals/skill-regression/README.md
    - tests/evals/skill-regression/catalog.yaml
    - tests/evals/skill-regression/project/.context-index/adrs/0001-esm-only.md
    - tests/evals/skill-regression/project/.context-index/constitution.md
    - tests/evals/skill-regression/project/.context-index/deploy.yaml
    - tests/evals/skill-regression/project/.context-index/evals/config.yaml
    - tests/evals/skill-regression/project/.context-index/evals/orders-rubric.yaml
    - tests/evals/skill-regression/project/.context-index/evals/orders-verdicts.json
    - tests/evals/skill-regression/project/.context-index/governance/review.yaml
    - tests/evals/skill-regression/project/.context-index/governance/validate.yaml
    - tests/evals/skill-regression/project/.context-index/lifecycle-state/create-order.jsonl
    - tests/evals/skill-regression/project/.context-index/lifecycle-state/shipping-rates.jsonl
    - tests/evals/skill-regression/project/.context-index/manifest.yaml
    - tests/evals/skill-regression/project/.context-index/memory/heuristics/orders.md
    - tests/evals/skill-regression/project/.context-index/platform-context.yaml
    - tests/evals/skill-regression/project/.context-index/samples/order-pipeline-create-order.md
    - tests/evals/skill-regression/project/.context-index/specs/features/orders/charter.md
    - tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.plan.md
    - tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.spec.md
    - tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.plan.md
    - tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.spec.md
    - tests/evals/skill-regression/project/.context-index/specs/product.md
    - tests/evals/skill-regression/project/.context-index/tasks/tasks.json
    - tests/evals/skill-regression/project/AGENTS.md
    - tests/evals/skill-regression/project/CLAUDE.md
    - tests/evals/skill-regression/project/docs/api.md
    - tests/evals/skill-regression/project/package.json
    - tests/evals/skill-regression/project/src/index.mjs
    - tests/evals/skill-regression/project/src/orders/create-order.mjs
    - tests/evals/skill-regression/project/src/orders/legacy-loader.js
    - tests/evals/skill-regression/project/src/orders/orphaned-helper.mjs
    - tests/evals/skill-regression/project/src/shipping/rates.mjs
    - tests/evals/skill-regression/project/tests/create-order.test.mjs
    - tests/evals/skill-regression/project/tests/rates.test.mjs
    - tests/lib/evals/catalog-validator.mjs
    - tests/lib/evals/skill-regression-catalog.test.mjs
    - tests/lib/evals/skill-regression-hermeticity.test.mjs
  computed-at: "2026-08-23T10:49:13.025Z"
drift_detected: true
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

The catalog is the charter's `Fixture` entity written as data. Two of the
entity's four attributes are renamed for readability inside the file, and the
mapping is stated here rather than left to be inferred: `path` → `fixture_root`,
`scaffolding_manifest` → `scaffolding`. `planted_violations` and `known_clean`
keep their names. With `catalog_id` the file carries five top-level
keys. There is deliberately no `version`: a revision counter no check reads is
write-only state, and pinning rubrics to one would require a `catalog_version`
key on every rubric that neither tier's shared contract declares. If catalog /
rubric skew ever bites, the pin lands in the shared contract first and a rule
follows it.

| Key | Shape | Meaning |
|---|---|---|
| `catalog_id` | scalar | `skill-regression`. **Read** by `CATALOG_UNRESOLVED_CITATION`, which matches `<catalog_id>:<id>` rather than a hardcoded literal — so renaming the catalog moves the citation prefix with it. |
| `fixture_root` | scalar | Path to the project tree, relative to the catalog file. Must be exactly `project`. |
| `planted_violations` | list of flat maps | Defects that a skill under test **must** catch. |
| `known_clean` | list of flat maps | Artifacts that a skill under test **must not** flag. |
| `scaffolding` | list of flat maps | The context files skills read to do their job at all. This is the entity's `scaffolding_manifest`. |

The catalog obeys the same flat-YAML discipline the rubric schema enforces
(`lib/evals/rubric.mjs`, `RUBRIC_NESTED_MAP`): a top-level value is a scalar, a
list of scalars, or a list of maps whose properties are all scalars. Nothing
nests further.

Two reasons, and the first one is **not** that the reader cannot parse nesting.
`lib/profiles/yaml.mjs::parseYaml` handles nested maps — its header declares
"nested maps via indent (2 spaces)", and `parseMap` recurses through
`parseBlock`. The real reasons are:

1. **Parity with the rubric contract.** `RUBRIC_NESTED_MAP` rejects nesting as
   a matter of policy, walking the already-parsed tree. A catalog read by the
   same reader and asserted against by the same rubrics should refuse the same
   shapes, so one discipline covers both artifacts.
2. **The genuine silent-load case.** A key written with *no value* materialises
   as `{}` — `parseMap` assigns `obj[key] = child ?? {}`, and the reader cannot
   distinguish "I wrote nothing here" from "I wrote a block that failed to
   load". That ambiguity is real, and it is what the rule catches.

Where an entry needs to name several things, it names them as one comma-joined
scalar (`covers_skills`, `read_by`), never as a nested list.

### `planted_violations` entry fields

| Field | Shape | Meaning |
|---|---|---|
| `id` | scalar | `PV-<nn>`, zero-padded, unique across the catalog. |
| `path` | scalar | File containing the defect, relative to `fixture_root`. |
| `class` | scalar | Violation class slug (see the seed table below). Shared with its twin. |
| `anchor` | scalar | A literal string that occurs **exactly once** in `path`, at the defect site. |
| `covers_skills` | scalar | Comma-joined skill slugs whose rubrics may cite this entry. |
| `twin` | scalar | The `known_clean` id that is this entry's negative twin. |
| `detect_when` | scalar | One sentence naming the observable that proves the skill caught it. **Author-facing prose with no machine consumer** — its reader is the tier author writing the citing rubric's `met_when`. No rule asserts the two agree, deliberately: a later maintainer should not add one. |

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
| `id` | scalar | `SC-<nn>`, unique across the catalog. Not citable by a rubric — `CATALOG_UNRESOLVED_CITATION` resolves `PV`/`KC` ids only; `SC` ids exist for human cross-reference between this table and Required Files. |
| `path` | scalar | Path relative to `fixture_root`. |
| `role` | scalar | What the file is (`constitution`, `manifest`, `charter`, `live-spec`, `plan`, `adr`, `heuristic`, `lifecycle-log`, `deploy-config`, `agent-file`, `golden-sample`, `rubric`, `eval-config`, `verdict-input`, `platform-context`, `product-spec`, `issue-board`, `governance-config`). Every scaffolding file this spec ships resolves to one of these; `CATALOG_ROLE_UNKNOWN` rejects anything else. |
| `read_by` | scalar | Comma-joined skill slugs expected to open this file. |

`read_by` is the declaration the disclosure-fidelity capability later compares
an observed `ReadTrace` against. This spec ships the declaration; it does not
ship the comparison.

### The fixture's issue board

The board is `project/.context-index/tasks/tasks.json`, in the `JsonAdapter`
shape `{version, epics, issues}`, and the fixture manifest pins
`tasks.backend: json`. Both details are load-bearing and neither is cosmetic:

- **The filename.** `lib/issues/json-adapter.mjs` sets `STORAGE_REL_DIR =
  join(".context-index", "tasks")`. No adev backend reads a file named
  `issues.json`, so a fixture shipping one would leave the
  `missing-issue-binding` `PV` and its `KC` twin resolving identically — "no
  board found" — and the pair would measure nothing.
- **`tasks.db_path` is a storage ROOT, not a board file.**
  `lib/issues/json-adapter.mjs` computes the board as
  `join(storageRoot, ".context-index", "tasks", "tasks.json")` and calls
  `assertProjectRoot(storageRoot)`, which requires a `manifest.yaml` beneath
  it; `lib/milestones.mjs`, `lib/execution-state.mjs` and
  `lib/migrate-state-artifacts.mjs` all reject a non-directory value with
  `tasks.db_path must point at an existing directory`. So `db_path` is the
  **fixture project root** — the directory holding `.context-index/manifest.yaml`
  — and the board is derived from it. Setting it to the board file would compose
  to `…/tasks.json/.context-index/tasks/tasks.json` and be refused outright.

- **The harness sets it; the fixture does not commit it.**
  `resolveStorageRoot` returns `db_path` **verbatim** — no `resolve`, no
  realpath, no containment. A committed relative value would therefore resolve
  against whatever cwd the process happens to have, and a committed absolute
  value would point back at the committed tree and survive the temp-tree copy
  unchanged. Both defeat the isolation. The value is written into the *copy's*
  manifest as the realpathed copy root, by whoever owns the copy. At v1 there are two such owners, not one: the operator driving the manual Tier B pass, who performs the write as a stated scenario setup step before touching a board skill, and
  `tests/lib/evals/skill-regression-hermeticity.test.mjs`, which builds its own;
  once the CI-integration capability ships a scenario driver, that driver does it
  at scenario setup. The pin must be present rather than merely harmless —
  `createTempGitRepo` makes the copy its own git root, so omitting `db_path`
  would let the git-common-dir fallback return the copy root and any containment
  check pass vacuously, proving nothing about the pin.

- **Why any of this is needed.** `resolveStorageRoot` consults `db_path`, then
  `dirname(git rev-parse --path-format=absolute --git-common-dir)` for the cwd's git tree, and returns
  cwd only if git fails. cwd selects *which git tree the probe answers for*; it
  is never a containment boundary. Because the fixture lives inside this
  repository's git tree, a run without the pin resolves storage to **this
  repository's real board** — the planted ground truth becomes unassertable, and
  `/adev:issues`, `/adev:reconcile` and `/adev:status` can create, claim or close
  issues on live project state.

### The negative-twin pairing

Every `planted_violations` entry names exactly one `known_clean` entry in
`twin`, that entry names it back, and both carry the same `class`. This is the
charter invariant "every fixture assertion has a negative twin" expressed as a
checkable bijection rather than as an aspiration. A rubric that cites `PV-03`
without also citing `KC-03` is measuring sensitivity with no specificity
control — it would score full marks for a skill that flags everything.

### Source files under `project/` never name a catalog class

`src/` and `tests/` content under `fixture_root` is what a skill under
evaluation actually reads. A comment there that says "planted violation" or
"known-clean twin", or that spells out a `class` slug, hands that skill the
answer key: it can grep the label instead of doing the analysis the rubric
means to score, which measures reading comprehension instead of the skill's
detection ability. Rationale for why a file carries a given defect belongs in
this section's table and in the entry's `detect_when` / `must_not_flag_when`
— both already exist for exactly that purpose and have no machine consumer, so
neither costs anything to keep current. A comment inside `project/` may state
a plain fact that a static scan would need to verify anyway (an import list,
a re-export, an accurate date), but never the catalog's own vocabulary.

This also constrains `anchor`: an entry's anchor is a locator into real
content, not an excuse to embed prose that gives the class away. `KC-03`
originally anchored on the sentence "is reachable from the entry point",
written into `rates.mjs`'s header specifically to be unique — which made that
sentence itself an answer key, and coupled the anchor to prose a future
edit-for-hermeticity pass would have every reason to delete. It now anchors on
`function zoneBaseCents`, an unremarkable, pre-existing line of code.

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
| `dead-export` | `formatLegacyTotal` is exported and referenced nowhere | `createOrder` is exported and referenced | codehealth, repomap |
| `unused-dependency` | `package.json` declares a dependency no file imports | it declares one that `src/index.mjs` imports | codehealth |
| `esm-violation` | `src/orders/legacy-loader.js` uses `require()` against the fixture constitution's ESM-only principle | `src/orders/create-order.mjs` uses `import` | validate |
| `charter-scope-escape` | `shipping-rates.spec.md` covers a capability absent from `orders/charter.md` | `create-order.spec.md` covers a charted capability | specify, review-specs, brainstorm |
| `undocumented-public-api` | `calculateRate` is exported and absent from `docs/api.md` | `createOrder` is exported and documented | document |
| `missing-issue-binding` | `shipping-rates.spec.md` has no Feature work item in the fixture issue store | `create-order.spec.md` has one | reconcile, status, hygiene |
| `plan-task-without-test` | a task in `shipping-rates.plan.md` declares no TDD test expectation | every task in `create-order.plan.md` declares one | plan, write-test, route |

### The two slices' declared status

Both slices' spec frontmatter is pinned here, because the core-lifecycle tier's
`work` and `build` rubrics assert a routing decision that only these values make
decidable:

| File | `status:` | Why this value |
|---|---|---|
| `shipping-rates.spec.md` | `review-pending` | `work` must route to `/adev:review-specs` and must **not** route to `/adev:plan`. A `validated` value here silently inverts that assertion |
| `create-order.spec.md` | `validated` | the clean slice is past every gate, so `work` routing against it is unambiguous |

The matching `lifecycle-state/*.jsonl` files carry events consistent with those
statuses. A tier rubric asserting a routing refusal cites both halves.

The pattern is deliberate and load-bearing: the `shipping-rates` slice is the
dirty one and the `create-order` slice is the clean one, all the way down. A
skill that has learned "flag anything under `shipping/`" would score perfectly
against a fixture where the two slices differ only in name, so the two slices
are otherwise structurally identical, differing at exactly the three things the
acceptance criteria permit: the anchors, the two pinned `status:` values, and the
two lifecycle logs' event chains.

### Skills the seed does not give a planted violation

The change-imminent tier includes skills that do not scan a project for
defects at all: `sync`, `learn`, `deploy`, `eval`, `issues`, `using-adev`,
`prototype`, and — from the core tier — `work`, `build`, and `implement`. Their
rubrics assert on process and output shape, and consume the fixture only as
**scaffolding**.

`assess` cites **no catalog class**, and the reason is worth recording because an
earlier draft assumed the opposite. It does scan a codebase and emit a maturity
score per dimension — but the dimensions are presence-based
(`skills/assess/SKILL.md`: Test Infrastructure, Type Safety, Modularity, Naming,
Documentation, Dependency Hygiene, Build Configuration, Spec Sources, and three
adev-specific ones). None opens an issue board and none diffs a spec against its
source, so `spec-code-drift` and `missing-issue-binding` are outside its reach.
Listing it in their `covers_skills` would have produced exactly the "catalog
entry that measures nothing" failure this spec exists to prevent: a rubric
citing two `PV`/`KC` pairs the skill cannot resolve. The change-imminent tier
therefore scores `assess` on its maturity-score table as a producer, not on
planted ground truth.

`brainstorm` belongs to the **core-lifecycle** tier, which classes it a
*producer* that nonetheless cites `charter-scope-escape` — that tier states
explicitly that its `Kind` column is descriptive and does not partition on
catalog citation. The catalog simply lists `brainstorm` in that class's
`covers_skills`; this spec takes no position on the label. Conversely `issues`
*manages* work items rather than auditing them, so it is a producer and cites
no catalog id even though `missing-issue-binding` concerns the board it
writes. This is why the entity carries a scaffolding
manifest alongside the violation catalog rather than treating every fixture
file as ground truth. The seed scaffolding therefore includes the files those
skills need to run at all: `deploy.yaml` for `deploy`, `memory/heuristics/` for
`learn`, `CLAUDE.md` and `AGENTS.md` for `sync`, a rubric and a verdict input
for `eval`, `lifecycle-state/` for `work` and `build`, `samples/` for `implement`, the `tasks/tasks.json` board for `issues` and `implement` — and its `read_by` carries every skill that resolves the board through `getIssueManager` — `issues, implement, work, build, debug, specify, reconcile, status, hygiene, plan`, i.e. every such caller under `skills/` except `research`, whose `getIssueManager` call is gated on `--issue` and which no scenario passes — a reach-based exclusion, not a tier-based one, since `reconcile` and `status` are equally v2 and are listed. The rule is reach, not tier membership, and it has to be applied exhaustively: `work` and `build` are named two paragraphs above as skills this scaffolding serves, `debug` is a driven writer, and `specify` creates a Feature work item on the board, and a short list would surface as a false discrepancy the moment the disclosure-fidelity capability compares it against an observed `ReadTrace`. `hygiene` ships an issue-board audit pass and `plan` reads the board through `getIssueManager`, so neither is merely a scenario driver. `assess` is absent because it never opens the board at all,
and `governance/validate.yaml` + `governance/review.yaml` for `validate`,
`review-specs` and `build`, which resolve to the `governance-config` role.
The board entry is the one that needs `role: issue-board` specifically —
without it `CATALOG_ROLE_UNKNOWN` would reject the entry the `issues` and
`implement` scenarios read.

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
| `tests/evals/skill-regression/project/.context-index/governance/validate.yaml` | repo | this spec — command-free, so `/adev:validate` dispatches checks and writes a report |
| `tests/evals/skill-regression/project/.context-index/governance/review.yaml` | repo | this spec — command-free, so `/adev:review-specs` runs reviewers and produces sidecars |
| `tests/evals/skill-regression/project/.context-index/specs/product.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/charter.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.spec.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/create-order.plan.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.spec.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/specs/features/orders/shipping-rates.plan.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/adrs/0001-esm-only.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/memory/heuristics/orders.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/samples/order-pipeline-create-order.md` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/lifecycle-state/create-order.jsonl` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/lifecycle-state/shipping-rates.jsonl` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/evals/orders-rubric.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/evals/config.yaml` | repo | this spec |
| `tests/evals/skill-regression/project/.context-index/evals/orders-verdicts.json` | repo | this spec — the verdict set a tier's `eval` scenario passes to `adev eval score --input`, which takes a path rather than discovering one |
| `tests/evals/skill-regression/project/.context-index/tasks/tasks.json` | repo | this spec |
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
- **`/adev:eval` and `npm run test:evals`** *(arrives with the rubric tiers and
  the charter's CI-integration capability, not with this spec)* — drive skills
  against a temp-tree copy of `project/`. This spec ships no `*.test.mjs` under
  `tests/evals/skill-regression/`, so `npm run test:evals` discovers nothing
  here until a tier adds rubrics, scenarios, and a driver. Named so the fixture's
  purpose is legible, not as a claim that it runs today.
- **The disclosure-fidelity capability (later, same charter)** — compares an
  observed `ReadTrace` against the `read_by` declarations in `scaffolding`.
  Until it ships, `read_by` is validated for slug shape by
  `CATALOG_UNSAFE_SCALAR` and `CATALOG_UNKNOWN_SKILL` but its *meaning* —
  "skills expected to open this file" — is unobserved. The test pairing
  declaration to observation lands with that capability, not with this spec.

> **Tier vocabulary.** Every "Tier A / B / C" in this spec is the charter's
> **eval CI tier** vocabulary, not `gates.yaml`'s (fast/integration/e2e),
> `diagnostics.yaml`'s (1/2/3), or `graduated-rigor-tiers.spec.md`'s
> (full/quick).

### Where the integrity tests live, and why not beside the fixture

`scripts/run-tests.mjs::isEvalFile` puts everything under `tests/evals/` not
already claimed by `isNestedProjectFile` into the opt-in `npm run test:evals`
bucket. The charter requires the Tier A
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
| `CATALOG_UNSAFE_SCALAR` | any value — top-level scalar or entry field — coerces on reparse (a bare digit string, `true`/`false`/`null`, an empty string) or carries a flow indicator or colon-space; any `covers_skills` / `read_by` component fails `^[a-z][a-z0-9-]*$`; `catalog_id` fails the same pattern; `fixture_root` is not exactly `project` | an untrusted scalar becoming a path segment, a field that reparses as a different type, or an unvalidated containment base that makes every `CATALOG_PATH_ESCAPE` verdict vacuous |
| `CATALOG_STATUS_EVENT_MISMATCH` | a spec's `status:` frontmatter and its `lifecycle-state/*.jsonl` event chain disagree, per the pairs declared in Seed Content | a fixture whose routing ground truth says one thing in frontmatter and another in the log `/adev:work` actually reads |
| `CATALOG_ROLE_UNKNOWN` | a `scaffolding` entry's `role` is outside the documented enum | a typo'd `role: constitition` that parses, validates, and means nothing |
| `CATALOG_ANCHOR_NOT_UNIQUE` | an entry's `anchor` occurs zero times or more than once in its `path` | the catalog pointing at a defect site that moved or multiplied, silently |
| `CATALOG_VERDICT_IDS_UNRESOLVED` | `orders-verdicts.json` fails to parse, or carries a verdict id absent from `orders-rubric.yaml` | a scaffolding pair that drifts silently and surfaces inside a tier scenario as `SCORE_INPUT_PARSE_ERROR` or a mis-scored run |
| `CATALOG_UNKNOWN_SKILL` | a `covers_skills` or `read_by` slug names no skill under `skills/` | a rubric tier authored against a skill that does not exist |
| `CATALOG_UNRESOLVED_CITATION` | a rubric's `source` cites `skill-regression:<id>` and no such id exists | a rubric asserting against nothing while scoring green |

### Two mechanisms the rules above depend on

**Containment, and its ordering.** `CATALOG_PATH_ESCAPE` and
`CATALOG_PATH_MISSING` are decided with `resolveContained` / `lenientRealpath` /
`isContained` from `lib/path-safety.mjs`, realpathing `fixture_root` — never a
raw `startsWith`, which a symlinked base defeats (on macOS `/var` resolves to
`/private/var`, and temp directories land there). **Escape is decided before
existence**, following `assertContained` in `lib/extensions/exec-payload.mjs`,
whose lexical pre-check runs ahead of any filesystem access precisely so that
`../../../etc/passwd` on a machine lacking that file reports as an escape
rather than as merely missing. A rejecting fixture covers exactly that case.
**Every** rule that consumes an entry `path` runs on the `lenientRealpath`-resolved value
that step produced — the one the containment verdict was computed on, never
`resolveContained`'s lexical output, which would re-traverse symlinks at open time, never on the raw declaration — `CATALOG_ANCHOR_NOT_UNIQUE`
included, since it opens the file and counts occurrences. The guarantee
`assertContained` gives is about filesystem *access*, not about which code gets
reported, which is why it returns its realpathed result for the caller to reuse
rather than leaving each rule to re-derive one.

**The citation scan's root.** `CATALOG_UNRESOLVED_CITATION` is the growth
rule's enforcement point and the only rule that reads outside the fixture
directory. It scans `tests/evals/skill-regression/rubrics/*.yaml` and
`skills/*/default-rubric.yaml`, and nothing else — **as defaults**. The scan takes its rubric roots as a parameter defaulting to those two, because two rejecting cases cannot be built otherwise: the `CATALOG_UNRESOLVED_CITATION` case needs a rubric carrying an unresolvable citation, and the `catalog_id`-rename case needs one carrying the renamed prefix, and neither real root can host either. Both point the scan at a temp rubric root the case writes — a `createTempDir()` destination, torn down with `cleanupTempDir()`, named because every other temp destination here names its mechanism. The **default** root set needs its own non-vacuity proof for the same reason the repomap criterion does: both real roots are citation-free today (`tests/evals/skill-regression/rubrics/` does not exist yet and no `skills/*/default-rubric.yaml` cites anything), so an implementation defaulting the parameter to `[]` would pass every criterion while the growth rule enforced nothing. The passing case therefore asserts on the *effect* — that the scan reports having visited `skills/eval/default-rubric.yaml`. Only one of those roots is
empty today: `skills/eval/default-rubric.yaml` already exists, is scanned, and
cites no catalog ids, so it passes for a real reason.
`tests/evals/skill-regression/rubrics/` does not exist until a tier lands and
until then contributes nothing — stated so a green run is not mistaken for
coverage. It deliberately does
not assert the converse — see "The growth rule" above.

`CATALOG_UNRESOLVED_CITATION` is also the code the change-imminent tier's
conformance list refers to. That tier does not mint an alias for it: one
emitted code, one spelling. The thirteen `CATALOG_*` codes are declared as an **exported constant**, not as string literals inside the test: ADR-0019 Part A makes a code registry a lib constant so it is machine-readable, and a test-local literal cannot be imported by the tier's `rubric-coverage.test.mjs` — which would make "one spelling" a convention rather than a construction.

## Hermeticity Rules

The charter requires fixtures to resolve "without network access, submodules,
or container runtimes". The second Tier A test asserts that as twelve checkable
properties rather than as an intention:

| Property | Check |
|---|---|
| No symlinks | no entry under `tests/evals/skill-regression/` is a symbolic link |
| No submodules | no `.gitmodules` path entry has `tests/evals/skill-regression/` as a prefix |
| No container runtime | no `Dockerfile`, `docker-compose.yml`, or `compose.yaml` under the directory |
| No install ever runs inside the fixture | `project/` is absent from any root `workspaces` field, so `npm ci` at the repo root neither reads nor installs its `package.json`. Its declared dependencies are never resolved — which is what lets the `unused-dependency` class plant a real declaration |
| No step this repo would spawn | `project/.context-index/deploy.yaml` declares **only `manual` steps**. `lib/deploy.mjs` spawns `step.command` via `execFileAsync` for `shell` (`:308`), `verify` (`:392`), `gate` (`:444`) **and** `ci-trigger` (`:495` is the shared `execFileAsync` closure, reached from `:505` for `step.command` and `:524` for `step.poll_command`); only `executeManual` (`:353`) runs nothing. No step carries a `rollback:` field either — `lib/deploy.mjs` collects one as an instruction that `skills/deploy/SKILL.md` executes after confirmation, so a step-type ban alone leaves that door open. `project/package.json` declares no `scripts` key at all (lifecycle hooks included); no `command:`, `poll_command:`, `runner:`, `package:` or `prompt_text:` field appears anywhere under `project/.context-index/governance/`. `prompt_text:` joins the ban for the same reason as `package:` — `review-config.mjs` takes it inline with no path resolution and no existence check, so it is fixture-authored reviewer prose obeyed as instructions, reachable by moving one field; the fixture's reviewers need only the `plugin:` form. Two fields reach execution from a governance registry: `command:` via `quality-gate.mjs`, and `runner:` via `diagnostics/index.mjs`. `poll_command:` is banned there prophylactically — it is a `deploy.yaml` exec field (`lib/deploy.mjs:524`), already closed by the manual-only rule above, and the ban hardens against a future governance step type rather than closing a present door — `lib/hygiene/registry-drift.mjs::EXECUTION_FIELDS` also lists `prompt` and `pattern`, but that constant answers a different question (which field names what an entry *runs*, for drift reporting) and neither reaches `execFile`. Banning `prompt:` would re-break the three rubrics the field-not-file decision exists to keep scoreable: `lib/governance/validate-config.mjs:297` rejects a `subagent-review` check without `prompt`, and `lib/governance/review-config.mjs:535` requires every reviewer entry to declare exactly one of `prompt` / `prompt_text` / `package`. `prompt:` is therefore **permitted and required** here, and neither `gates.yaml` nor `diagnostics.yaml` exists there. `runner:` is the one a field-pair ban misses: `lib/diagnostics/index.mjs` resolves a `runner: project:<rel>` entry under `project/.context-index/diagnostics/` and executes it in-process via `await import(pathToFileURL(...))`, fixture-authored module code with no `--allow-exec`, which is why `project/.context-index/diagnostics/` joins `project/lib/` in the does-not-exist list; `project/.context-index/constitution.md` declares no Quality Gates command block. And there is no `project/lib/` directory, since `resolveVersion` dynamically imports `join(projectRoot, 'lib', 'milestones.mjs')` and would execute fixture-supplied module code |
| No probe the preflight would run | no `infra_requirements:` key appears in the frontmatter of any markdown under `project/` — specs, plans, the charter, `product.md`. `lib/infra-preflight.mjs::parseInfraRequirements` reads that block out of a spec or plan's own frontmatter and `executeProbe` (`:493`) splits each declared `probe:` string on whitespace and runs it through `execFileSync(command, args)` with `$VAR` substitution. `adev preflight run --spec <path> [--plan <path>]` is an early step in `implement`, `validate`, `debug`, `eval`, `write-test` and `recover` — six of the skills both tiers drive — pointed at the fixture's own spec and plan files, which this spec ships. There is no `--allow-exec` and no operator prompt on that path: it is fail-open, the inverse of the `exec-consent.mjs` contract the other doors are closed against. Ban the field, not the specs |
| Every path the fixture manifest declares stays inside `fixture_root` | `project/.context-index/manifest.yaml` carries path-valued keys, and the assertion is over **every** such key the fixture manifest actually declares — walked from the parsed document, failing on an unrecognised path-valued key rather than checking a hardcoded list. A closed list is what an implementer would code, and the list is longer than the obvious three (`sync.targets[].path`, `hygiene.source_roots`, `repomap.exclude`): it also reaches `modules[].paths`, `hygiene.coverage_exclude`, `hygiene.test_debt.exclude`, and — the one that matters most — **`lifecycle.partial_roots`**, which `lib/partial-artifact.mjs` reads as *containment-allowlist roots beyond `.context-index/`*. That key does not merely name a path; it widens a boundary, The key is *declared* as a containment-allowlist widener and, as of today, parsed and then dropped — `loadPartialKnobs`'s two callers read only the size knobs, and containment runs through `assertWithin(projectRoot, finalPath)`, which never consults it. So the assertion guards against the widening becoming live rather than against a present escape, which is worth the line precisely because a key that names a boundary is the one an implementer will wire up later. Each value resolves inside `fixture_root` **in the committed tree** — static, like the other eight doors, since a copy root does not exist during a read of the committed tree. `tasks.db_path` is not among them: it is deliberately absent from the committed manifest and is covered instead by the board-containment property, which asserts the resolver's *output*. None of these is contained by any rule declared elsewhere here: `CATALOG_PATH_ESCAPE` and `CATALOG_UNSAFE_SCALAR` cover catalog entry fields, not manifest values. `sync.targets[].path` is the live one: `/adev:sync` is a driven skill whose SKILL.md has the agent write each target path directly, and `lib/sync/` validates `format` without resolving `path`, so `path: ../../../CLAUDE.md` would pass every other rule in this spec. Escape is decided lexically before existence — `resolveContained` for the lexical pre-check, then `isContained(lenientRealpath(v), lenientRealpath(base))` for the verdict — detection by the write-escape equality is not containment, and it arrives only after the write lands |
| No agent-runtime surface the harness would load | no `project/.claude/` directory, no `project/.mcp.json`, no `project/.context-index/skill-extensions/`, no `project/.context-index/profiles.yaml`, no `project/.context-index/tool-categories.yaml`, no `project/.context-index/domains/` and no `project/.context-index/extensions/` — `lib/domains/domain-config.mjs` reads `gates.yaml`, `validate.yaml` and `reviewers.yaml` from `.context-index/domains/<domain>/`, and `lib/domains/resolve.mjs` resolves `domain` to the default `software` with no manifest opt-in, so the directory is live in a fixture that declares nothing; `extensions/` is banned for the adjacent reason — `lib/extensions/exec-payload.mjs` builds an extension root at `.context-index/extensions/<name>`, so a fixture-authored extension is content this repository would apply; a `command:` reaching there lands in the same `sh -c` fallback the `governance/gates.yaml` ban exists for. No `project/adev-workspace.yaml` (nor the `workspace.yaml` / `.workspace/` forms other skills detect) — `lib/workspace.mjs::detectWorkspace` walks **up** from cwd, so a fixture-shipped workspace file at the copy root is obeyed with no prompt and legitimises **writes** outside the copy, the half ADR-0005 bounds — its Decision rules grant sibling `.context-index/` reads explicitly, strictly read-only, so the read half rides on its own footing: fixture-authored config obeyed with no consent gate — and no `project/.context-index/governance/boundaries.yaml` — `DEFAULT_BOUNDARIES_PATH` is under `governance/`, not beside it, so a ban one level up would close nothing. `skill-extensions/`, `profiles.yaml`, `tool-categories.yaml` and `boundaries.yaml` are not agent-runtime files but belong to the same class — fixture-authored content this repository obeys with no consent gate. `lib/cli/skill-ext.mjs` reads `<projectRoot>/.context-index/skill-extensions/` and prints it as instructions that CLAUDE.md makes **every** SKILL.md load, so one file there is obeyed by every driven skill. `loadProfiles` and `loadCategories` overlay `.context-index/profiles.yaml` and `.context-index/tool-categories.yaml` onto the bundled defaults with the project winning, and both are called with `repoRoot` at the copy — a fixture that rewrites `reviewer-capable` to allow `filesystem: execute` grants elevated capability to every reviewer the harness dispatches, which is the consent surface itself rather than a door behind it. `boundaries.yaml` is banned as a **whole file** — not by field — because a `pattern:` there compiles to a `RegExp` run over file contents in a worker, and nothing the fixture must do requires the file. That is the one place the field-level and file-level bans meet, and the boundary is drawn on necessity rather than on the field: `boundaries.yaml` is excluded outright because nothing the fixture must do requires the file, while `validate.yaml` and `review.yaml` are kept and banned field-by-field because the enabled checks and reviewers do require them — `prompt:` being the field that must stay open. A regex-compiling `pattern:` key exists in neither of those two schemas (`validate.yaml`'s kinds accept no such field; `review.yaml`'s nearest relative is `dispatch.triggered.patterns`, a plural glob list matched by `globMatchPath`, not a `RegExp`), so there is no field to permit there in the first place. File-level wins where the whole file is optional; field-level wins where the file is required. The doors above all open from `lib/`; this one opens from the agent runtime, which loads a project-level `hooks` block or MCP server from the scenario working directory with no `--allow-exec` and no operator prompt — outside the fail-closed contract `lib/extensions/exec-consent.mjs` states for every other door here. The fixture ships neither today, so this is a static assertion against a future addition |
| No instruction file reaches outside the fixture | `project/CLAUDE.md`, `project/AGENTS.md`, `.context-index/memory/heuristics/orders.md` and `.context-index/samples/` are **required**, so they cannot be banned the way `skill-extensions/` is — they are an accepted crossing, recorded rather than closed, on the same footing as the `plugin:` prompt URI. What is asserted is their content: **no `@`-import line appears in any markdown under `project/`**, full stop. Containment-checking the targets is not enough, because CLAUDE.md imports are transitive up to five hops — `project/CLAUDE.md` → `project/docs/notes.md` → `@../../../CLAUDE.md` satisfies a check on the two entry points while feeding this repository's own constitution to a driven skill. Following the import graph would be the thorough answer; refusing the construct is the simpler one, and it costs nothing because the fixture needs no imports. `@../../../CLAUDE.md` would otherwise feed this repository's own constitution to a driven skill and invert rubric assertions with every other check green — a read-escape of exactly the shape the `sync.targets[].path` rule closes |
| No fenced shell block in an agent instruction file | Neither `project/CLAUDE.md` nor `project/AGENTS.md` carries a fenced code block opened with a shell-language info string (`bash`, `sh`, `shell`, `zsh`, `console`). The same driven skills that load these two required files as project context (per the row above) may treat a fenced shell block inside them as a literal instruction to run, not as documentation — the identical "agent obeys fixture instruction text" threat model the `@`-import ban above closes, extended to the other construct a scenario agent can act on. A fence tagged `js`, `yaml`, or left untagged is not banned: nothing in either file needs one today, and the risk is specific to a construct that reads as a runnable command line |
| Board resolves inside the run copy | `isContained(lenientRealpath(resolveStorageRoot(copyManifest, copyDir)), lenientRealpath(copyDir))` — the resolver's *output* is contained, realpathed on both sides. Asserting the manifest's declared string would only prove the author typed something in-fixture |
| No write escapes the repository | `git status --porcelain --ignored=traditional --untracked-files=all` and `git rev-parse HEAD`, captured before and after the run at every root `git worktree list --porcelain` prints, are byte-identical. Equality, not emptiness; `traditional`, not `matching`; every worktree root, not the main one — each of the three is load-bearing and reasoned in "How a Harness Run Uses the Fixture" |

The governance directory is the third door, and the property targets the
crossing rather than the directory. An earlier draft banned a `quality_gates`
manifest key, which this repository reads nowhere in `lib/`, `templates/` or
`cli/`. A later draft banned the whole directory — which closes the crossing but
also breaks three of the core tier's twelve rubrics: `/adev:validate` throws
`MISSING_VALIDATE_CONFIG` without a `validate.yaml` and writes no report,
`/adev:review-specs` runs no reviewers without a `review.yaml` and produces no
sidecars, and `build` chains both. That would leave `validate`, `review-specs`
and `build` with no scoreable input, and the `esm-violation` pair — cited only by
`validate` — unassertable, which is the "catalog entry that measures nothing"
failure this whole spec exists to prevent.

So the fixture **ships** those configs, command-free. What actually reaches
`execFile` is a `command:` array executed by
`lib/governance/quality-gate.mjs::runQualityGate` with `cwd` at the consumer repo
root — an invariant `lib/governance/validate-config.mjs` enforces by rejecting a
per-check `cwd` outright — reading the config `validate-config.mjs` resolves from
the *project* root — so banning the field, not the file, closes
the door and keeps the rubrics scoreable. `gates.yaml` is banned outright because
`lib/gates/doctor.mjs` falls through to `spawnSync("sh", ["-c", command])` on a
non-argv command there, and the constitution's Quality Gates block is banned
because `/adev:eval` falls back to it when `gates.yaml` is absent
(`skills/eval/SKILL.md:75`) — one door over from the one just closed.
`/adev:validate` does *not*: with no `gates.yaml` it skips Check 1 with an
advisory (`skills/validate/SKILL.md:205`), so this door opens through `eval`
alone. The ban is unchanged; only the reason for it is narrower than an earlier
draft claimed.

The **no-step-this-repo-would-spawn** property closes a crossing the others
miss, and its earlier draft got the step types wrong. `lib/deploy.mjs` spawns
`step.command` for `shell`, `verify` **and** `gate` — `executeGate` does so in a
polling loop — so permitting `gate` and `verify` while banning `shell` would
admit exactly the crossing the property claims to close. Only `manual` executes
nothing.

A `scripts` block in `project/package.json` and a `command:` array in
`project/.context-index/governance/{validate,gates}.yaml` are the same crossing
by another door: content this repository
did not author, asking this repository to run it. The repository's own answer is
`lib/extensions/exec-consent.mjs`, fail-closed — non-interactive callers refused
without `--allow-exec`. A fixture granting execution by default would sit
outside that contract, so it declares none.

The consequence for the `deploy` rubric is deliberate: a manual-only pipeline is
scored on its `--dry-run` transcript, and that is an obligation of **this**
spec's shipped `deploy.yaml`, not a detail deferred to the tier. The step-type
ban constrains what a step *is*; it says nothing about the mode it is invoked
in, and this spec's own argument for banning `gate` and `verify` is that a
step-type ban alone leaves a door open. What that door is *not*, on inspection:
`executeManual` (`lib/deploy.mjs:353`) takes `context.userResponse || 'done'`
and returns immediately — it never blocks, so an unattended run cannot hang in
`lib/`. The pause is prose in `skills/deploy/SKILL.md` asking the operator, so a
driver invoking `/adev:deploy` without `--dry-run` gets an agent waiting on a
human, not a wedged process. The disposition for that path — an unanswered
manual step is treated as `abort` and reported, never waited on — is stated with
the `--dry-run` criterion below, so the mechanism and its failure branch are one
reader's path apart rather than two sections.

The `project/package.json` requirement is doing two jobs. It keeps the fixture
compliant with constitution principle 1 — it declares two dependencies, but nothing ever installs or resolves them, so the repository's tree is unchanged — and its mere presence makes
`scripts/run-tests.mjs::isNestedProjectFile` classify `project/tests/` as a
nested project's own suite — so the fixture's planted test files are never
handed to this repo's runner, independently of the `tests/evals/` bucket rule.
Two mechanisms guard the same thing on purpose: the bucket rule is about where
the file sits, the nested-project rule is about what the file belongs to, and
losing either one should not start executing fixture code as if it were ours.

## How a Harness Run Uses the Fixture

**A run never executes against the committed tree**, and **one copy serves one scenario** — the lifetime is per-scenario, not per-sweep, so nothing a scenario **writes to the filesystem** can reach the next one. That scope matters: a hooks block or MCP server the agent runtime has already *loaded* is session-scoped and outlives the copy being discarded, which is why the core tier's halt rests on session persistence rather than on file persistence and both statements are true. That is the hermetic default and it is stated here because both tiers reason about it: it means the surviving-surface hazard the door predicates guard is *intra*-scenario (an orchestrator like `build` chains several skills inside one scenario, and a `.claude/` written by an early step is live for a later one), not cross-scenario. The harness copies the
**contents** of `fixture_root` into a fresh temporary directory — flat, never
into a subdirectory of it — and sets the scenario working directory there; the
committed fixture is input, never a workspace. Flat placement is what makes the
copy root simultaneously the git root and the project root carrying
`.context-index/manifest.yaml`, which every containment claim below assumes:
`git rev-parse --show-toplevel` equals the **realpathed** copy root, and `resolveStorageRoot`'s
git-common-dir fallback resolves to that same root rather than to an enclosing
temp directory.

The copy is built with `tests/helpers.mjs::createTempGitRepo()`, **not**
`createTempDir()`. `createTempDir` is `mkdtempSync` alone, so a copy made with it
is not a git repository and a `git commit` from `/adev:implement` resolves to
whatever repository git finds walking up from `tmpdir()` — an environment
property, not a bound. `createTempGitRepo` obtains its directory *from* `createTempDir()`, so the by-construction containment carries through to the git-initialised copy, and it is called in its **zero-argument form** — `tests/helpers.mjs` only interpolates a branch name when `branch !== "main"`, so the zero-argument call never reaches that path, and every tier inherits the constraint from here rather than re-deriving it. It runs `git init -b main` and presets
`user.email`, `user.name` and `commit.gpgsign false` so those commits succeed
rather than erroring. One side effect to record rather than discover: it also
writes a `README.md` and an initial commit, so the copy's root is *not*
byte-identical to `fixture_root`, and a `git status` run inside the copy is a
different probe from the repository-wide one below.

This is not fastidiousness. The skills driven against the fixture include
writers — `/adev:sync` rewrites the `CLAUDE.md` and `AGENTS.md` this spec
ships, and `implement`, `hygiene`, `reconcile`, `learn`, `debug` and `validate`
all write into `.context-index/` or `src/`. A `debug` or `validate` run that
does its job *repairs* the planted `spec-code-drift` or `esm-violation`, which
is the ground truth every rubric in both tiers cites. The damage would surface
one run later as `CATALOG_ANCHOR_NOT_UNIQUE` or `CATALOG_PATH_MISSING` — a
failure whose message points nowhere near its cause — and by then it is
committed.

The guarantee is asserted as a **before/after equality**, repository-wide and
including ignored paths — never as emptiness. The harness captures
`git status --porcelain --ignored=traditional --untracked-files=all` before the
run and again after, and requires the two byte-identical; `git rev-parse HEAD`
must likewise be unchanged.

**`traditional`, not `matching`, and the difference is the whole point.**
`--ignored=matching` reports an ignored *directory* as a single collapsed line
and never enumerates inside it. `.gitignore` declares `.context-index/hygiene/`,
`.context-index/packets/` and `.adev/` as directory patterns, and all three
exist at the main repository root — so an escaped `hygiene`, `implement`, `reconcile` or `prototype`
run writing a **new file inside** one of them produces byte-identical output
before and after, and the equality passes while the write landed in this
repository. Measured here: `matching` yields 20 ignored (`!!`) entries against ~1,300 under
`traditional --untracked-files=all` (1321 when measured; the absolute moves with tree state), and the difference is concrete —
`.context-index/packets/` alone goes from one collapsed line to seventeen
enumerated files. (Absolute totals move with tree state; the 1→17 expansion does
not.) Only the second mode
enumerates files inside ignored directories, which is the only thing that
catches the escape this assertion exists for. A later author must not
"simplify" it back.

Emptiness would be unsatisfiable, not merely strict: the capture also reports
the permanent ignored baseline, which under this mode is roughly 1,300 entries — the 1321 measured above
in this repository (`node_modules/`, `.beads/` lock files,
`.context-index/hygiene/`, `.context-index/packets/`, and the rest) in an
otherwise clean tree — the enumeration that makes the mode useful is exactly
what makes the baseline large. A gate that
is red before any scenario runs gets relaxed or deleted, which would leave the
mutating-skill crossing unguarded — the failure this assertion exists to prevent,
arriving through the other door.

The capture is taken **once per checkout**, and the checkout list is enumerated
from `git worktree list --porcelain` rather than hardcoded. *Where* that command
runs decides whether the assertion means anything: `git worktree list` reports
the worktrees of the repository containing its cwd, and a scenario's cwd is
inside the run copy — a separate repository. Enumerated from there it prints
exactly one root, the copy, which is then excluded, leaving an empty root set and
an equality that is vacuously true. The enumeration is therefore anchored to the
real repository and captured **before any chdir into the copy**:
`execFileSync("git", ["-C", resolveMainRoot(startCwd), "worktree", "list",
"--porcelain"])`, the same `-C`-argv discipline the captures use. The resulting
set must contain `resolveMainRoot(startCwd)` and be non-empty — asserted, not
assumed, so an empty or copy-only set fails rather than passes. The run copy is excluded on
purpose — it is a git tree that every driven skill writes into by design, so a
byte-identical status there is unsatisfiable rather than strict — and, when the
command is anchored correctly, it is also never enumerated, because a `git init`
root is not a registered worktree of this repository. Both are true and the rule
is stated rather than left to topology: an author who finds only the topological
argument will delete the rule, and a mis-anchored enumeration would then leave
the copy in the set and turn the equality falsely red. One root is not
enough because issue writes route to the main repository root via
`resolveStorageRoot` while `.context-index/` writes follow cwd's tree, and those
differ whenever the harness runs from a linked worktree — this repository is
developed from `.claude/worktrees/`.

Two roots are not enough either, for a reason `--untracked-files=all` does not
fix: `git status` never descends into a directory that is itself a git
repository, whatever the ignore or untracked mode. Every sibling linked worktree
under `.claude/worktrees/` therefore stays a single collapsed entry when seen
from the main root, no different from the ignored-directory collapse the mode
choice above exists to defeat — same failure shape, a different collapse point.
Enumerating from `git worktree list --porcelain` makes the assertion total over
the repository instead of over whichever two roots happened to be in view; the
main root is the first entry that command prints, so nothing is resolved by
hand. Where a single root must still be named — the board-containment property
below — use `lib/worktree.mjs::resolveMainRoot`, which is exactly
`dirname(git rev-parse --path-format=absolute --git-common-dir)`, rather than
re-deriving it.

The equality is only worth stating if it can fail, and at v1 nothing makes it
fail: no spec ships a scenario driver, so the test's own trigger copies and
mutates a temp tree that no repository-wide capture observes. The test therefore
**proves the guard red before trusting it green** — one deliberate probe file
written into `.context-index/packets/`, a `.gitignore` directory pattern, the
after-capture confirmed to differ, the probe deleted, the captures confirmed
equal again. A guard that has never been observed failing is not evidence.

Every capture runs as an **argv array with `shell: false`** — `execFileSync("git", ["-C", root, "status", "--porcelain", "--ignored=traditional", "--untracked-files=all"])` — with the root passed as a `-C` argument rather than concatenated into a command string. This matters more after the root set became runtime-derived: a worktree path containing a space or a shell metacharacter breaks a string-built command, and `lib/gates/doctor.mjs` is this repository's own demonstration of where that leads, falling through to `spawnSync("sh", ["-c", command])` on a non-argv command. `assertArgvCommand` (module-private, `lib/extensions/governance-registry.mjs:359`) is the contract being mirrored, not imported. One exception is pre-existing and stated rather than hidden: `createTempGitRepo` itself is built from `execSync` shell strings, including a `git checkout -b ${branch}` interpolation. The zero-argument form never reaches that branch and passes no caller-supplied value into any of its command strings, which is why the helper is safe here — but a later author adding a step inside it inherits the shell form, not the argv one.

Three refinements, each closing a hole the plainer form leaves:

- **No path filter.** Scoping to `tests/evals/skill-regression/` would check the
  one directory a run cannot dirty once cwd is the copy.
- **`--ignored=traditional --untracked-files=all`.** Plain `git status` never reports ignored paths, and
  `.gitignore` covers exactly what the writer skills produce —
  `.context-index/hygiene/`, `.context-index/packets/`,
  `.context-index/lifecycle-state/*.json`, `.context-index/.execution-state.json`,
  `.adev/`. An escaped `hygiene`, `implement` or `reconcile` run writes there and
  a plain status still reports clean.
- **Every worktree root, not cwd.** This repository is developed from linked
  worktrees under `.claude/worktrees/`. Run from one, `git status` covers only
  that worktree while `resolveStorageRoot`'s fallback returns the *main* repo
  root — so a write landing there is invisible to a cwd-scoped check by
  construction.

A commit is not a working-tree change, so the assertion is paired with a
`git rev-parse HEAD` equality check across the run: `implement` commits, and a
commit that landed in this repository leaves the tree clean. Scoping it to `tests/evals/skill-regression/` would check the one
directory a run cannot dirty once cwd is the temp copy, while the real escape
runs the other way: any resolver that finds its root through
`git rev-parse --git-common-dir` rather than cwd points at **this** repository,
so a scenario could write into the real `.context-index/`, `.beads/`, or agent
files and pass a fixture-scoped check unchanged.

The temp destination is a `createTempDir()` return — `mkdtempSync(join(tmpdir(), "adev-test-"))` — so containment is **by construction**, not by assertion. Naming the mechanism rather than the property matters: `cleanupTempDir` is an unguarded recursive `rmSync` that deletes whatever path it is handed, so the safety comes from where the path came from, and a later author handing it a non-`mkdtemp` path would satisfy the words while losing the guarantee. This is the hermeticity test's own copy; a *scenario* copy is torn down by the operator at v1 (no artifact calls `cleanupTempDir`) and is **retained**, not removed, when a door predicate trips, since the copy is then the evidence. Otherwise it is removed with
`tests/helpers.mjs::cleanupTempDir()` when the run ends.

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
  fixture declares two dependencies that are never installed or resolved, so it
  adds nothing to this repository's tree, and reading its catalog reuses
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
| Tier A catalog-integrity test | `tests/lib/evals/skill-regression-catalog.test.mjs` — the thirteen integrity rules, each with a rejecting fixture | large |
| Tier A hermeticity test | `tests/lib/evals/skill-regression-hermeticity.test.mjs` — the twelve hermeticity properties (ten static, plus the `resolveStorageRoot` containment and the write-escape equality), the two isolation assertions, the `validate.yaml`/`review.yaml` minimum-enabled-checks assertion, the two standalone manifest-key assertions (`workspace` absent, `tasks.backend: json`), the `run-tests --list` bucket check, the zero-argument `createTempGitRepo` assertion, the `/adev:deploy --dry-run` README authoring-rule assertion, and the file's three falsification artifacts — the probe write that proves the equality can go red, the rejecting fixture that adds an `@`-import and must fail, and the rejecting fixture that adds a fenced bash block to `CLAUDE.md` and must fail | large |
| Repomap exclusion | Add the `repomap.exclude` entry and pin it plus `hygiene.source_roots` in the tests | small |

## Acceptance Criteria

**Artifact shape**

- [ ] `catalog_id` is **pinned to the literal `skill-regression`**, asserted directly, the same way `fixture_root` is pinned to `project`. An earlier draft made the citation prefix dynamic — read from `catalog_id`, so renaming the catalog would move it — and that was wrong: three rules match the prefix, and only one is this spec's. `RUBRIC_TWIN_UNCITED` and `RUBRIC_COVERS_SKILLS_UNLISTED` both match the literal `skill-regression:` in the tier specs, so a rename would move one reader and silently strand two, and a `PV` cited without its `KC` twin would start passing. Pinning the key to the literal makes the three readers unable to diverge.
- [ ] Every path in Required Files exists, and `project/.context-index/evals/config.yaml` names `orders-rubric.yaml` so `/adev:eval` resolves it — asserted in the catalog-integrity test, the same host as the criterion below (`skills/eval/SKILL.md` reads the project rubric only through that key).
- [ ] `project/.context-index/evals/orders-rubric.yaml` loads through `loadRubric` without error — it is scaffolding for a skill that refuses a non-conforming rubric. Asserted in the catalog-integrity test alongside the `orders-verdicts.json` reconciliation, not left to a tier scenario: no scenario ships at v1, so an unhosted criterion here would ship unchecked.
- [ ] `project/.context-index/evals/orders-verdicts.json` parses as JSON and its verdict ids reconcile one-for-one with `orders-rubric.yaml`'s element and criterion ids. Without this the pair drifts silently and the failure surfaces inside a tier scenario as `SCORE_INPUT_PARSE_ERROR` or a mis-scored run.
- [ ] `catalog.yaml` parses under `lib/profiles/yaml.mjs::parseYaml` and the parsed document carries exactly the five documented top-level keys, four of which reconcile with the charter's `Fixture` entity under the two renames stated above.
- [ ] `fixture_root` is `project`, and `catalog.yaml` and `README.md` sit outside it.
- [ ] Every `planted_violations`, `known_clean`, and `scaffolding` entry carries every field its table lists, and no entry value is a map or a list.

**Ground truth**

- [ ] The catalog holds exactly ten `PV`/`KC` pairs at v1, one per class in the seed table.
- [ ] Every `PV` names a `KC` in `twin`, that `KC` names it back, and both carry the same `class`.
- [ ] Every entry `anchor` occurs exactly once in its `path`.
- [ ] Every entry `path` resolves inside `fixture_root` and exists on disk.
- [ ] The fixture's `charter.md` and both `.spec.md` slices carry an explicit `kind:` — ADR-0009 makes it the sole discriminator and requires newly authored artifacts to declare it. Absent, it defaults on read and `/adev:hygiene` reports a finding: an *unplanted* finding inside the report the core tier's `hygiene` rubric scores.
- [ ] The `tasks/tasks.json` scaffolding entry carries `role: issue-board` specifically — asserted directly, since any other enum member would satisfy `CATALOG_ROLE_UNKNOWN` identically while making the board prose silently false.
- [ ] The `orders-verdicts.json` reconciliation above is enforced by the catalog-integrity test under `CATALOG_VERDICT_IDS_UNRESOLVED`, so the rejecting-fixture obligation covers it.
- [ ] Every `covers_skills` and `read_by` slug names a directory under `skills/`, and every entry field value survives `CATALOG_UNSAFE_SCALAR`.
- [ ] `assess` appears in **no** class's `covers_skills` — its dimensions are presence-based and reach neither the board nor a spec-versus-source diff; `repomap` appears for `dead-export`; `issues` for none — matching the **change-imminent** tier's detector/producer split. `brainstorm` appears for `charter-scope-escape`, matching the **core-lifecycle** tier, which owns that skill and classes it a producer that nonetheless cites a catalog id.
- [ ] `orphan-source-file`'s `covers_skills` seeds `codehealth, repomap` and does **not** yet list `hygiene`. The core-lifecycle tier adds it as its own task and proves `RUBRIC_COVERS_SKILLS_UNLISTED` red-then-green across that edit, so shipping it pre-extended here would make that proof unreachable.
- [ ] The `create-order` and `shipping-rates` slices carry the same file kinds, the same section headings, and the same task count, differing at exactly three things and nothing else: the anchors, the two pinned `status:` values, and the two lifecycle logs' event chains. All three are load-bearing — the last is what the core tier's `work` routing assertion reads — so a later author "normalizing" the slices would disarm the very next criterion.
- [ ] `shipping-rates.spec.md` declares `status: review-pending` and `create-order.spec.md` declares `status: validated`, each asserted **directly** by the catalog-integrity test. Not via a catalog `anchor`: `scaffolding` entries carry no `anchor` field, every `PV`/`KC` anchor is already committed to its own defect site, and the ten-pair count forecloses minting an eleventh pair for the pin — so the direct assertion is the mechanism, and it is sufficient on its own. Without this a later author "normalizing" the two slices silently inverts the core-lifecycle tier's `work` routing assertion and nothing goes red.
- [ ] **The lifecycle log, not the frontmatter, is the load-bearing half.** `skills/work/SKILL.md` routes on the projected lifecycle state: it classifies a spec as unreviewed from `currentStep: specify` + `status: completed` + no `review` step, and its resume override routes to `/adev:implement` whenever it finds an incomplete plan. So `shipping-rates.jsonl` records `specify` completed and **no `review` step and no `plan` step** — the absence of the plan step is what stops the resume override firing despite `shipping-rates.plan.md` being on disk, which would otherwise invert the core tier's routing assertion while every other check stayed green. `create-order.jsonl` records the completed chain through `validate`. Both asserted by the catalog-integrity test as a named `CATALOG_STATUS_EVENT_MISMATCH` rule, so "consistent" is a predicate rather than a word.

**Integrity check**

- [ ] `tests/lib/evals/skill-regression-catalog.test.mjs` exists, is in the default `npm test` bucket (`node scripts/run-tests.mjs --list` lists it), and rejects a catalog for each of the thirteen rules with the named code.
- [ ] A traversal `path` naming a file that does not exist reports `CATALOG_PATH_ESCAPE`, not `CATALOG_PATH_MISSING` — escape is decided first.
- [ ] A symlinked `fixture_root` does not defeat containment (realpath, not `startsWith`).
- [ ] Each rejection case is proven by a failing input — and for `CATALOG_UNSAFE_SCALAR`, **per sub-condition rather than per code**: it bundles scalar coercion, flow indicators and colon-space, `covers_skills`/`read_by` slug shape, the `catalog_id` pattern, and the `fixture_root` literal, so a single fixture proves one branch while the other four can stop running with the code still emitted. The test supplies a deliberately broken catalog per rule and asserts the specific code, so a check that silently stopped running would go red.
- [ ] `CATALOG_UNRESOLVED_CITATION` scans rubric files for `skill-regression:<id>` citations and fails on an id absent from the catalog; it does **not** fail on a catalog entry no rubric cites.

**Hermeticity**

- [ ] `tests/lib/evals/skill-regression-hermeticity.test.mjs` exists, is in the default bucket, and asserts all twelve properties. The ten static properties it checks directly. The two run-dependent ones — the git-status/HEAD equality and the `resolveStorageRoot` containment — it exercises by **building its own copy and mutating it**, not by waiting for a scenario driver: no v1 spec ships one, so a criterion phrased around "a scenario run" would ship skipped, which is the failure this directory exists to prevent.
- [ ] `project/` is absent from any root `workspaces` field — proven **statically**, by reading the root `package.json` and asserting `workspaces` is absent or excludes the fixture path. Never by running `npm ci`, which deletes the repo root's `node_modules/` and requires network, violating the charter's own Portability attribute. Its two planted dependency declarations survive, since the `unused-dependency` class needs them.
- [ ] `tests/helpers.mjs::createTempGitRepo()` is called in its **zero-argument form** wherever this charter's tests build a copy. The helper is `execSync` shell strings including a `git checkout -b ${branch}` interpolation; the zero-argument call never reaches it, and promoting that from prose to an assertion is what stops a later tier passing a branch name and inheriting the shell form silently.
- [ ] `project/package.json` declares no `scripts` key.
- [ ] The fixture's `validate.yaml` enables at minimum the constitution-compliance and spec-compliance checks, and its `review.yaml` enables at minimum the reviewer that produces a `charter-scope-escape` finding — asserted in `skill-regression-hermeticity.test.mjs`, the same host as the isolation assertions, and asserted **through `loadValidateConfig` / `loadReviewConfig` against the fixture root**, on the *admitted* check and reviewer sets rather than on a raw YAML read. A raw read satisfies "enabled" while the loader admits nothing: `resolvePromptUri` returns `null` — for the `plugin:` form the fixture uses, on `PROMPT_CROSS_PLUGIN`, `PROMPT_PATH_ESCAPE` **or `PROMPT_NOT_FOUND`**, that last one being the likeliest drift in practice: a renamed or typo'd check prompt under `<pluginRoot>/skills/` is exactly a `prompt:` that reads as enabled and admits nothing. For project-relative forms, additionally `PROMPT_ABSOLUTE_PATH`, `PROMPT_PATH_TRAVERSAL`, `PROMPT_REALPATH` and `PROMPT_SYMLINK_ESCAPE`. The reviewer-side counterparts are `CROSS_PLUGIN_REF`, `PLUGIN_PATH_ESCAPE` and `PLUGIN_FILE_MISSING` — and the check is dropped from the *admitted set*, its error surfacing on `loadValidateConfig`'s `errors[]` rather than vanishing, which would reinstate the unscoreable-rubric failure through a door one layer below the one just closed. The shipped **`review.yaml`** carries the `materialized_at` marker, so no scenario is pushed onto the `adev governance materialize` path — which is exactly the path that would pull a domain overlay in. `validate.yaml` needs none and must not be given one: `registry-marker.mjs`'s `MARKED_REGISTRIES` is `{review.yaml, diagnostics.yaml, gates.yaml}` — membership is tested on the suffixed basename, `assertMaterialized` throws `MARKER_INPUT_INVALID` if pointed at an exempt registry precisely because that "would read like enforcement while enforcing nothing", and `adev governance materialize` refuses the registry outright. The fixture's `prompt:` values use the `plugin:<skill>/<path>.md` form — `plugin:validate/checks/<file>.md` in `validate.yaml`, `plugin:review-specs/<file>.md` in `review.yaml`, both matching the `^plugin:[a-z-]+/` pattern the criterion asserts — resolving into the plugin root, outside the copy — so no fixture-side prompt file is shipped and none is needed — and that form is **asserted, not assumed**: every `prompt:` under the fixture's governance files matches `^plugin:[a-z-]+/`, checked on the loader-resolved path being contained under `<pluginRoot>/skills/` — not merely "outside the copy", which `/etc/anything` also satisfies; that containment is what both loaders enforce with `isUnder` — `resolvePromptUri` for `validate.yaml`, `resolveReviewerPath` for `review.yaml`, which behave identically here (same project-relative `.context-index/` base, same `plugin:` containment under `<pluginRoot>/skills/`) but raise different codes, the same output-not-declaration discipline the board-containment property uses. Without it `resolvePromptUri` would happily resolve a project-relative `prompt: reviewers/mine.md` under the copy's own `.context-index/` — fixture-authored markdown obeyed as reviewer instructions, the identical crossing `package:` is banned for. That is a **permitted out-of-copy read**, recorded here rather than left implicit: `resolvePromptUri` contains it under the plugin's own `skills/` tree, so it crosses out of the copy but not out of a checked boundary. `package:` and `prompt_text:` — the other two forms `review-config.mjs:535` admits — are banned alongside `command:`, `poll_command:` and `runner:`: it resolves a `package.skill` / `package.adapter` pair the orchestrator dispatches as an external skill, i.e. fixture-authored markdown obeyed as reviewer instructions, and nothing the `charter-scope-escape` reviewer needs requires it. The fixture's reviewers use the `prompt:` form only. A `checks: []` file satisfies every other criterion here while `/adev:validate` detects nothing, which would leave `esm-violation` (cited by `validate` alone) measuring nothing.
- [ ] No `command:`, `poll_command:`, `runner:`, `package:` or `prompt_text:` field exists anywhere under `project/.context-index/governance/`. The first three reach execution; `package:` and `prompt_text:` are banned because `review-config.mjs` *admits* both as reviewer forms, so a loader-level assertion on the admitted set cannot reject either. They are dangerous for different reasons and the criterion has to say both: `package:` resolves a `package.skill`/`package.adapter` pair the orchestrator dispatches as an external skill; `prompt_text:` carries reviewer prose **inline**, with no path resolution and no existence check. Either way it is fixture-authored content obeyed as reviewer instructions. `prompt:` is **required** on the checks and reviewers this fixture must enable and is explicitly not banned; `pattern:` is not a key either schema defines, so it is not permitted there so much as absent; the `boundaries.yaml` that would compile one into a `RegExp` is banned as a whole file above, since nothing requires it. `runner:` is the one a field-pair ban misses: `lib/diagnostics/index.mjs` resolves `runner: project:<rel>` and executes it in-process via `await import`, with no `--allow-exec`. Neither `diagnostics.yaml` nor `gates.yaml` exists there; and `project/.context-index/constitution.md` declares no Quality Gates command block. The `validate.yaml` and `review.yaml` the fixture *does* ship are command-free, so `validate`, `review-specs` and `build` stay scoreable.
- [ ] The `tasks.db_path` write is recorded as a README authoring rule and the rule's presence is asserted in `skill-regression-hermeticity.test.mjs` — the same checkable-proxy pattern the `--dry-run` obligation uses. Without it the operator half rests on prose alone, and a pass driven from inside this checkout resolves storage to this repository's real board, letting `/adev:issues` create, claim or close live issues.
- [ ] Any run of `/adev:deploy` against the fixture passes `--dry-run`. The half that is checkable today — that the fixture's README records it as an authoring rule — is asserted in `skill-regression-hermeticity.test.mjs`, the same host as the adjacent deploy criteria; the run-time half has no host until a scenario driver ships, and that is stated rather than left to be discovered. For the path the spec itself names as reachable, the disposition is stated too: an unattended driver reaching a manual step without `--dry-run` treats an unanswered step as `abort` and reports, rather than waiting. The step-type ban below constrains what a step *is*, not the mode it is invoked in.
- [ ] `project/.context-index/deploy.yaml` declares **only `manual` steps** — no `shell`, no `verify`, no `gate`, no `ci-trigger` — and carries no `rollback:` field on any step.
- [ ] Neither `project/lib/` nor `project/.context-index/diagnostics/` exists — the two directories from which this repository would dynamically import fixture-authored module code (`resolveVersion`'s `join(projectRoot, 'lib', 'milestones.mjs')`, and a `project:` diagnostics runner).
- [ ] No `@`-import line appears in any markdown file under `project/` — asserted in `skill-regression-hermeticity.test.mjs`, the same host as the neighbouring properties, and proven by a rejecting fixture that adds one and is required to fail. A containment check on the two entry files would miss a transitive import (CLAUDE.md resolves imports up to five hops deep), and it would also iterate an empty set unless the fixture shipped an import it does not need; refusing the construct outright is both stronger and falsifiable.
- [ ] Neither `project/CLAUDE.md` nor `project/AGENTS.md` carries a fenced code block opened with a shell-language info string (`bash`, `sh`, `shell`, `zsh`, `console`) — asserted in `skill-regression-hermeticity.test.mjs`, the same host as the neighbouring `@`-import property, and proven by a rejecting fixture that adds a fenced `bash` block to a copy's `CLAUDE.md` and is required to fail. Same threat model as the `@`-import ban: a scenario agent loading these two required files as project context may run a fenced shell block as a literal instruction rather than read it as documentation. A fence tagged with a non-shell language, or left untagged, is unaffected.
- [ ] The fixture manifest declares no `workspace` key — asserted in `skill-regression-hermeticity.test.mjs` as a **standalone manifest-key assertion, outside the twelve-property table**, because it is neither a path (property 7's walk would never see it) nor a file (property 8 bans workspace *files*). A banned key rather than a contained path, since `skills/plan/milestone-mode.md` detects workspace mode from it and the path-valued-key walk would never see it.
- [ ] The fixture manifest declares `tasks.backend: json` exactly — asserted in `skill-regression-hermeticity.test.mjs`, the second of the two standalone manifest-key assertions. `lib/issues/registry.mjs` selects `BeadsAdapter` on `beads`, which spawns `execFileSync("br", …)` — an external binary running inside a fixture whose charter attribute is no network, no submodules, no container runtime. Containment survives either way (the adapter is rooted at the contained storage root), which is why the board-containment property does not catch it and this needs its own assertion.
- [ ] Every path-valued key the fixture manifest declares — walked from the parsed document, not a hardcoded list, and including `lifecycle.partial_roots`, whose values widen a containment allowlist rather than merely naming a path — resolves inside `fixture_root` **in the committed tree**, realpathed on both sides, with escape decided before existence. Static, like the eight other doors: a copy root does not exist during a read of the committed tree, and phrasing it against the copy would make it run-dependent for no gain. `tasks.db_path` is deliberately absent from the committed manifest and is covered by the board-containment property instead, which asserts the resolver's *output* rather than a declared string.
- [ ] No markdown file under `project/` carries an `infra_requirements:` key in its frontmatter. This is the one open exec door the other bans miss: `adev preflight run` is invoked early by six of the driven skills against the fixture's own spec and plan paths, and `lib/infra-preflight.mjs::executeProbe` runs the declared `probe:` string through `execFileSync` with no consent gate. Banning the field leaves the specs and plans — which every rubric in both tiers needs — untouched, exactly as with `command:` under `governance/`.
- [ ] None of `project/.claude/`, `project/.mcp.json`, `project/.context-index/skill-extensions/`, `project/.context-index/profiles.yaml`, `project/.context-index/tool-categories.yaml`, `project/adev-workspace.yaml`, `project/workspace.yaml`, `project/.workspace/` (the two alternate forms `skills/brainstorm`, `skills/status` and `skills/plan/milestone-mode.md` detect directly, without going through `lib/workspace.mjs` — and `brainstorm` is a driven skill), `project/.context-index/domains/`, `project/.context-index/extensions/`, or `project/.context-index/governance/boundaries.yaml` exists. The field bans below are scoped to `governance/`; these are whole-directory bans because the *same* registries are readable from a second location. These are the doors no `--allow-exec` prompt guards: the first two open from the agent runtime, the third is instruction text every SKILL.md is required to load, and the next two *are* the consent surface — profile resolution — rather than something behind it.
- [ ] `isContained(lenientRealpath(resolveStorageRoot(copyManifest, copyDir)), lenientRealpath(copyDir))` holds for **the copy the hermeticity test builds and mutates itself** — no v1 spec ships a scenario driver, so a criterion phrased around "a scenario run" would ship skipped. Asserted on the resolver's output, and distinguishing a resolved `tasks.db_path` from the git-common-dir fallback: because `createTempGitRepo` makes the copy its own git root, omitting `db_path` entirely would let the fallback return the copy root and the containment check pass **vacuously**.
- [ ] `git status --porcelain --ignored=traditional --untracked-files=all` — **no path filter**, ignored paths enumerated file-by-file — is captured at **every root `git worktree list --porcelain` prints** before and after the hermeticity test's own copy-and-mutate cycle — the same self-contained trigger as the criterion above — and the two are byte-identical. Two properties are load-bearing and each has a reason a later author will otherwise undo: **equality, not emptiness** (the ignored baseline is never empty in a clean tree — 1321 entries as measured above, so emptiness is unsatisfiable and gets relaxed away), and **`traditional`, not `matching`** (`matching` collapses an ignored directory to one line, so a new file inside `.context-index/packets/` is invisible to the comparison).
- [ ] The equality is **proven able to go red**, not merely asserted. The test writes one deliberate probe file into a gitignored repository directory (`.context-index/packets/` — a directory pattern, so `matching` would collapse it and `traditional --untracked-files=all` will not), confirms the after-capture differs from the before-capture, deletes the probe, and confirms the captures match again. The probe's filename is unique per run; the delete targets **that resolved file only** — `rmSync(probePath, { force: true })`, never the directory — and runs unconditionally (`t.after` / `try…finally`). `.context-index/packets/` is gitignored and so absent on a clean checkout but full of real sidecars in a developer tree, which is why the removal is file-scoped: if the test created the directory it removes it with a non-recursive `rmdirSync` that tolerates `ENOTEMPTY`, and otherwise leaves it alone. The probe lands at `resolveMainRoot(startCwd)`, the same root the board-containment property names: a crash between write and delete would otherwise strand an orphan in a gitignored repository directory, which the next run's before-capture would silently bake into the baseline. Without this the assertion is green by construction: no v1 spec ships a scenario driver, so the declared trigger only copies and mutates a temp tree, which no repository-wide capture can observe either way. Every other rule here carries a falsification obligation — the thirteen `CATALOG_*` codes each prove a rejection case, and the board-containment criterion names its own vacuity mode — and this one is the property whose three hard-won details (`traditional`, no path filter, every worktree root) are otherwise reasoned in prose and tested by nothing.
- [ ] The capture roots are **enumerated from `git worktree list --porcelain`**, not hardcoded to two — with the command anchored as `execFileSync("git", ["-C", resolveMainRoot(startCwd), "worktree", "list", "--porcelain"])` and run **before any chdir into the copy**, and the resulting set asserted non-empty and asserted to contain `resolveMainRoot(startCwd)`, both sides through `lenientRealpath` — that function returns its `git rev-parse` result un-realpathed, and on macOS `/var` and `/private/var` are the same directory under two names. Both details are load-bearing: enumerated from a cwd already inside the copy the command prints one root, the copy, which the exclusion below then removes — leaving an empty set and a vacuous pass. The main root and the harness's own tree differ under a linked worktree, and `git status` never descends into a nested git repository whatever the untracked mode — so every sibling worktree under `.claude/worktrees/` is invisible from the main root and needs its own capture. Where a single root is named instead (the board-containment property), it comes from `lib/worktree.mjs::resolveMainRoot`.
- [ ] `git rev-parse HEAD` is unchanged at **every root `git worktree list --porcelain` prints** across the run — the same root set as the status capture, never a hardcoded pair. A commit leaves the working tree clean, so no status of any kind observes it, and `implement` commits.
- [ ] `node scripts/run-tests.mjs --list` does not list any file under `tests/evals/skill-regression/`, and `node scripts/run-tests.mjs --evals --list` does not list `project/tests/create-order.test.mjs` (the nested-project exclusion).

**Isolation**

- [ ] `.context-index/manifest.yaml` `repomap.exclude` contains `tests/evals/skill-regression/**`, added as a text splice into the existing list (never a parse-and-reserialize of `manifest.yaml`, per `governance-splice.mjs`'s stated rationale, and never as a standalone block — `lib/repomap/index.mjs:186` *replaces* `DEFAULT_EXCLUDE` when manifest entries exist). A repomap run indexes no symbol under that path — asserted on the **effect**, not the declaration. Asserting only that the manifest carries the string would prove the author typed something, which is exactly the vacuity the board-containment property refuses one section above. Two constraints shape how the effect is asserted, and both come from the module rather than from preference: `lib/repomap/index.mjs`'s `run(root, mode)` is `async` and resolves to `undefined` — the assertion must `await` it — and it *writes* its output into `<root>/.context-index/hygiene/`; it also calls `process.exit(1)` when `mode === 'tree-sitter'` and the parser is missing. So the assertion runs `run()` with `mode: 'regex'` against a **bounded synthetic root**, never against the repository itself — not a `cpSync` of the whole checkout, which would pull `node_modules/` and `.git/` and put the Performance attribute ("Tier A CI checks add no measurable wall-clock to a PR") at risk. The synthetic root holds exactly three things: the spliced `.context-index/manifest.yaml` carrying the `repomap.exclude` entry, a stand-in for `tests/evals/skill-regression/project/`, and at least one *included* source file — the last so the assertion is non-vacuous, since an empty symbol set proves nothing about an exclusion — a write into `.context-index/hygiene/` at a real root would turn the write-escape equality in this same test file red by construction, since that directory is one of the three gitignored patterns the `traditional` mode was chosen to enumerate. It then reads **`repo-map.md`**, and requires no symbol heading under the fixture path. That synthetic root is a `createTempDir()` return, so containment is by construction, and it is torn down with `cleanupTempDir()` in `t.after`, and it matters here because `run()` persists an artifact into `<root>/.context-index/hygiene/`. Not `symbol-ranks.json`: `runRegexMode` (`:489`) writes `repo-map.md` alone and carries a standing comment that regex mode produces no JSON artifacts — those come from `runTreeSitterMode` (`:467`, `:471`), the branch this assertion deliberately avoids. `repo-map.md` is sufficient because `globSourceFiles(root, exclude)` runs at `:294`, *before* the mode branch, so the exclusion is fully exercised either way. `readManifest(root)` is the module's other export and pins the declaration half.
- [ ] `hygiene.source_roots` does not contain `tests/`, asserted in `skill-regression-hermeticity.test.mjs` — the host for both isolation assertions — so a later widening surfaces there.
- [ ] Running `/adev:codehealth` on this repo reports none of the fixture's planted dead exports, orphan files, or unused dependencies. This one is a **manual check performed once at implementation**, not a hosted assertion — `/adev:codehealth` is an interactive skill with no library entry point a `node:test` file can call, so stating a host here would name one that cannot exist. The `repomap.exclude` splice it depends on *is* hosted, in the same isolation block.

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
