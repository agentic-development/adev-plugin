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

# Artifact Spec: Rubric Set — Change-Imminent Tier

<!-- Artifact Spec within the eval-harness charter.
     Parent Charter: .context-index/specs/features/eval-harness/charter.md
     Delivers the charter capability "Rubric set, change-imminent tier".
     Depends on: hermetic-fixture-and-ground-truth-catalog.spec.md — a rubric
     cannot cite a catalog id before the catalog exists.
     This spec also declares the SHARED per-skill rubric contract that the
     core-lifecycle tier spec references rather than restates. -->

## Why This Tier Goes First

Eleven of adev's thirty skills are queued for demotion, merge, or deletion:
`codehealth`, `repomap`, `document`, `deploy`, `sync`, `learn`, `issues`,
`eval`, `assess`, `using-adev`, `prototype`. They carry less blast radius than
the core lifecycle, and the charter still orders them first, for one reason
worth restating where the work happens: **a rubric authored after a skill is
compressed measures the compressed skill against itself.** The baseline has to
exist before the change does, or there is nothing to regress against.

That ordering fixes what these rubrics assert. **They score each skill as it
behaves today, not as it should behave after its queued change.** A rubric row
that describes an intended future shape is an acceptance criterion for that
change wearing a rubric's clothes — it would pass only after the change lands,
so it could never show the change cost anything. Where today's behaviour is
plainly wrong, the rubric records it as `met` anyway and the defect is filed
separately. A baseline's job is to be accurate, not to be aspirational.

## Structural Shape

### Directory layout

```
tests/evals/skill-regression/
├── catalog.yaml          # from the fixture spec
├── project/              # from the fixture spec
├── tiers.yaml            # NEW — which skill belongs to which tier
├── rubrics/
│   ├── codehealth.yaml   # 11 files, one per skill in this tier
│   └── …
└── scenarios/
    ├── codehealth.md     # 11 files, one per rubric
    └── …
```

### The shared per-skill rubric contract

Every rubric in this tier — and, by reference, in the core-lifecycle tier —
conforms to the unified schema already enforced by
`lib/evals/rubric.mjs::loadRubric`, with the following additional constraints
that the schema does not and should not encode. The schema governs any Layer 3
rubric; these govern a *skill-regression* rubric specifically.

| Constraint | Value | Reason |
|---|---|---|
| `rubric_id` | `skill-regression-<skill-slug>` | One namespace, mechanically derivable from the filename, so the coverage check can pair file to id without a lookup table |
| `version` | starts at `1` | Bumped when an element or criterion is added, removed, or re-worded |
| `layer` | `3` | These rubrics score a run, which is the charter's Layer 3 |
| `skill` | the bare slug (`codehealth`, not `adev:codehealth`) | Matches the directory under `skills/`, which is what the coverage check globs |
| `scenario` | the scenario filename stem | Binds rubric to the run that produces its input |
| deterministic `required_elements` | **at least 5** | Tier B scores deterministic elements without a judge. A rubric below this floor is effectively judge-only, which strands it in nightly Tier C and leaves per-PR skill changes unguarded |
| judged `quality_dimensions` | **3 to 6** | Each costs one judge dispatch. Under three the judged half carries no signal; over six the tier's Tier C cost grows faster than its coverage |
| `required_element_points` | `10` | Matches `skills/eval/default-rubric.yaml`, so a score from this tier is on the same scale as a Layer 3 implementation score |
| `judged_criterion_points` | `15` | as above |
| `layer3_max_points` | `25` | as above |
| `unknown_policy` | `exclude_from_denominator` | charter invariant |
| `not_applicable_policy` | `exclude_from_denominator` | charter invariant |
| `insufficient_evidence_threshold_percent` | `40` | Matches the shipped default. A per-rubric value is permitted but must carry a comment saying why it differs |

Field shapes follow the shipped exemplar verbatim: a `required_elements` entry
carries `id`, `description`, `source`, `met_when`, `not_applicable_when`; a
`quality_dimensions` entry carries `id`, `criterion`, `reference`, `met_when`,
`not_met_when`, `unknown_when`. All values stay flat — no nested maps, no lists
inside list items — because `lib/profiles/yaml.mjs::parseYaml` materialises a
nested block as an empty value and the rubric would load as silence.

### `source` values, and the two kinds of skill in this tier

A `required_elements` entry's `source` names what the check reads. This tier
uses exactly three forms, and the third is what makes the fixture load-bearing:

| Form | Meaning | Example |
|---|---|---|
| `output:<what>` | a span of the skill's own output | `output: the severity-tiered findings table` |
| `artifact:<path>` | a file the skill wrote, relative to the fixture root | `artifact: docs/architecture.md` |
| `skill-regression:<PV-nn\|KC-nn>` | a catalog entry the run must have caught, or must not have flagged | `skill-regression:PV-03` |

The eleven skills split cleanly on whether the third form applies:

- **Detectors** — `codehealth`, `repomap`, `document`, `assess`. These scan a
  project and report findings, so their rubrics cite catalog ids and are scored
  on both sensitivity (caught `PV-nn`) and specificity (did not flag `KC-nn`).
  A detector rubric that cites a `PV` without its `KC` twin is rejected by the
  conformance check: without the twin it would score full marks for a skill
  that flags everything.
- **Producers and responders** — `deploy`, `sync`, `learn`, `issues`, `eval`,
  `using-adev`, `prototype`. These do not hunt for defects; they act, or they
  answer. Their rubrics cite `output:` and `artifact:` sources only, and
  consume the fixture as **scaffolding** — the `.context-index/` files the
  skill needs in order to run at all, declared in the catalog's `scaffolding`
  list. Requiring a planted violation of these skills would mean inventing one
  they were never meant to find.

### `tiers.yaml`

One flat-YAML file declaring tier membership, so the coverage check can assert
something exact rather than something vacuous:

```yaml
tiers_version: 1
change_imminent: "codehealth,repomap,document,deploy,sync,learn,issues,eval,assess,using-adev,prototype"
core_lifecycle: "work,brainstorm,specify,review-specs,plan,route,implement,write-test,validate,debug,build,hygiene"
remaining: "init,reconcile,recover,research,retro,sample,status"
uncovered: "bugfix-loop"
```

Comma-joined scalars, not lists, for the same flat-YAML reason as the catalog.

`tiers.yaml` is authored here because this tier is the first to need it, and it
declares **all four** buckets rather than only its own. A manifest that grew one
tier at a time could never answer "is every skill accounted for", which is the
only question that makes the coverage check worth running. The `remaining`
bucket is v2 and carries no rubric files yet; `uncovered` is discussed under
Open Questions.

## The Eleven Rubrics

Each row fixes the rubric's identity, the artifact its deterministic elements
read, and — for the four detectors — the catalog classes it cites. Element and
criterion **text** is authored at implementation time against the skill as it
behaves today; this table fixes what each rubric is *about*, which is what a
reviewer needs to judge coverage.

| Skill | Kind | Scored input | Catalog classes cited | Elements / criteria |
|---|---|---|---|---|
| `codehealth` | detector | the severity-tiered report | `orphan-source-file`, `dead-export`, `unused-dependency` | 7 / 4 |
| `repomap` | detector | `dependency-graph.json`, `symbol-ranks.json` | `orphan-source-file`, `dead-export` | 6 / 3 |
| `document` | detector | `docs/architecture.md` + per-module docs | `undocumented-public-api` | 6 / 4 |
| `assess` | detector | the maturity score table | `spec-code-drift`, `missing-issue-binding` | 6 / 3 |
| `deploy` | producer | the pipeline execution transcript | — | 6 / 3 |
| `sync` | producer | the rewritten `CLAUDE.md` / `AGENTS.md` | — | 6 / 3 |
| `learn` | producer | the written heuristic file | — | 5 / 3 |
| `issues` | producer | the created/updated work items | — | 6 / 3 |
| `eval` | producer | the score report and its verdict table | — | 6 / 4 |
| `prototype` | producer | the generated prototype tree | — | 5 / 3 |
| `using-adev` | responder | the answer text | — | 5 / 3 |

Counts are floors-and-ceilings from the shared contract, not estimates: every
row satisfies "at least 5 deterministic, 3–6 judged". Totals: 64 deterministic
elements, 36 judged criteria, 11 judge dispatches per Tier C run per criterion.

### Rubrics that must assert against their own output contract

Three of these skills produce output whose *shape* is already specified
elsewhere in this repo, and their rubrics must cite that spec as the
`reference` on at least one judged criterion rather than inventing a standard:

- `eval` — `skills/eval/default-rubric.yaml` and the scoring engine's verdict
  table contract (`lib/evals/score-schema.mjs`). An `eval` rubric that scored
  `eval` against a freshly invented notion of a good score report would be
  measuring the rubric author's taste.
- `sync` — the constitution-to-agent-file mapping declared in
  `.context-index/manifest.yaml`.
- `issues` — the board-granularity invariant (a Feature carries `spec_ref`, never
  `planRef` + `planTask`), owned by the `agent-reliable-state-artifacts` charter.

## Scenarios

One scenario per rubric at `scenarios/<skill>.md`, following the shape already
established by `tests/evals/skill-compression/scenarios/*.md`: the invocation,
the fixture project as the working tree, and the simulated user responses in
order. Each scenario states its working directory as
`tests/evals/skill-regression/project` and never as a path outside it.

A scenario is not optional garnish. A rubric names what to check; the scenario
names the run that produces the thing being checked. A rubric whose `scenario`
key points at a missing file is rejected by the conformance check, because it
would otherwise score whatever output happened to be lying around.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `tests/evals/skill-regression/tiers.yaml` | repo | this spec |
| `tests/evals/skill-regression/rubrics/<skill>.yaml` × 11 | repo | this spec |
| `tests/evals/skill-regression/scenarios/<skill>.md` × 11 | repo | this spec |
| `tests/lib/evals/rubric-coverage.test.mjs` | repo | this spec (Tier A coverage + conformance) |

Eleven skills, so 22 authored rubric/scenario files plus the manifest and the
test: 24 files.

## Consumers

- **`tests/lib/evals/rubric-coverage.test.mjs`** — the charter's declared
  "default-bucket test asserting every skill has a conforming rubric". Loads
  every rubric through `lib/evals/rubric.mjs::loadRubric` and applies the
  additional skill-regression constraints on top. In the default `npm test`
  bucket, for the same reason the fixture's integrity tests are: everything
  under `tests/evals/` is opt-in, and a per-PR gate that only runs nightly is
  not a gate.
- **`adev eval score --rubric <path> --input <path>`** — scores a verdict set
  against one of these rubrics. This tier introduces **no new CLI verb and no
  new library module**; it is rubric content for the engine that already
  shipped.
- **`npm run test:evals`** — Tier B and Tier C runs that actually drive the
  skills against the fixture.
- **The core-lifecycle tier spec** — references the shared contract above
  rather than restating it. If the contract changes, it changes here.

## Conformance Rules

Beyond every rule `loadRubric` already enforces, the coverage test rejects:

| Rule | Rejected when | Failure it prevents |
|---|---|---|
| `RUBRIC_TIER_UNCOVERED` | a slug in `tiers.yaml`'s `change_imminent` has no `rubrics/<slug>.yaml` | a tier that reports complete while a skill sits unguarded |
| `RUBRIC_TIER_ORPHAN` | a `rubrics/*.yaml` names a slug in no tier | a rubric nobody's coverage claim accounts for |
| `RUBRIC_TIER_INCOMPLETE` | the four `tiers.yaml` buckets do not partition `ls skills/` exactly | a skill added later that silently belongs to no tier |
| `RUBRIC_ID_MISMATCH` | `rubric_id` is not `skill-regression-<filename stem>`, or `skill` is not the stem | a rubric scoring one skill under another's name |
| `RUBRIC_SCENARIO_MISSING` | the `scenario` key names no file under `scenarios/` | a rubric scoring whatever output is at hand |
| `RUBRIC_ELEMENT_FLOOR` | fewer than 5 `required_elements`, or `quality_dimensions` outside 3–6 | a judge-only rubric stranded in nightly Tier C |
| `RUBRIC_TWIN_UNCITED` | a rubric cites `skill-regression:PV-nn` without also citing its `KC` twin | sensitivity measured with no specificity control |
| `RUBRIC_CITATION_UNRESOLVED` | a cited catalog id is absent from `catalog.yaml` | a rubric asserting against nothing while scoring green |

`RUBRIC_CITATION_UNRESOLVED` is the same check the fixture spec names
`CATALOG_UNRESOLVED_CITATION`, seen from the rubric side. It is implemented
once, in the fixture spec's integrity test, and asserted here by that test
running — not duplicated.

## Migration of the Three Existing Rubrics

`tests/evals/skill-compression/rubrics/{brainstorm,plan,specify}.yaml` predate
the unified schema: they score `quality_dimensions` on a 1–5 scale with
`weight` fields, and their `required_elements` carry `match_pattern` instead of
`source` + `met_when`. `lib/evals/rubric.mjs` already rejects them with
`RUBRIC_LEGACY_SCALE`.

All three name skills in the **core-lifecycle** tier, not this one, so their
migration belongs to that spec. It is named here only to record that this tier
does not touch them and does not inherit their shape: the exemplar for a
skill-regression rubric is `skills/eval/default-rubric.yaml`, which already
conforms, not the three legacy files.

## System Constitution Reference

- **Principle 1, "Minimize external dependencies"** — This tier adds rubric
  content and one test. No new module, no new CLI verb, no new dependency; the
  loader and scoring engine already shipped.
- **Principle 2, "Skills are primarily markdown"** — The scenarios are markdown
  instructions describing a run. They contain no executable logic, and the
  rubrics that score them are data.
- **Architecture boundary, "Autonomous (Agent May Decide): adding tests"** — A
  regression baseline for existing skills sits inside the autonomous boundary.
  It changes no skill's behaviour and no lifecycle ordering.
- **Charter Quality Attribute, "Determinism"** — "The same rubric and the same
  verdicts produce a byte-identical score." The deterministic-element floor is
  what keeps a usable share of each rubric on the deterministic side of that
  guarantee.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|---|---|---|
| `tiers.yaml` and the coverage test | Author the manifest and `tests/lib/evals/rubric-coverage.test.mjs` with all eight conformance rules, each proven by a rejecting input | large |
| Detector rubrics + scenarios (4) | `codehealth`, `repomap`, `document`, `assess` — the four that cite catalog ids and need both twins | large |
| Producer rubrics + scenarios (6) | `deploy`, `sync`, `learn`, `issues`, `eval`, `prototype` | large |
| Responder rubric + scenario (1) | `using-adev` | small |
| Contract cross-reference | Confirm the core-lifecycle spec references this spec's shared contract rather than copying it | small |

## Acceptance Criteria

**Artifact shape**

- [ ] `tiers.yaml` exists, parses under `parseYaml`, and its four buckets partition `ls skills/` exactly — every directory in exactly one bucket, no slug naming a directory that does not exist.
- [ ] All 11 `rubrics/<skill>.yaml` and all 11 `scenarios/<skill>.md` exist, one per slug in `change_imminent`.
- [ ] Every rubric loads through `lib/evals/rubric.mjs::loadRubric` without error.
- [ ] Every rubric satisfies the shared contract table: `rubric_id`, `layer`, `skill`, `scenario`, the point budgets, both policies, and the threshold.
- [ ] Every rubric declares at least 5 `required_elements` and between 3 and 6 `quality_dimensions`.
- [ ] No rubric value is a nested map or a list inside a list item.

**Baseline fidelity**

- [ ] Every element and criterion describes the skill **as it behaves today**. Verified by running each rubric's scenario against the current skill and confirming the deterministic half scores full marks; a `not_met` here means the rubric described an intended future, not a baseline.
- [ ] Any behaviour a rubric author judged wrong but recorded as `met` is filed as a separate issue, and the rubric carries a comment naming that issue.

**Detector coverage**

- [ ] Each of the four detector rubrics cites at least one `skill-regression:PV-nn` and its `KC` twin.
- [ ] Every cited catalog id resolves in `catalog.yaml`.
- [ ] No producer or responder rubric cites a catalog id.

**Coverage check**

- [ ] `tests/lib/evals/rubric-coverage.test.mjs` is in the default bucket (`node scripts/run-tests.mjs --list` lists it).
- [ ] Each of the eight conformance rules is proven by a deliberately broken input asserting the named code — not only by the eleven good rubrics passing. A rule with no rejecting case is a rule that can stop running without going red.
- [ ] Adding a new directory under `skills/` fails `RUBRIC_TIER_INCOMPLETE` until it is placed in a bucket.

**Gates**

- [ ] `npm test` passes.
- [ ] `npm run test:evals` runs the tier's Tier B deterministic pass without an API key.
- [ ] No constitutional violations introduced.

## Open Questions

- **`bugfix-loop` is covered by no tier.** `skills/` holds 31 directories; the
  charter's tiering covers 30. `bugfix-loop` is a self-re-invoking wrapper over
  `/adev:debug --auto` rather than a lifecycle step, which is presumably why it
  was never counted — but "presumably" is not a tier. `tiers.yaml` records it
  in an explicit `uncovered` bucket so the partition check can pass without
  pretending the skill does not exist. Whether it earns a rubric, or is
  formally declared out of scope in the charter, needs an answer before the v2
  remaining tier claims full coverage. It blocks neither v1 tier.
