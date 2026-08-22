---
partial_schema: spec@1
charter: eval-harness
kind: artifact
status: review-pending
risk_level: medium
milestone: v1
revision: 15
charter-revision: 6
created: 2026-08-21
updated: 2026-08-22
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

Eleven of adev's thirty-one skills (`bugfix-loop` excluded, per `tiers.yaml`'s `uncovered` bucket) are queued for demotion, merge, or deletion:
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

> **Tier vocabulary.** "Tier A / B / C" in this spec always means the
> charter's **eval CI tiers**. `tiers.yaml`'s `change_imminent` /
> `core_lifecycle` / `remaining` / `uncovered` are **rubric-set buckets**, a
> different axis; the `RUBRIC_TIER_*` codes below name buckets, not CI tiers.

## Structural Shape

### Directory layout

```
tests/evals/skill-regression/
├── README.md             # from the fixture spec
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
| `version` | starts at `1` | Bumped when an element or criterion is added, removed, or re-worded. **Nothing enforces the bump at v1** — an accepted limit, recorded because `baseline-provenance-and-percent-regression.spec.md` reads `rubric_version` for `BASELINE_VERSION_MISMATCH`, so an unbumped edit makes a baseline comparison claim same-version across changed content |
| `layer` | `3` | These rubrics score a run, which is the charter's Layer 3 |
| `skill` | the bare slug (`codehealth`, not `adev:codehealth`) | Matches the directory under `skills/`, which is what the coverage check globs |
| `scenario` | the scenario filename stem | Binds rubric to the run that produces its input. The stem is the bare skill slug (`codehealth`), not the compression harness's `<skill>-scenario` form, so `rubric_id`, filename, and `scenario` are all derivable from one token and `RUBRIC_ID_MISMATCH` / `RUBRIC_SCENARIO_MISSING` need no lookup table |
| deterministic `required_elements` | **at least 5** | Tier B scores deterministic elements without a judge. A rubric below this floor is effectively judge-only, which strands it in nightly Tier C and leaves per-PR skill changes unguarded |
| judged `quality_dimensions` | **3 to 6** | Each costs one judge dispatch. Under three the judged half carries no signal; over six the tier's Tier C cost grows faster than its coverage |
| `required_element_points` | `10` | Matches `skills/eval/default-rubric.yaml`, so a score from this tier is on the same scale as a Layer 3 implementation score |
| `judged_criterion_points` | `15` | as above |
| `layer3_max_points` | `25` | as above |
| `unknown_policy` | `exclude_from_denominator` | charter invariant |
| `not_applicable_policy` | `exclude_from_denominator` | charter invariant |
| `insufficient_evidence_threshold_percent` | `40` | Matches the shipped default. A per-rubric value is permitted but must carry a comment saying why it differs — **review-time convention, enforced by no code**, and labelled so because this spec argues two sections down that `parseYaml` discards comments and a key nothing reads is no better |

Field shapes follow the shipped exemplar verbatim: a `required_elements` entry
carries `id`, `description`, `source`, `met_when`, `not_applicable_when`; a
`quality_dimensions` entry carries `id`, `criterion`, `reference`, `met_when`,
`not_met_when`, `unknown_when`. All values stay flat — no nested maps, no lists
inside list items — because `loadRubric`'s nested-map pass (`assertNoNestedMaps`, `lib/evals/rubric.mjs:226`, module-private) rejects
those shapes at load time with `RUBRIC_NESTED_MAP`. The reader itself parses
nesting faithfully (`lib/profiles/yaml.mjs` declares "nested maps via indent");
the refusal is policy on the parsed tree, and it is loud — an unloadable rubric,
not a silent one.

### `source` values, and the two kinds of skill in this tier

A `required_elements` entry's `source` names what the check reads. This tier
uses three forms, and the third is what makes the fixture load-bearing. The set is not closed: the charter's disclosure-fidelity capability lands an observed read trace as a fourth source form in this same milestone, so the deferred `RUBRIC_SOURCE_FORM_UNKNOWN` must be authored against an open set rather than these three.

| Form | Meaning | Example |
|---|---|---|
| `output:<what>` | a span of the skill's own output | `output: the severity-tiered findings table` |
| `artifact:<path>` | a file on disk under `fixture_root` after the run — whether the skill wrote it or the fixture shipped it, since `document`'s twin reads the fixture-supplied `docs/api.md` | `artifact: docs/architecture.md` |
| `skill-regression:<PV-nn\|KC-nn>` | a catalog entry the run must have caught, or must not have flagged | `skill-regression:PV-03` |

Two readers exist at v1 and neither reads the first form. `artifact:` is
resolved and contained by `RUBRIC_SOURCE_PATH_ESCAPE`; `skill-regression:` is
resolved by the fixture spec's `CATALOG_UNRESOLVED_CITATION` scan and by
`RUBRIC_TWIN_UNCITED`. **`output:` has no v1 reader at all** — `lib/evals/score.mjs`
never reads an element's `source`, so the string is carried and displayed but
never resolved by any *machine* reader; its v1 consumer is the operator running
the manual Tier B pass, who resolves each `output:` span by hand against the
skill's transcript, and its automated consumer is the charter's CI-integration
capability, which owns the source-resolver. One consequence follows and is recorded rather than
fixed here: because no rule constrains the *prefix*, a typo (`artifcat:`) is
neither contained nor scanned — it degrades silently into an unread string. A
`RUBRIC_SOURCE_FORM_UNKNOWN` rule closes that, and belongs with the resolver
that gives `output:` a reader rather than with this tier's eleven rules.

The eleven skills split cleanly on whether the third form applies:

- **Detectors** — `codehealth`, `repomap`, `document`. These scan a
  project and report findings, so their rubrics cite catalog ids and are scored
  on both sensitivity (caught `PV-nn`) and specificity (did not flag `KC-nn`).
  A detector rubric that cites a `PV` without its `KC` twin is rejected by the
  conformance check: without the twin it would score full marks for a skill
  that flags everything.
- **Producers and responders** — `deploy`, `sync`, `learn`, `issues`, `eval`,
  `assess`, `using-adev`, `prototype`. Two of these sit here for reasons worth
  recording. `issues` *manages* work items rather than auditing them, so the
  `missing-issue-binding` class belongs to `reconcile`, `status` and `hygiene`,
  and the fixture spec's `covers_skills` omits `issues` accordingly. `assess`
  looks like a detector and an earlier draft classed it as one — but its eleven
  dimensions are presence-based (Test Infrastructure, Type Safety, Modularity,
  Naming, Documentation, Dependency Hygiene, Build Configuration, Spec Sources,
  plus three adev-specific), and none opens a board or diffs a spec against its
  source. Citing `spec-code-drift` or `missing-issue-binding` from its rubric
  would name ground truth the skill cannot reach, so it is scored on its
  maturity-score table instead and the fixture's `covers_skills` omits it. These do not hunt for defects; they act, or they
  answer. Their rubrics cite `output:` and `artifact:` sources only, and
  consume the fixture as **scaffolding** — the `.context-index/` files the
  skill needs in order to run at all, declared in the catalog's `scaffolding`
  list. Requiring a planted violation of these skills would mean inventing one
  they were never meant to find.

### `tiers.yaml`

One flat-YAML file declaring tier membership, so the coverage check can assert
something exact rather than something vacuous:

```yaml
landed: "change_imminent"
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
read, and — for the three detectors — the catalog classes it cites. Element and
criterion **text** is authored at implementation time against the skill as it
behaves today; this table fixes what each rubric is *about*, which is what a
reviewer needs to judge coverage.

| Skill | Kind | Scored input | Catalog classes cited | Elements / criteria |
|---|---|---|---|---|
| `codehealth` | detector | the severity-tiered report | `orphan-source-file`, `dead-export`, `unused-dependency` | 7 / 4 |
| `repomap` | detector | `.context-index/hygiene/dependency-graph.json`, `.context-index/hygiene/symbol-ranks.json` — the scenario invokes `--mode tree-sitter`, which is the only mode that writes them (`runRegexMode` writes `repo-map.md` alone) and which fails loudly on a missing parser rather than degrading silently; without the pin a healthy skill scores `not_met` in an environment ADR-0001 documents as supported, and baseline fidelity would misread that as a rubric describing an intended future | `orphan-source-file`, `dead-export` | 6 / 3 |
| `document` | detector | `docs/architecture.md` + per-module docs | `undocumented-public-api` | 6 / 4 |
| `assess` | producer | the maturity score table | — | 6 / 3 |
| `deploy` | producer | the `--dry-run` transcript | — | 6 / 3 |
| `sync` | producer | the rewritten `CLAUDE.md` / `AGENTS.md` | — | 6 / 3 |
| `learn` | producer | the written heuristic file | — | 5 / 3 |
| `issues` | producer | the created/updated work items | — | 6 / 3 |
| `eval` | producer | the score report and its verdict table | — | 6 / 4 |
| `prototype` | producer | the generated prototype tree | — | 5 / 3 |
| `using-adev` | responder | the answer text | — | 5 / 3 |

> The `undocumented-public-api` twin is defined against the fixture's
> `docs/api.md`, which `docs/architecture.md` does not replace. The `document`
> rubric's deterministic element for that pair reads `artifact: docs/api.md`;
> `docs/architecture.md` is the skill's own output and is scored by the other
> elements.

The per-row counts are indicative; only the floors are enforced (`RUBRIC_ELEMENT_FLOOR` checks >= 5 and 3-6, never the row figure), so the 36 the core tier's cost arithmetic consumes is a projection rather than a pinned contract. Counts are floors-and-ceilings from the shared contract, not estimates: every
row satisfies "at least 5 deterministic, 3–6 judged". Totals: 64 deterministic
elements and 36 judged criteria — so 36 judge dispatches per eval CI Tier C
run over this tier, one per criterion, one dispatch per criterion while
judged-verdict sampling stays deferred (charter, Deferred Capabilities) — the
single-criterion isolation invariant fixes what a dispatch *contains*, not how
many run.

### Rubrics that must assert against their own output contract

Three of these skills produce output whose *shape* is already specified
elsewhere in this repo, and their rubrics must cite that spec as the
`reference` on at least one judged criterion rather than inventing a standard:

- `eval` — `skills/eval/default-rubric.yaml` for the rubric shape, the verdict enums
  `ELEMENT_VERDICTS` / `CRITERION_VERDICTS` in `lib/evals/rubric-schema.mjs`
  (`score-schema.mjs` deliberately does not re-declare them), the half-status
  enum `HALF_STATUSES` in `lib/evals/score-schema.mjs`, and the rendered
  score-report table in `lib/cli/eval.mjs`. An `eval` rubric that scored
  `eval` against a freshly invented notion of a good score report would be
  measuring the rubric author's taste.
- `sync` — the constitution-to-agent-file mapping declared in
  `.context-index/manifest.yaml`.
- `issues` — the board-granularity invariant (a Feature carries `spec_ref`, never
  `planRef` + `planTask`), owned by the `agent-reliable-state-artifacts` charter.

> **Code namespace.** The `RUBRIC_*` codes below are **coverage-check** codes
> raised by `tests/lib/evals/rubric-coverage.test.mjs`, distinct from
> `RUBRIC_ERROR_CODES` in `lib/evals/rubric-schema.mjs` — the loader's own frozen
> registry, whose contract test asserts membership rather than exhaustiveness of
> the prefix.

## Scenarios

One scenario per rubric at `scenarios/<skill>.md`, following the
invocation-and-simulated-responses shape the compression harness (retired by the
core-lifecycle tier, still in the tree at this tier's landing state) established (a `Test Case`, then responses in order). The working-tree element
is **new to this tier**: those scenarios inlined their project context as prose
and had no tree to run against, which is exactly what the hermetic fixture
replaces. Each scenario states its working directory as **a temp-tree copy of**
`tests/evals/skill-regression/project`, never the committed tree itself, and
never a path outside the copy. Since v1 has no automation, the scenario prose
carries **three** setup steps explicitly — building the copy with
`tests/helpers.mjs::createTempGitRepo()` in its **zero-argument form** — invoked through a thin `scripts/` helper the scenario prose names, because the same disqualifier this spec applies to `assertSafeArgvToken` applies here: no CLI verb wraps `createTempGitRepo` or `cpSync`, the constitution bars `node -e`, and the nearest shell realisation is the `cp -R` into a `TMPDIR`-derived destination this spec bars and a hand-rolled `git init` that loses the zero-argument property. A setup driver is also on the CI-integration intake list, but v1 cannot wait for it (the
fixture spec's mechanism, not `createTempDir()`; the zero-argument call is what
keeps the helper's one interpolated token, `git checkout -b ${branch}`, out of
reach), copying the **contents** of `fixture_root` into that repo's
root with `cpSync(fixtureRoot, copyRoot, { recursive: true, dereference: false, verbatimSymlinks: false })` (a Node built-in, per constitution principle 1 — not a shell
`cp -R`, whose destination is a TMPDIR-derived path this spec elsewhere flags as
operator-controlled) — flat, never into a subdirectory — and writing
`tasks.db_path` into the copy's manifest as the realpathed copy root — validated
with `lib/extensions/governance-values.mjs::assertSafeScalar` first (a
`mkdtempSync` path inherits an operator-controlled `TMPDIR`, and a value
carrying a flow indicator or colon-space reparses into structure), and written as a **text splice**, never a reserialization. The mechanism is a
hand-rolled nested-key splice, not `governance-splice.mjs::spliceRegistryEntries`
— that function locates a top-level *block sequence* and refuses with
`GOVERNANCE_PARSE_REFUSED` when the key is present but not a sequence, and
`tasks.db_path` is a scalar nested under the `tasks:` map. What carries over is
the rationale and the discipline: enumerate the on-disk forms and **refuse**
rather than best-effort on the ambiguous ones — `tasks:` absent, `db_path:`
already present, `tasks:` duplicated, `tasks:` carrying an inline value, split by whether it is empty. Only the exact spelling `tasks: {}` may take the empty-inline rewrite; every other inline form refuses, `tasks: []` included — the module gates on the literal `inline !== '[]'`, not on a category, and rewriting an empty inline *sequence* into a map is a different operation from rewriting an empty inline map. This is a deliberate **widening** of the module's form 2, not literal inheritance: that gate refuses `{}` outright, and the widening is admissible only because an empty flow map is provably carrying nothing to drop. **Any non-empty inline form refuses**: `governance-splice.mjs` gates on `inline !== '[]'` and its refusal message names the case exactly — "a scalar, **a map**, or a non-empty flow sequence at this key is refused rather than silently overwritten". Rewriting `tasks: {backend: json}` as `tasks:` plus a nested `db_path:` would drop `backend: json` on the floor, which is the very pin the surviving-pins token above exists to protect. Separately, appending under *any* inline form is refused because `lib/profiles/yaml.mjs`'s module-private `parseMap` throws `unexpected indentation` on a deeper line following a key with an inline value, so a best-effort append yields an unparseable manifest, `tasks:` present but **not a map** (the
nested-key analogue of the module's form-7 refusal, and the one where a
best-effort append reparses with `db_path` lost or mis-nested), and mixed or
lone-CR line endings, which the module refuses for the same reason, and re-check the leaf with
`assertSafeScalar` at emission so an unsafe value cannot be escaped into safety.
The reason reserialization is barred is the one `governance-splice.mjs` states: the fixture manifest's other pins
(`tasks.backend: json`, `repomap.exclude`) and its comments are ground truth the
rubrics cite. The flat
placement is load-bearing and matches the fixture spec's own model: it makes the
copy root simultaneously the git root (`git rev-parse --show-toplevel`) and the
project root that carries `.context-index/manifest.yaml`. Nest `project/` one
level down and the two diverge — `resolveStorageRoot`'s git-common-dir fallback
then returns the temp root rather than the project root — a directory the
scored project does not own, one level above it — so the board write lands
outside the tree every rubric cites, and the fixture spec's reasoning about
`db_path`'s omission (that the fallback would return the copy root and pass
*vacuously*) stops describing the actual topology.

Writing `tasks.db_path` is the step that is not optional for any board-touching
skill, and the reason is anti-vacuity rather than escape. Under the flat model
the copy is its own git root, so omitting `db_path` lets `resolveStorageRoot`'s
git-common-dir fallback return the copy root and the containment check pass
while proving nothing about the resolver's *configured* path — bounded, but
unproven. Property 1 below establishes the same point from the other side: cwd
is never a containment boundary, so the copy step alone does not bound the
board, and an operator following the steps verbatim must not drive `sync`,
`issues`, `learn` or `prototype` against committed ground truth.
`createTempGitRepo` also writes a `README.md` and an initial commit at that
root, which under the flat model now sits *inside* the scored project — a
harness-authored file, not a fixture one, so no detector rubric may assert over
root-level files the fixture did not ship.

`artifact:<path>` values stay relative to `fixture_root` and resolve against the
copy's root. Lint-time containment (`RUBRIC_SOURCE_PATH_ESCAPE`) is checked
against the *committed* `fixture_root` and does not transfer to a mutated copy:
a run that creates a symlink or redirects `docs/` makes an `artifact:` value
resolve outside the copy while the lint check still passes, and the fixture's
"no symlinks" property covers the committed tree only. Read-time resolution is
therefore re-contained under `lenientRealpath(copyRoot)` with `isContained`,
realpathed on both sides, after the run.

A scenario is not optional garnish. A rubric names what to check; the scenario
names the run that produces the thing being checked. A rubric whose `scenario`
key points at a missing file is rejected by the conformance check, because it
would otherwise score whatever output happened to be lying around.

### Who executes a scenario — and who does not, yet

**Nothing in this spec executes a scenario, and `npm run test:evals` does not
discover one.** `scripts/run-tests.mjs` collects only `*.test.mjs`, and this
tier ships none under `tests/evals/` — its single test is deliberately in
`tests/lib/evals/`. Naming `npm run test:evals` as this tier's trigger would be
a claim that fails the moment anyone checks.

The chain has a second break at the far end: `adev eval score --input` consumes
a **verdict set**, and `lib/evals/score.mjs` never reads an element's `source`.
Producing a verdict set from a scenario run — resolving each `output:`,
`artifact:` and `skill-regression:` source into a verdict — is work no artifact
in this spec performs.

Both gaps belong to the charter's **"CI integration, tiered eval gates"**
capability, which has no spec. This tier therefore declares a **second
prerequisite** alongside the fixture: until that capability lands, a scenario is
an operator-driven procedure, and the deterministic pass is run by hand. The
acceptance criteria below say so rather than asserting an automated run that
nothing performs. The compression harness set the same precedent — its
`run-eval.mjs` told a human to "Generate them by running each scenario
variant."

`RUBRIC_SCENARIO_MISSING` therefore checks only that a scenario file *exists*
and is contained under `scenarios/`. Reading the file is a separate rule with a
separate code, `RUBRIC_SCENARIO_STEP_MISSING`, and it deliberately reads for
**presence of the required setup tokens, never for meaning**: a scenario that
names every step in the wrong order still passes. That is the honest limit of a
static check over prose, and the spec does not pretend past it — whether the
steps were actually *performed* is the operator's half, verified during the
manual Tier B pass.

The tokens the rule requires, per scenario file:

| Token | Present in | Why it is the load-bearing phrase |
|---|---|---|
| `createTempGitRepo` | every scenario | names the copy mechanism; `createTempDir` alone leaves the copy a non-repo |
| `flat copy of fixture_root contents into <copy-root>` | every scenario | the flat-placement step. It is the third required setup step and was the only one with no token: nest `project/` one level down and git root and project root diverge, the git-common-dir fallback returns the temp root, and containment passes vacuously — the same anti-vacuity failure the `tasks.db_path` token exists to catch |
| `tasks.db_path` | every scenario | the anti-vacuity write; without it containment is satisfied by the git-common-dir fallback |
| `cwd: realpath(<copy-root>)` | every scenario | the cwd pin every project-relative writer depends on. The literal is `cwd: realpath(<copy-root>)` — carrying the realpath, so the token and the criterion say the same thing; a fixed placeholder, not free prose, so the rule and its rejecting input are both writable |
| `isContained under <copy-root>` | every scenario | the per-write containment statement; without a literal it would be the criterion's unbacked half |
| `artifact: sources re-resolved under <copy-root> after the run` | every scenario | the read-time re-containment; lint-time `RUBRIC_SOURCE_PATH_ESCAPE` runs against the committed tree and does not transfer to a mutated copy |
| `outputs/ from its own mkdtempSync, beside <copy-root>, outside every worktree root and outside the copy` | every scenario | pins output location. The literal carries the placement, not the bare directory name: a bare `outputs/` cannot distinguish the temp-tree location from the in-repo one an earlier draft used, so every scenario would pass it trivially |
| `kill <recorded-pid>` | `prototype` only | the teardown the skill's own docs say a prose instruction does not guarantee. Literal, for the same reason as `cwd:` |
| `loopback` | `prototype` only | the bind restriction |
| `copy root matches ^[A-Za-z0-9._/-]+$ before any typed command` | every scenario | v1's execution path is an operator pasting a `mkdtempSync`-derived root — over an operator-controlled `TMPDIR` — into a shell. The predicate is the plain-word branch of `ARGV_TOKEN` (`lib/extensions/governance-values.mjs:92`), written out rather than named as `assertSafeArgvToken`: that function has three `lib/` call sites and no CLI verb wraps it, and the constitution bars `node -e`, so an operator has no sanctioned way to *run* it. A regex an operator can apply by eye is the checkable form of the same contract |
| `teardown deletes only the two mkdtempSync-returned roots` | every scenario | the one command in the pass with unbounded blast radius. at v1 **the operator** types the delete; no artifact calls `cleanupTempDir`. If a later automated caller uses it, its bound is `maxRetries: 3, retryDelay: 100` for macOS `ENOTEMPTY` (`tests/helpers.mjs::cleanupTempDir`), and exhausting that throws — so without a row it is the only step with neither half. Both roots are the values `mkdtempSync` returned, never a composed path, and each passes the copy-root predicate above before being pasted |
| `ADEV_NO_INFRA=1 in the step's own env` | `build` and `work` scenarios only | the orchestrator window. Those two chain `specify` → `plan` → `implement` → `validate` inside one scenario, so a spec written mid-scenario and the `adev preflight run` that consumes it both sit between the before- and after-checks of the `no infra_requirements:` predicate. For them the env form is the primary cover and needs a file half of its own. `skills/build/SKILL.md:516` sets the variable for its `implement` and `validate` invocations; `write-test` and `debug` inherit it from `implement`'s subagent dispatches; `eval` and `recover` sit outside the `build` pipeline entirely; a `work`-driven chain relies on the sub-skills inheriting it from the environment rather than on `work` setting it, which `skills/work/SKILL.md` does not. Per-invocation `env`, never a shell export, since `exec-consent.mjs` holds consent per-install and never persisted |
| `recorded PID and bound port each match ^[0-9]+$ before any typed command` | `prototype` only | the numeric analogue of the copy-root predicate, and needed for the same reason: at v1 the operator types `kill <recorded-pid>` with a value read out of a skill transcript — text this spec's own Tier B criterion classifies as agent-authored. "Validated as integers before use" is owned by the CI-integration capability and survives no v1 paste; an eye-checkable literal does |
| `no listener on <port> after teardown` | `prototype` only | the post-teardown assertion. Without a token the criterion would take the baseline-fidelity exemption without declaring it, and a scenario omitting the check would stay green while the operator never performs it |
| `scored tier: non-functional` | `prototype` only | the scored-tier clause; without a token the Gates criterion names a host that cannot fire for it |
| `tasks.backend: json survives the splice, and the manifest's comments survive it` | every scenario | the other half of the round-trip pin. `tasks.backend: json` is the pin the fixture spec actually commits for the *copy's* manifest; `repomap.exclude` is pinned only for the repository-root manifest, where a `tests/evals/skill-regression/**` value would be inert inside a flat copy anyway, so it is deliberately not part of this check. The spec bars reserialization *because* that pin and the manifest comments are ground truth the rubrics cite, and a mis-anchored line range that clobbers `backend: json` leaves the copy on a different issue backend while every rubric citing it scores something other than what it names. The operator re-parses the copy's manifest for the pins and checks the comments on **text**, since `parseYaml` discards them — which is exactly what a text splice makes checkable |
| `db_path read back as <copy-root>` | every scenario | the splice's round-trip pin. `governance-splice.mjs` pins its own splice against `parseYaml` by round-trip test; the hand-rolled nested-key variant inherits the rationale but not the pin, and `resolveStorageRoot` reads `manifest?.tasks?.db_path` with optional chaining — a leaf emitted at the wrong indent reads back `undefined` and falls through to the git-common-dir branch, which under the flat model returns the copy root and makes containment pass vacuously |
| `no infra_requirements: in the copy` | every scenario | the preflight exec door, asserted on the copy before and after each scenario |
| `no .claude/ or .mcp.json anywhere under <copy-root>` | every scenario | the agent-runtime door, asserted before and after each scenario rather than once at the source. Scoped to the copy root at any depth, not to a `project/` prefix: the copy is flat, so the copy root *is* the project root the agent runtime resolves |
| `git status and rev-parse HEAD equality at every worktree root` | every scenario | the write-escape capture, both probes in one literal so neither half is the criterion's unbacked one. Its rejecting input is landed **here**, not by the core tier: required in all eleven of this tier's scenarios, the branch is exercisable at this tier's landing state. This tier needs it as much as the core one — it is the first that drives the skills, and `sync` rewrites `CLAUDE.md`, `issues` writes the board, `prototype` writes the gitignored `.adev/`. Scoped to every scenario, not to core-lifecycle only |

All three of the door and capture rows are scoped to **every** scenario, not to core-lifecycle only — and their branches are therefore exercisable at this tier's landing state, so their rejecting inputs land here. An earlier draft deferred all three to the core tier because no `core_lifecycle` scenario existed yet; widening the rows dissolved that ground for these three, and a deferred-but-exercisable branch is one that can be dropped from the checker without going red. **One** row is scoped by slug to `build` and `work`, two scenarios this tier does not author — the `ADEV_NO_INFRA` env row. Its rejecting input lands **here** all the same, against a synthetic `build`-shaped scenario fixture — `rubric-coverage.test.mjs` takes its rubric and scenario roots as parameters defaulting to the two real ones, the same pattern the fixture spec adopts for its citation scan and for the same reason: several rejecting cases cannot be built otherwise. The invariant that stops this oscillating is simple: **every rejecting input lands with the spec that owns the table**. Deferring it to the tier that authors the scenarios would ship the branch dead — no input at this tier's landing state can match or violate it — which is the same can-be-dropped-without-going-red failure the per-row obligation exists to prevent. Property 3 argues that the `.claude/` / `.mcp.json` door matters most in *this* tier, because it is the first to set the scenario working directory to the project root — scoping its own token to the other tier would leave that argument with nothing behind it. The fixture's Hermeticity Rules bound the *committed* tree, i.e. the copy at t=0; property 2 deliberately excludes the run copy from the capture roots; and this tier's runs mutate the copy. An after-run door check therefore has no other host.

`RUBRIC_SCENARIO_STEP_MISSING` is the one rule in the set that reads markdown rather than YAML. It is the weakest rule in the set and is stated as such —
but a scenario that never mentions `tasks.db_path` is a scenario whose operator
cannot perform the step, and that failure is worth catching statically.

## Running a Scenario Safely

Six properties bound a scenario run. The **first three are inherited** from the
fixture spec rather than restated as new mechanism, and are named here because
this tier is the first to *drive* the skills. The **last three are new to this
tier** and say so where they appear: property 4 states the board mechanism is not
transferable to the other writers, property 5 covers the `prototype` server this
tier is the first to start, and property 6 hands a union-consent requirement to
the CI-integration capability rather than granting anything itself.

1. **Working directory is not containment.** `/adev:issues`, `/adev:reconcile`
   and `/adev:status` resolve their board through
   `lib/issues/resolve-root.mjs::resolveStorageRoot`, which consults
   `tasks.db_path`, then the main root of the cwd's git tree — the derivation
   `lib/worktree.mjs::resolveMainRoot` names — returning cwd only if git fails. cwd selects *which git tree the
   probe answers for*; it is never a containment boundary. `db_path` is a
   storage **root** directory, not a board file, and the harness writes it into
   the temp copy's manifest as the realpathed copy root — the fixture commits no
   literal, since `resolveStorageRoot` returns the value verbatim and a
   committed relative path would resolve against whatever cwd the process had.
2. **The committed fixture is input, not a workspace.** Runs execute against a
   temp-tree copy, and the fixture spec's assertion is inherited **in full**:
   `git status --porcelain --ignored=traditional --untracked-files=all` captured before and after the run
   and required byte-identical — an equality, not an emptiness check, since the
   ignored baseline is never empty — taken at **every root `git worktree list
   --porcelain` prints**, never at a hardcoded pair, with that command anchored
   at the real repository (`-C resolveMainRoot(startCwd)`) and run **before any
   chdir into the copy**, since `git worktree list` answers for the repository
   containing its cwd and would otherwise print the copy alone, with `git rev-parse HEAD`
   unchanged at each. Two roots are the weaker form the fixture spec rejects:
   `git status` never descends into a nested git repository, so every sibling
   worktree under `.claude/worktrees/` is invisible from the main root. The run
   copy is deliberately **not** among the capture roots — it is a git tree, and
   every skill this tier drives writes into it by design, so a byte-identical
   status there is unsatisfiable rather than strict. Where a single root is
   named instead — property 1's board resolution — it comes from
   `lib/worktree.mjs::resolveMainRoot`, which is exactly that `git rev-parse`
   derivation, rather than a second spelling of it. All three refinements matter more here than anywhere, because this
   is the first tier that drives the skills: `sync` rewrites `CLAUDE.md` and
   `AGENTS.md`, `issues` writes `.context-index/tasks/tasks.json` (the fixture pins `tasks.backend: json`), `learn` writes
   `.context-index/memory/heuristics/`, and `prototype` writes `.adev/` — the
   last of which is **gitignored**, so a plain status would report clean while
   the escape stood. Restating this in a weaker form than the fixture spec
   guarantees would silently narrow the predicate the whole run model rests on.
3. **Nothing fixture-authored is spawned.** `lib/deploy.mjs` spawns
   `step.command` for `shell` (`:308`), `verify` (`:392`), `gate` (`:444`) and
   `ci-trigger` (`:495` is the shared `execFileAsync` closure, reached from `:505` for `step.command` and `:524` for `step.poll_command`); only
   `executeManual` (`:353`) runs nothing. The fixture spec's Hermeticity Rules close every one of these
   crossings, and this tier inherits them **by reference, without a count** —
   the set has grown twice already, and an enumeration here would drift. The
   ones this tier leans on hardest: `deploy.yaml` restricted to
   **`manual` steps only** and carrying no `rollback:` field; no `scripts` key in
   `project/package.json`; no `command:`, `poll_command:` or `runner:` anywhere under
   `project/.context-index/governance/`, and neither `gates.yaml` nor
   `diagnostics.yaml` there; and no
   Quality Gates command block in the fixture constitution; no `project/lib/`;
   no `infra_requirements:` frontmatter key in any fixture markdown, which
   `adev preflight run` would otherwise hand to `executeProbe`'s `execFileSync`
   with no consent gate; and no `project/.claude/` or `project/.mcp.json`. The
   last matters most in *this* tier, because it is the first to set the scenario
   working directory to the project root — which is exactly where the agent
   runtime looks for a `hooks` block or an MCP server, outside the fail-closed
   `exec-consent.mjs` contract every other door is closed against. (An earlier
   draft named a `quality_gates` manifest key — a key this repository reads
   nowhere.) The `deploy` rubric is consequently
   scored on the `--dry-run` transcript rather than on a live pipeline.

4. **`tasks.db_path` bounds the board, and only the board.** It is the right
   mechanism for `issues`, whose storage resolves through
   `lib/issues/resolve-root.mjs::resolveStorageRoot`. It does nothing for the
   other three writers this tier drives, whose write roots are *project-relative*
   and therefore resolve against whatever the scenario's working directory is:
   `sync` rewrites `CLAUDE.md` / `AGENTS.md`, `learn` writes
   `.context-index/memory/heuristics/`, and `prototype` writes
   `.adev/prototype/<module>/`. For those three the copy root **is** the
   resolution base, so the scenario must set cwd to the copy and the run asserts
   afterwards that each wrote inside it — the board mechanism is not
   transferable and borrowing it would leave three of four writers unbounded.

5. **The `prototype` scenario starts a server, and must stop it.**
   `adev prototype start-server` binds a loopback port and its functional tier
   pulls CDN imports — network egress a `git status` cannot observe. The
   `prototype` scenario is therefore scored at the wireframe or mockup tier, not
   the functional one, binds loopback only, and carries an explicit teardown
   step; `skills/prototype/SKILL.md` requires the server always be stopped, and
   with no automation in v1 the scenario prose is the only thing that can carry
   that requirement.

6. **Consent is not this spec's to grant.** v1 has no automated gate, because
   v1 has no automated runner: the bound is a human typing each invocation. The
   fail-closed union-consent requirement — non-interactive callers refused
   without an explicit flag, collected once across **both tiers' 23 skills**
   rather than per tier or per skill, never persisted to `manifest.yaml`,
   mirroring `lib/extensions/exec-consent.mjs` — is handed to the
   CI-integration capability as a named prerequisite, alongside the two
   discovery breaks recorded under "Who executes a scenario".

`artifact:<path>` sources are resolved under `fixture_root` with the same
treatment the fixture spec uses, in that order — `resolveContained` for the lexical pre-check, then `isContained(lenientRealpath(x), lenientRealpath(base))` for the verdict, with `lenientRealpath(copyRoot)` as the base at **both** steps. `loadRubric` sequences it exactly this way and says why: real-path the root first, because comparing a real path against a non-real root would reject every contained path as unsafe — and on macOS the `mkdtempSync` copy root is reached through `/var` → `/private/var`, so handing the raw root to the lexical step fails closed on every candidate — the same one the fixture
spec's `CATALOG_PATH_ESCAPE` uses, and `scenario` values are contained under
`scenarios/` the same way — an escaping path that happens to exist must not
report as "present".

### Where run output lands

Scenario runs write into an `outputs/` directory created by its own per-run
`mkdtempSync`, **beside the run copy in the
temp tree** — never inside this repository, and needing no `.gitignore` entry. Per-run rather than a fixed name: `createTempGitRepo` resolves to `mkdtempSync(join(tmpdir(), "adev-test-"))`, so a fixed-name sibling would sit directly in the shared, predictable `tmpdir()` and survive across runs, outside any `cleanupTempDir` reach. Both temp roots are removed together at teardown — at v1 by the operator, on the two `mkdtempSync`-returned paths themselves, never a composed path, the same discipline `applyExecPayload` keeps by containment-asserting every path it writes (`lib/extensions/exec-payload.mjs:434`) — its own `rmSync` targets a composed path and is non-recursive, so the parallel is the assertion, not the path shape. A teardown that still fails after its retries **reports the leaked roots and fails the pass**, rather than leaving them unmentioned: a stranded temp tree is the state the next run's baseline would otherwise absorb.

An earlier draft put it at `tests/evals/skill-regression/outputs/` and gitignored
it, following the compression harness's pattern. That is wrong under the
inherited assertion: `--ignored=traditional --untracked-files=all` reports ignored paths, so a gitignored
output directory inside the repository would make every run non-hermetic by its
own gate. Output belongs where the run belongs — outside the asserted tree.

Its sole v1 consumer is the operator performing the manual Tier B pass and
recording the results; `artifact:` sources never resolve into `outputs/`, only
under `fixture_root`.

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `.context-index/evals/tier-b-<YYYY-MM-DD>-<NN>.md` | repo | this spec — **new**, the manual Tier B pass record. This tier's pass is the first to write one, so the naming, collision and discovery convention lands here; the core-lifecycle tier inherits it |
| `tests/evals/skill-regression/tiers.yaml` | repo | this spec |
| `tests/evals/skill-regression/rubrics/<skill>.yaml` × 11 | repo | this spec |
| `tests/evals/skill-regression/scenarios/<skill>.md` × 11 | repo | this spec |
| `tests/lib/evals/rubric-coverage.test.mjs` | repo | this spec (eval CI Tier A coverage + conformance) |

Eleven skills, so 22 authored rubric/scenario files plus the manifest and the
test: 24 files, plus the Tier B pass record this tier is the first to write (row one above).

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
- **`npm run test:evals`** — *prospective, not current.* It discovers nothing
  for this tier and will not until the charter's CI-integration capability ships
  a driver under `tests/evals/skill-regression/`. Listed so the eventual wiring
  is legible; the Gates criteria pin its present emptiness.
- **The core-lifecycle tier spec** — references the shared contract above
  rather than restating it. If the contract changes, it changes here.

## Conformance Rules

Beyond every rule `loadRubric` already enforces, the coverage test rejects:

| Rule | Rejected when | Failure it prevents |
|---|---|---|
| `RUBRIC_TIER_UNCOVERED` | a slug in a bucket named by `tiers.yaml`'s **`landed:`** list has no `rubrics/<slug>.yaml`. `landed:` is a comma-joined scalar of bucket keys, and a tier adds its own key to it in the same change that adds its rubrics — so this tier ships `landed: "change_imminent"`, the core tier amends it to `"change_imminent,core_lifecycle"`, and v2's remaining tier appends its own. `uncovered` is never listed | a bucket that reports complete while a skill sits unguarded. Deliberately bucket-agnostic: a rule scoped to one bucket would leave the core-lifecycle tier's twelve rubrics unchecked, which is the exact failure this rule names |
| `RUBRIC_TIER_ORPHAN` | a `rubrics/*.yaml` names a slug in no tier | a rubric nobody's coverage claim accounts for |
| `RUBRIC_LANDED_INVALID` | a token in `landed:` names no declared bucket key, **or** names `uncovered` — two disjoint branches, each with its own rejecting input | a typo (`core_lifecycl`) silently making `RUBRIC_TIER_UNCOVERED` vacuous, or `uncovered` being listed and firing the rule on a skill deliberately outside every tier. "`uncovered` is never listed" needs a predicate, not prose |
| `RUBRIC_TIER_INCOMPLETE` | the four `tiers.yaml` buckets do not partition `ls skills/` exactly | a skill added later that silently belongs to no tier |
| `RUBRIC_ID_MISMATCH` | `rubric_id` is not `skill-regression-<filename stem>`, or `skill` is not the stem | a rubric scoring one skill under another's name |
| `RUBRIC_SCENARIO_MISSING` | the `scenario` key names no file under `scenarios/` | a rubric scoring whatever output is at hand |
| `RUBRIC_SCENARIO_STEP_MISSING` | a scenario file omits one of its required setup tokens (see the table under "Who executes a scenario") | a scenario the operator cannot execute, and criteria that therefore verify nothing |
| `RUBRIC_SOURCE_PATH_ESCAPE` | an `artifact:` source, or a `scenario` value, resolves outside its base (`fixture_root` and `scenarios/` respectively) | a rubric reaching out of the fixture by reference. Decided **before** existence, and realpath-contained on both sides, mirroring `CATALOG_PATH_ESCAPE` — an escaping path that happens to exist must not report as "present" |
| `RUBRIC_EXCEPTION_ID_MALFORMED` | either issue-id key — `baseline_exception_issue` here, or the `spec_behaviour_gap_issue` the core-lifecycle tier writes — is present and fails `^[a-z][a-z0-9-]*-[0-9a-z]+$`. The rule lives in the shared contract, so the sibling cannot widen it without restating | a bare digit or `true` reparsing as a non-string, and a key written for a reader that never reads it |
| `RUBRIC_ELEMENT_FLOOR` | fewer than 5 `required_elements`, or `quality_dimensions` outside 3–6 | a judge-only rubric stranded in nightly Tier C |
| `RUBRIC_TWIN_UNCITED` | a rubric cites `skill-regression:PV-nn` without also citing its `KC` twin | sensitivity measured with no specificity control |

> **Why `landed:` and not "any populated bucket".** "Populated" has two readings and
> both break. Read as *has slugs*, `remaining`'s seven slugs fire the rule today,
> a year before that tier is authored. Read as *has rubric files*, the rule is
> vacuous for any bucket with none — which is every bucket at the moment its own
> tier lands, so it would never fire on the case it exists for. An explicit
> `landed:` list makes the scope a declared fact rather than an inference, and
> makes the interim state decidable: when **this tier lands alone**, `landed:` is
> `"change_imminent"`, so the twelve unrubriced `core_lifecycle` slugs and the
> seven `remaining` slugs are correctly out of scope and `npm test` is green.


Unresolved catalog citations are **not** a rule of this tier. The fixture spec's
`CATALOG_UNRESOLVED_CITATION` already scans `rubrics/*.yaml` from the catalog
side and is the single emitted code; minting a `RUBRIC_CITATION_UNRESOLVED`
alias here would give one check two spellings, which is the drift ADR-0019
documents for validator ids. This tier's rubrics are inside that scan's root, so
the guarantee holds without a rule here.

One coupling is **convention in this tier and a predicate once the core tier
lands**: a rubric's `skill` appearing in a cited entry's `covers_skills`. The
core-lifecycle spec promotes it to `RUBRIC_COVERS_SKILLS_UNLISTED`, unscoped, in
the same `rubric-coverage.test.mjs` this spec authors — so from that point it
gates all 23 rubrics, this tier's included. No change-imminent rubric would fail
it today: all six class citations — three from `codehealth`, two from `repomap`, one from `document` — already sit inside their seeded `covers_skills`.
Stated here so the two specs do not read as contradicting each other.

The three reference-anchoring requirements above remain review-time convention,
with no predicate.

## Migration of the Three Existing Rubrics

`tests/evals/skill-compression/rubrics/{brainstorm,plan,specify}.yaml` predate
the unified schema: they score `quality_dimensions` on a 1–5 scale with
`weight` fields, and their `required_elements` carry `match_pattern` instead of
`source` + `met_when`. `lib/evals/rubric.mjs` already rejects them — but **not**
with `RUBRIC_LEGACY_SCALE`, which never fires for these three files. Each
declares a top-level `scoring:` map, so `assertNoNestedMaps` throws
`RUBRIC_NESTED_MAP` first; each also omits ten of the twelve
`REQUIRED_TOP_LEVEL_KEYS`, so `RUBRIC_MISSING_KEY` would fire second even if
`scoring:` were flattened. The legacy-weight pass is unreachable, and
`tests/lib/evals/rubric-legacy-scale.test.mjs` asserts exactly that.

All three name skills in the **core-lifecycle** tier, not this one, so their
migration belongs to that spec. It is named here only to record that this tier
does not touch them and does not inherit their shape. The exemplar is
`skills/eval/default-rubric.yaml`, which conforms to the unified schema and
matches every point budget and policy this contract fixes — though not to the
skill-regression contract itself: its `rubric_id` is `adev-eval-default` and it
declares no `skill` or `scenario`. Those three keys come from the table above.

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
| `tiers.yaml` and the coverage test | Author the manifest and `tests/lib/evals/rubric-coverage.test.mjs` with all eleven conformance rules, each proven by a rejecting input | large |
| Detector rubrics + scenarios (3) | `codehealth`, `repomap`, `document` — the three that cite catalog ids and need both twins | large |
| Producer rubrics + scenarios (7) | `deploy`, `sync`, `learn`, `issues`, `eval`, `assess`, `prototype` | large |
| Responder rubric + scenario (1) | `using-adev` | small |
| Contract cross-reference | Confirm the core-lifecycle spec references this spec's shared contract rather than copying it | small |

## Acceptance Criteria

**Artifact shape**

- [ ] `tiers.yaml` exists, parses under `parseYaml`, and carries exactly **five** top-level keys — the four buckets plus `landed:` — and no `tiers_version`. Every **bucket** token — a skill slug — matches `^[a-z][a-z0-9-]*$`. `landed:`'s tokens are *bucket keys*, not slugs, and carry underscores (`change_imminent`), so that pattern does not apply to them: their only predicate is `RUBRIC_LANDED_INVALID`'s — each must name a declared bucket key other than `uncovered`, and the four buckets partition `ls skills/` exactly — every directory in exactly one bucket, no slug naming a directory that does not exist.
- [ ] All 11 `rubrics/<skill>.yaml` and all 11 `scenarios/<skill>.md` exist, one per slug in `change_imminent`.
- [ ] Every rubric loads through `lib/evals/rubric.mjs::loadRubric` without error.
- [ ] Every rubric satisfies the shared contract table: `rubric_id`, `layer`, `skill`, `scenario`, the point budgets, both policies, and the threshold.
- [ ] Every rubric declares at least 5 `required_elements` and between 3 and 6 `quality_dimensions`.
- [ ] No rubric value is a nested map or a list inside a list item.

**Baseline fidelity**

- [ ] Every element and criterion describes the skill **as it behaves today**. Verified by **the rubric author, once at authoring time** — no artifact in this tier can run a scenario — by running each rubric's scenario against the current skill and confirming the deterministic half scores full marks; a `not_met` here means the rubric described an intended future, not a baseline. It resolves in **one pass**, never by re-running: either the rubric text is corrected to today's behaviour, or — where today's behaviour is plainly wrong — the author records `met` anyway and files the defect, pinning its id in `baseline_exception_issue`. Both exits are stated here rather than only in the tier rationale, so a reader meeting the `not_met` case has the exit in front of them.
- [ ] Any behaviour a rubric author judged wrong but recorded as `met` is filed as a separate issue, and the rubric records that issue id in a `baseline_exception_issue` key matching `^[a-z][a-z0-9-]*-[0-9a-z]+$`, validated by `RUBRIC_EXCEPTION_ID_MALFORMED`. **Shape is the only guarantee at v1**: nothing resolves the id against the issue board, so a rubric can name a closed or nonexistent issue and stay green. A YAML comment would not do: `parseYaml` discards comments, so no check could read one back — and a key nothing reads is no better, which is why the rule exists rather than the convention.

**Detector coverage**

- [ ] Each of the three detector rubrics cites at least one `skill-regression:PV-nn` and its `KC` twin.
- [ ] Every cited catalog id resolves in `catalog.yaml`, via the fixture spec's `CATALOG_UNRESOLVED_CITATION` scan — this tier mints no alias for that code.
- [ ] `RUBRIC_SOURCE_PATH_ESCAPE` fires for an `artifact:` source outside `fixture_root` and for a `scenario` value outside `scenarios/`, both realpath-contained with escape decided before existence — proven by a traversal path that does not exist on disk, which must report escape rather than absence.
- [ ] No producer or responder rubric **in this tier** cites a catalog id — **review-time convention, enforced by no code**, stated as such because `RUBRIC_TWIN_UNCITED` fires only on a `PV` without its `KC` and would pass a producer rubric citing both. The core-lifecycle tier states explicitly that its own `Kind` column is descriptive and does not carry this restriction.

**Coverage check**

- [ ] `tests/lib/evals/rubric-coverage.test.mjs` is in the default bucket (`node scripts/run-tests.mjs --list` lists it).
- [ ] Each of the eleven conformance rules is proven by a deliberately broken input, and `RUBRIC_SCENARIO_STEP_MISSING` is proven **per token branch**, not once for the rule — one rejecting input per row of the token table — stated that way rather than as a number, so the obligation cannot drift out of sync as rows are added; a rule-level proof lets any single token check be dropped without going red. `RUBRIC_LANDED_INVALID` and `RUBRIC_EXCEPTION_ID_MALFORMED` already carry per-branch obligations; this makes the third such rule explicit. Both door rows read *every scenario*, so their rejecting inputs are exercisable — and landed — **here**, by the same argument that pulled the capture row's in. The core tier lands none; the `ADEV_NO_INFRA` row's input is landed here against a synthetic `build`-shaped scenario fixture, since a branch whose only real inputs live in another tier would otherwise ship dead; each is proven by its own rejecting input asserting the named code, not only by the eleven good rubrics passing. A rule with no rejecting case is a rule that can stop running without going red.
- [ ] `RUBRIC_TIER_UNCOVERED` fires for a missing rubric in any bucket named by `landed:`, and does not fire for a bucket absent from it.
- [ ] **At this tier's landing state** — `landed: "change_imminent"`, eleven rubrics present, `core_lifecycle` and `remaining` unrubriced — the rule does not fire and `npm test` is green. Pinned explicitly, because this is the state the repository is actually in when this spec lands and no other criterion covers it.
- [ ] Each scenario file states where its `outputs/` directory lives — beside the run copy in the temp tree, so `isContained(lenientRealpath(outputsDir), lenientRealpath(root))` is false for **every root `git worktree list --porcelain` prints and for the run copy** — the copy is deliberately not among those roots, so without naming it the token would assert something the criterion does not check, decided on realpathed values before existence, the same treatment `RUBRIC_SOURCE_PATH_ESCAPE` gets. The *mention* is machine-checked by `rubric-coverage.test.mjs` — token presence, never meaning; the containment itself is verified by the operator during the Tier B pass, since v1 ships no runner (see "Who executes a scenario").
- [ ] `RUBRIC_EXCEPTION_ID_MALFORMED` fires on a malformed value in **either** key — `baseline_exception_issue` and `spec_behaviour_gap_issue` — each proven by its own rejecting input, so neither branch can stop matching without going red.
- [ ] Adding a new directory under `skills/` fails `RUBRIC_TIER_INCOMPLETE` until it is placed in a bucket.

**Gates**

> **What checks these, at v1.** This tier ships four artifacts — `tiers.yaml`,
> eleven rubrics, eleven scenarios, and `tests/lib/evals/rubric-coverage.test.mjs`
> — and the last is a static conformance test over rubric and tier files. It has
> no run copy, no cwd and no server, so it cannot perform a runtime assertion.
> Every criterion in this section **and in every other acceptance-criteria
> section of this spec** that describes one is therefore split in two — with one
> stated exception, baseline fidelity, whose text half is absent by design: a
> rubric author verifying a baseline at authoring time leaves nothing in the
> scenario file to check. Otherwise: the
> **scenario file must state the step**, which `rubric-coverage.test.mjs` checks
> as a text-level conformance rule over the required phrases, and the **runtime
> assertion is performed by the operator** during the manual Tier B pass. The
> automated forms are handed to the charter's CI-integration capability as a
> named prerequisite, alongside the two discovery breaks already recorded there.
> Stating a code-shaped assertion here without an artifact to run it would let
> this tier land with every criterion green and none of these checks ever
> executed — which is the same "measures nothing" failure the fixture spec is
> built to prevent, arriving through the acceptance criteria instead of the
> catalog.

- [ ] `npm test` passes.
- [ ] The eval CI Tier B deterministic pass is run by hand per "Who executes a scenario", and its results recorded in `.context-index/evals/tier-b-<date>-<NN>.md` — the same history the CI-integration capability inherits, not a second unnamed sink. The naming, collision and discovery convention — every same-day report suffixed from `-01`, an existence pre-check plus `{flag: 'wx'}` refusing a collision. **The refusal is terminal, not a retry**: at v1 the operator performs the existence pre-check and picks the next free ordinal by eye, so there is no scan to bound — the `{flag: 'wx'}` half binds the CI-integration writer that inherits the convention, not the human; an automated writer inheriting this must increment at most to `-99` and then fail the write loudly rather than searching without limit, and that bound travels on the intake list beside the port probe's, for the same reason — an operator-simple behaviour needs a stop condition before an unattended runner inherits it, readers globbing `tier-b-*.md` in name order. The convention deliberately diverges from the repo's other dated report, `.context-index/reports/codehealth-<YYYY-MM-DD>.md`, which same-day-overwrites: that file is a regenerable snapshot, this one is accumulated history two named readers consume, so overwriting would destroy the thing it exists for — **lands with this tier**, since this tier's pass is the first to write one; the core-lifecycle tier inherits it rather than defining it. Three properties of the write matter because `.context-index/evals/` is git-tracked, not ignored, so the report is a **committed** artifact: it is written strictly *after* the final status comparison, or the new untracked file at the main root would break property 2's byte-identical capture — the same argument that put `outputs/` outside the repository, applied to the one output that stays inside it; it is committed rather than left untracked; and any interpolated path is reduced to a placeholder or passed through `assertSafeScalar` before transcription, and any **skill-transcript span** is summarised rather than pasted — never transcribed verbatim. `assertSafeScalar` is a YAML-reparse guard and would be a category error on markdown prose, so the span needs its own treatment rather than inheriting the path's, since a `TMPDIR`-derived path and a skill transcript span are both operator- or agent-authored text. Read back by the next pass's operator. No criterion asserts that `npm run test:evals` discovers this tier — it does not, until the CI-integration capability lands.
- [ ] `node scripts/run-tests.mjs --evals --list` lists nothing under `tests/evals/skill-regression/`; the absence is expected and pinned so it is not mistaken for a broken harness.
- [ ] The operator confirms, at teardown, that only the two `mkdtempSync`-returned roots were removed and no composed path — the runtime half of the teardown token, and the one step in the pass with unbounded blast radius.
- [ ] The operator applies the `^[A-Za-z0-9._/-]+$` predicate to the copy root **by eye before pasting it** into any typed command — the runtime half of that token, and the whole reason the regex is written out rather than named as a function no operator can run.
- [ ] The operator half of the **two door predicates** is performed during the Tier B pass: before and after each of this tier's eleven scenarios, confirm no `infra_requirements:` key in any markdown under the copy and no `.claude/` or `.mcp.json` anywhere under the copy root, halting the pass on a trip. A halt writes **no** Tier B record, and the copy is retained for out-of-band inspection — read by path, never re-entered as a cwd under an agent runtime, since a loaded hooks block or MCP server is exactly what tripped the predicate; once the finding is recorded the offending `.claude/` or `.mcp.json` is neutralised or the copy discarded, the neutralisation containment-asserted with `isContained(lenientRealpath(hit), lenientRealpath(copyDir))` and the scan not following symlinks; a failed capture comparison is the same shape, with the mismatch reported to the operator console rather than into the record. The rule lands here beside the record convention this tier owns, so the operator running the first pass is not left with an unconditional write obligation and no rule suspending it; the core tier references it. Both rows are scoped to every scenario and the after-run check has no other host — the fixture's rules bind the committed tree, and property 2 excludes the run copy from the capture roots — so without this criterion the file half stands and the assertion can be skipped with every criterion green.
- [ ] The operator half of the two splice tokens is performed during the Tier B pass: after the `tasks.db_path` write, re-`parseYaml` the copy's manifest and confirm the value is a **string** equal to the realpathed copy root, that `tasks.backend: json` survived, and — on the file's text, since `parseYaml` discards them — that its comments survived. Without this criterion the round-trip pin has a token and no operator obligation, and the splice can be skipped in the pass with every criterion green.
- [ ] The `issues` scenario — the only board-touching skill in this tier; `reconcile` and `status` are v2 and `implement` is core-lifecycle, and both inherit this as a contract — is where the operator confirms `isContained(lenientRealpath(resolveStorageRoot(...)), lenientRealpath(copyDir))` holds during the Tier B pass.
- [ ] **Every** scenario file in this tier states the before/after `git status` and `git rev-parse HEAD` equality at every root `git worktree list --porcelain` prints — the file half checked by `RUBRIC_SCENARIO_STEP_MISSING`, whose literal covers both probes, the capture and comparison performed by the operator during the Tier B pass. Property 2 calls this capture the one that "matters more here than anywhere"; routing its only reader to the sibling tier would leave it with neither half in the tier that first drives the skills.
- [ ] **Every** scenario file in this tier states that cwd is the realpathed copy root, that each written path must be `isContained` under it, and that each `artifact:` source is re-resolved and `isContained` under `lenientRealpath(copyRoot)` **after** the run — lint-time containment is against the committed `fixture_root` and does not transfer to a mutated copy. The core-lifecycle tier inherits this criterion as a contract for all twelve of its skills — every one of them a project-relative writer — rather than restating it — the statement checked by `rubric-coverage.test.mjs`, the containment confirmed by the operator. Stated universally rather than as a list: beyond `sync`, `learn` and `prototype`, this tier also drives `repomap` (writes `.context-index/hygiene/`), `codehealth` (creates *and overwrites* `.context-index/reports/codehealth-<date>.md`), `document` (rewrites `docs/architecture.md` under the fixture-shipped `docs/`), and `prototype`'s own `ensure-gitignore`, which splices a managed block into `<cwd>/.gitignore`. All resolve from `process.cwd()`, and `tasks.db_path` bounds none of them.
- [ ] The `prototype` scenario file states all of: a non-functional scored tier, a loopback-only bind, the backgrounded server's PID recorded, and no listener on the bound port after teardown — **four** file-half clauses, each with its own literal — `scored tier: non-functional`, `loopback`, `kill <recorded-pid>` (which carries the recorded-PID requirement), and `no listener on <port> after teardown` — checked by `RUBRIC_SCENARIO_STEP_MISSING`. The recorded PID is read by the teardown step, which kills that process rather than trusting the session to end, and the file states that after teardown no listener remains on the bound port — **and what happens when that is false**, which the spec elsewhere names as a live case (`close()` is not callable from a one-shot CLI, so a teardown step alone can pass review while a listener survives): the scenario **fails and is reported**, not retried and not escalated silently — a before/after check the operator performs, not a prose instruction the scenario merely gestures at. The argv discipline that probe must follow when it is automated — `execFileSync` argv array, PID and port validated as integers before use, matching what `exec-payload.mjs` enforces with `GOVERNANCE_COMMAND_NOT_ARGV`, and likewise for **every** git probe *this spec's harness* runs — `status`, `rev-parse`, and the `worktree list` this revision adds — each an `execFileSync` call with `-C` and the root as separate argv elements, never concatenated. By reference rather than by enumeration, for the reason property 3 gives about door counts: this list has already grown once. `createTempGitRepo` is outside that scope and stays so — it is pre-existing `execSync` shell strings, including a `&&` compound, safe here only because no caller-supplied value crosses them in the zero-argument form — is recorded here but **owned by the CI-integration capability**, since this tier ships no artifact in which an argv form could be written or checked. One part of it is not deferrable, because v1's execution path is an operator typing these probes into a shell with a copy root derived from `mkdtempSync` over an operator-controlled `TMPDIR`: each scenario states that the scenario states the literal `copy root matches ^[A-Za-z0-9._/-]+$ before any typed command` — the plain-word branch of `ARGV_TOKEN`, the predicate `lib/extensions/governance-values.mjs::assertSafeArgvToken` applies, written out because no CLI verb exposes that function — before the root is pasted into **any** typed command — the enumeration is deliberately open, since the point is the paste, not the verb — and the statement carries its own token. `lib/cli/prototype.mjs` records that `startServer`'s `close()` is not callable from a one-shot CLI, so a teardown step alone can pass review while a listener survives.
- [ ] No constitutional violations introduced.

## What the CI-integration capability inherits

Eleven obligations are handed to the charter's "CI integration, tiered eval gates"
capability, each named at its own site above and collected here so the receiving
spec has one intake point rather than the paragraphs above to reconstruct:

1. **A scenario driver** — nothing in this tier executes a scenario; the Tier B
   deterministic pass is run by hand.
2. **Verdict-set production and a source resolver** — `lib/evals/score.mjs`
   never reads an element's `source`, so `output:` has no machine reader at v1.
3. **`RUBRIC_SOURCE_FORM_UNKNOWN`** — the rule that would reject a typo'd source
   prefix, deferred to land with the resolver that gives `output:` a reader.
4. **Fail-closed union consent** across both tiers' 23 skills — non-interactive
   callers refused without an explicit flag, collected once, never persisted to
   `manifest.yaml`, mirroring `exec-consent.mjs`.
5. **The Tier B report history** — `.context-index/evals/tier-b-*.md`,
   whose accumulated verdicts the automated pass inherits when it replaces the
   manual one, and whose halt-on-tripped-predicate discipline has no static
   backing at v1.
6. **The Tier C enablement gate** — Tier C is wired into no scheduled or CI
   trigger until the charter's budget-threshold capability lands. The core tier
   states this as an acceptance criterion, but the wiring belongs to this
   capability, and this tier contributes 36 of the 86 nightly dispatches with
   the identical exposure.
7. **A bounded teardown for the `prototype` port probe** — the automated form
   inherits the post-teardown check, so it must also inherit a failure branch: a
   stated wait bound after the kill and the behaviour when it elapses. At v1 the
   operator simply fails the scenario; an unattended runner needs the bound.
8. **Issue-id resolution** — `baseline_exception_issue` and `spec_behaviour_gap_issue`
   are shape-validated only; nothing resolves either id against the board, so a
   rubric may cite a closed or nonexistent issue and stay green.
9. **A Tier B enablement gate** — the Tier B sweep is wired to no automated or
   scheduled trigger until this capability supplies the automated halt. The core
   tier states it as an acceptance criterion, but the wiring belongs here, and
   this tier's eleven scenarios carry the identical exposure.
10. **The successor-name bound** for the Tier B report — the `-99` ceiling and
   fail-loud behaviour an automated writer needs in place of the operator who
   picks the next free ordinal by eye at v1.
11. **The argv discipline** for the automated forms — the `prototype` port probe
   and every git probe (`status`, `rev-parse`, `worktree list`), `execFileSync`
   argv arrays with `-C` and `shell: false`.

## Open Questions

- **`bugfix-loop` earns a rubric or an explicit exclusion at v2.** `skills/`
  holds 31 directories; the charter (revision 6) now records that count and the
  `uncovered` bucket, so the partition check has a charter-level counterpart.
  What remains open is only whether the skill eventually earns a rubric.
  Historical note: the charter's tiering originally covered 30. `bugfix-loop` is a self-re-invoking wrapper over
  `/adev:debug --auto` rather than a lifecycle step, which is presumably why it
  was never counted — but "presumably" is not a tier. `tiers.yaml` records it
  in an explicit `uncovered` bucket so the partition check can pass without
  pretending the skill does not exist. Whether it earns a rubric, or is
  formally declared out of scope in the charter, needs an answer before the v2
  remaining tier claims full coverage. It blocks neither v1 tier.
