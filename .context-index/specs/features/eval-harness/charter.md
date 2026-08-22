---
status: approved
kind: feature
revision: 6
updated: 2026-08-21
---

# Feature Charter: eval-harness

## Business Intent

adev scores work in two places with two incompatible implementations of one idea: `/adev:eval` Layer 3 scores a user's implementation of a spec, and `tests/evals/` scores adev's own skills. Both declare `required_elements` and `quality_dimensions`, but with different value shapes and different verdict semantics — and neither can report what a run cost.

eval-harness owns one rubric contract, one scoring engine consumed by both, the run-cost record that prices a quality change, the fixtures those rubrics assert against, and the rubric set that gives every adev skill a regression baseline — so that a quality regression in any of the 30 lifecycle skills is detectable by running a command, and priced when it is.

## Scope and Boundaries

### In Scope

- Unified rubric schema — top-level keys, the flat-YAML constraint, and the verdict enum (`met` / `not_met` / `unknown` / `not_applicable`)
- Rubric loader and validator, rejecting nested maps, missing keys, and invalid verdict values at load time
- Scoring engine — verdict tallying, denominator exclusion, the insufficient-evidence guard, and attainable-maximum reporting
- `adev eval score` CLI verb wrapping the engine, so both consumers call one implementation
- Run-cost record derived from session JSONL — wall-clock duration, the four-way token split, cost, turn counts, and subagent rollup, joined to the verdict table
- Budget thresholds expressed as flat rubric keys that resolve to failing verdicts, evaluated over a sample set using median plus spread
- Baseline provenance and percent-regression comparison
- A hermetic fixture project with planted ground truth at `tests/evals/skill-regression/` — known violations that must be caught, and known-clean artifacts that must not be flagged. The directory is new and unowned; it is deliberately not one of the domain-paired directories `eval-projects` covers
- A rubric per skill for the 30 lifecycle skills, conforming to the unified schema. `skills/` holds 31 directories; `bugfix-loop` is a self-re-invoking wrapper over `/adev:debug --auto` rather than a lifecycle step, and is recorded in an explicit `uncovered` bucket so a coverage check can partition the tree exactly rather than silently omitting it. Whether it earns a rubric is deferred to v2
- Retirement of the three existing skill-compression rubrics and their 4x3 variant matrix, replaced by skill-regression rubrics scored against the hermetic fixture
- Tiered CI integration for the eval suite
- Disclosure fidelity — an observed read trace as a deterministic `required_elements` source, so a rubric can assert which companion files a skill actually opened, plus pointer reachability and relocation fidelity as static checks

### Out of Scope

- The five `adev-*-eval` git submodules and the four domain project repos they point at — owned by the `eval-projects` charter. This charter's fixtures are in-repo and hermetic; it never adds a submodule, a Docker dependency, or a network fetch
- Spawning and driving `claude` CLI sessions — `tests/evals/token-optimization/run-ab-eval.mjs` retains that responsibility; this charter consumes the records it produces
- The product-side cost ticker in `lib/cost-summary.mjs` and `lib/cli/cost.mjs` — owned by the Token Cost and Measurement epic
- Repomap parser accuracy measurement — owned by the `repomap-eval` charter
- Whether `/adev:eval` survives as a distinct skill or merges into `validate --score` — a skill-surface decision outside this charter. The shared engine is written so either outcome leaves it intact
- Rubric content for the domain-specific eval projects — owned by `eval-projects`
- **`eval-projects`' deferred "Eval Harness Implementation" capability** — that entry covers scenarios and rubrics scoring adev skills against the four domain project repos, and depends on all v1 project capabilities. Despite the name collision with this charter, it is a different capability and **remains open and unaddressed here**. This charter scores adev's skills against in-repo hermetic fixtures; that one scores them against the domain repos. Neither fulfils the other
- Domain scenario and rubric content under the `tests/evals/` directories paired with the domain repos (`data-engineering`, `data-pipeline`, `data-migration`, `process-automation`, `web-api`) — owned by `eval-projects`. This charter owns the schema those files conform to and the engine that scores them, not their content

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `lib/token-pricing.mjs` | internal module | Per-model token pricing used to convert usage into cost |
| Session JSONL under `~/.claude/projects/` | external service | Source of real token and duration data. Treated as untrusted input |
| `.context-index/platform-context.yaml` | internal module | `model_tiers` supplies the judge tier for judged criteria |
| `skills/eval` | internal module | Consumer of the shared schema and scoring engine via the CLI verb |
| `tests/evals/skill-compression` | internal module | The 4x3 compression matrix and its three legacy rubrics are **retired** by the core-lifecycle tier: its drivers regex-match on `match_pattern`, a field the unified schema does not carry, so repointing them would score every input green. Its `token-budget-eval/` suites are unrelated to the matrix and are **relocated, not deleted** |
| `tests/evals/token-optimization` | internal module | Supplies the session-JSONL collector this charter generalises |
| `eval-projects` | internal module | Owns the domain submodule fixtures this charter must not duplicate |
| `hooks/session-capture.sh` | internal module | Registered on `PostToolUse`; appends `{tool, files, timestamp}` to `.context-index/.session-tracking.jsonl`, including calls made by dispatched subagents. The ReadTrace source of record |
| `skill-body-progressive-disclosure` | internal module | Created the 189 companion files whose conditional loading disclosure fidelity exists to verify. **Pending, not landed:** its `lib/evals/read-trace.mjs` and `tests/evals/skill-disclosure/` exist only on the unmerged branch `chore/skills/progressive-disclosure` (commit `8368d8b6`) and are absent at `HEAD`. On merge, `read-trace.mjs` sits in this charter's module directory and `tests/evals/skill-disclosure/` stays where it is — the Naming attribute below fixes `tests/evals/skill-regression/` as the home for *this* charter's own fixtures, not as a claim over every eval directory the charter reads |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| Rubric | A versioned scoring contract for one skill or one implementation review | `rubric_id`, `version`, `layer`, `verdict_values`, `required_element_points`, `judged_criterion_points`, `unknown_policy`, `not_applicable_policy`, `insufficient_evidence_threshold_percent`, `budget_max_*` |
| RequiredElement | A deterministic check decided without a judge | `id`, `source`, `met_when`, `not_applicable_when` |
| QualityCriterion | A judged check, one reference-anchored yes/no question | `id`, `criterion`, `reference`, `met_when`, `not_met_when`, `unknown_when` |
| Verdict | The resolution of one element or criterion | `value`, `evidence` (one sentence citing `file:line`) |
| Fixture | A hermetic project tree with planted ground truth | `path`, `planted_violations`, `known_clean`, `scaffolding_manifest` |
| RunRecord | The measured cost of one scored run | `duration_ms`, `input`, `output`, `cache_creation`, `cache_read`, `cost`, `total_turns`, `tool_turns`, `subagent_rollup`, `model_id`, `plugin_version`, `pricing_table` |
| Budget | Cost and time thresholds evaluated over a sample set | `budget_max_turns`, `budget_max_duration_ms`, `budget_max_cost_usd`, `sample_count` |
| Baseline | A stored RunRecord and score for regression comparison | `rubric_id`, `rubric_version`, `run_record`, `score`, `recorded_at`, `model_id`, `plugin_version`. `rubric_version` is stored, not derived: without it a loaded baseline cannot answer whether the candidate was scored against the same rubric revision |
| ScoredRun | One side of a comparison, assembled from parts no single existing function returns together | `rubric_id`, `rubric_version`, `score`, `run_record`, `trace_drift`. `lib/evals/score.mjs::scoreRubric` returns `{verdicts, deterministic, judged, total}` and carries no rubric identity or provenance, so a comparison takes this composite rather than a bare score |
| ReadTrace | The set of files an agent actually opened during one scored run, observed rather than self-reported | `session_id`, `entries` (tool, absolute path, timestamp), `captured_at`, `pointer_set_digest` (the skill pointer structure this trace was captured against) |
| ScoreComparison | The result of comparing two scored runs. Its outcome is a closed set, so a spec author never has to reconstruct it from prose | `deterministic_delta`, `judged_delta`, `outcome` (`regression` / `judge-attributable` / `no-regression` / `incomparable` / `TRACE_FIXTURE_STALE`, plus `indistinguishable` once sampling lands at v2), `findings` (every problem detected, including any not selected as the outcome), `baseline_verdicts` and `candidate_verdicts` (both sides' verdict tables, so the numeric-aggregate invariant holds for comparisons as it does for scores) |

### Relationships

- A Rubric owns many RequiredElements and many QualityCriteria; each resolves to exactly one Verdict per run
- A Rubric declares at most one Budget; a Budget is evaluated against a set of RunRecords, never a single one
- A Fixture is asserted against by many Rubrics; one enriched Fixture unlocks checks across several skills
- A Baseline pairs one Rubric with one RunRecord and the score that RunRecord accompanied
- A RunRecord is produced by the session-JSONL collector and joined to the verdict table by the scoring engine

### Invariants

- A rubric file containing a nested map is rejected at load with a named error, never silently loaded as an empty structure
- A Verdict whose value is `met` or `not_met` and whose `evidence` is empty is rejected by the scorer. Absence of evidence can only be expressed as `unknown`, so a judge that returns `not_met` without citing evidence fails the run rather than scoring it
- `unknown` is excluded from judged-criterion denominators; `not_applicable` is excluded from deterministic-element denominators
- A RequiredElement never resolves to `unknown`; a QualityCriterion never resolves to `not_applicable`
- A numeric aggregate is never reported without its verdict table
- `buildJudgeContext(criterion)` emits exactly one criterion, and its output contains no other criterion's identifier, no other criterion's verdict, and no running total — so single-criterion isolation is a property of the context builder rather than of prose the judge is trusted to follow
- A budget verdict requires at least three samples and is computed on the median, never on a single run or a mean
- A score comparison reports the deterministic and judged halves of the delta separately, and never reports a regression attributable to judged movement alone. When the deterministic elements resolve identically on both sides and only judged verdicts moved, the comparison returns `judge-attributable`, not `regression`. This is decidable from one run per side and requires no sampling. Judged verdicts come from a model and are the least stable input in the loop: the same audit pass, given byte-identical instructions and identical inputs, has been measured producing three findings on one run and one on the next. Cost is a comparatively stable function of the work, so applying a sampling rule to budgets while scoring a single judged run inverts the protection
- No spread is claimed or reported while judged-verdict sampling remains deferred: a single judged run per side supplies no variance to measure. Once sampling lands (v2), a comparison additionally reports its spread across samples and returns `indistinguishable` when the delta sits inside it
- A ReadTrace is observed from the tool-call record, never self-reported by the agent under test. An agent asked what it read reports what it was asked about
- A committed trace fixture records the pointer set it was captured against. When a skill's current pointer set no longer matches that record, the comparison returns `TRACE_FIXTURE_STALE` — naming the fixture and the drifted pointers — rather than passing or reporting a failure. Failing open would let disclosure fidelity stop working while every gate stayed green, which is the exact failure it exists to catch; failing closed would block correct changes to a skill's companion structure. Staleness is its own verdict, as `incomparable` is for baselines
- A fresh Tier C capture never auto-replaces a committed trace fixture. Promotion is a curated step, because a capture taken from a run that already stopped following a pointer would otherwise install the regression as the new expectation
- Every RunRecord names the model id and plugin version that produced it
- A baseline comparison across differing model ids or pricing tables reports `incomparable`, never a regression
- Every fixture assertion has a negative twin: a planted violation that must be caught and a known-clean artifact that must not be flagged
- Fixtures resolve without network access, submodules, or container runtimes

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Unified rubric schema | One rubric contract serving both consumers: key set, flat-YAML rule, verdict enum, point budgets, budget keys | must-have | v1 | validated |
| Rubric loader and validator | Parse and validate a rubric, failing loudly on nested maps, missing keys, and invalid verdicts | must-have | v1 | validated |
| Scoring engine and `adev eval score` | Verdict tallying, denominator exclusion, insufficient-evidence guard, attainable-maximum reporting, exposed as a CLI verb | must-have | v1 | validated |
| Hermetic fixture project and planted ground-truth catalog | An in-repo fixture tree carrying the scaffolding skills read, with a catalog of planted violations and known-clean artifacts | must-have | v1 | implementing |
| Run-cost record | Generalise the session-JSONL collector so every scored run emits duration, token split, cost, turns, and subagent rollup | must-have | v1 | — |
| Budget thresholds as failing verdicts | Flat budget keys resolving to verdicts, with median-plus-spread over a sample set so the gate does not flap | must-have | v1 | — |
| Rubric set, change-imminent tier | Rubrics for the 11 skills queued for demotion, merge, or deletion: codehealth, repomap, document, deploy, sync, learn, issues, eval, assess, using-adev, prototype | must-have | v1 | specified |
| Rubric set, core lifecycle tier | Rubrics for the 12 highest-blast-radius skills: work, brainstorm, specify, review-specs, plan, route, implement, write-test, validate, debug, build, hygiene | must-have | v1 | specified |
| CI integration, tiered eval gates | Tier A schema, coverage, pointer-reachability and relocation-fidelity checks on every PR; Tier B deterministic scoring and read-trace comparison against committed trace fixtures on skill changes; Tier C judged and cost runs, and fresh trace capture, nightly and pre-release | must-have | v1 | — |
| Disclosure fidelity | An observed read trace as a deterministic element source, so a rubric can assert that a skill opened the companion files its conditional-loading pointers name — distinguishing a followed pointer from a plausible guess that happens to score well. This charter *compares* traces; it never spawns the session that produces one. Capture is performed by the existing `session-capture.sh` hook during a dispatch someone else drives, and Tier A/B assert against committed trace fixtures so they stay hermetic | must-have | v1 | — |
| Baseline provenance and percent-regression | Store per-rubric baselines with model and version provenance; compare by percent regression rather than absolute ceiling | should-have | v1 | specified |
| Rubric set, remaining tier | Rubrics for the 7 remaining skills: init, reconcile, recover, research, retro, sample, status | should-have | v2 | — |

Capability ordering is deliberate. The fixture project precedes every rubric tier because it is their hard prerequisite. The change-imminent tier precedes the core tier despite carrying less blast radius, because a rubric authored after a skill is compressed measures the compressed skill against itself.

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Handoff-contract assertions | A different contract — downstream parser conformance rather than rubric scoring | v2 | Hermetic fixture project |
| Reuse the collector for `lib/cost-summary.mjs` | The product-side cost surface is owned by the Token Cost and Measurement epic | v2 | Run-cost record |
| Judge-panel disagreement reporting | Requires *different* judges scoring one criterion, which the one-judge-per-criterion invariant forbids by design. This deferral does NOT rule out repeated sampling: dispatching the same criterion N times is not a panel, because `buildJudgeContext`'s isolation property is per-dispatch and each of the N dispatches satisfies it independently | v2 | Scoring engine and `adev eval score` |
| Judged-verdict sampling (N dispatches, median or majority) | The spread-reporting invariant above is the cheaper protection and lands first; sampling multiplies the cost of the already-expensive Tier C. Revisit if reported spread proves too wide to be actionable | v2 | Baseline provenance and percent-regression |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev eval score --rubric <path> --input <path> [--json]` | CLI verb | Score an input against a rubric, returning the verdict table and aggregate |
| `loadRubric(path)` | function | Parse and validate a rubric file, throwing named errors on schema violations |
| `scoreRubric(rubric, verdicts)` | function | Aggregate verdicts into a score with attainable maximum |
| `collectRunRecord(sessionPath)` | function | Build a RunRecord from a session JSONL file, including subagent rollup. Takes a path so tests can pass synthetic fixture JSONL |
| `buildJudgeContext(criterion)` | function | Assemble the single-criterion context handed to one judge dispatch, carrying no other criterion and no running total |
| `snapshot()` / `since(marker)` / `compareToBaseline(observed, baseline)` | function | Capture and diff the observed read set for one scored run, so a `required_elements` entry can name it as a `source`. Names match `lib/evals/read-trace.mjs` as implemented on the pending branch above (not yet at `HEAD`); the earlier `snapshotReadTrace` / `readTraceSince` / `compareReadTrace` spelling in this table was aspirational and never implemented |
| `buildScoredRun({rubric, score, runRecord, traceDrift})` | function | Assemble a ScoredRun and refuse a malformed one before any arithmetic reaches it. Pure; no I/O |
| `recordBaseline(scoredRun, opts)` / `loadBaseline(rubricId, opts)` | function | Write and read a per-rubric Baseline. `opts.recordedAt` is caller-injected, never read from a clock inside the library; `opts.projectRoot` is required, so the containment base is never an implicit `process.cwd()` |
| `compareScores(baseline, candidate)` | function | Produce a ScoreComparison. Named to avoid colliding with `read-trace.mjs`'s `compareToBaseline`, which compares traces rather than scores |
| `adev eval baseline record` / `adev eval baseline show` / `adev eval compare` | CLI verb | Wrap the three functions above |
| Unified rubric schema | file contract | The YAML shape every rubric in the repository conforms to |
| `npm run test:evals` | command | Existing opt-in eval bucket, extended to cover the new harness |
| Rubric conformance and coverage test | test | Default-bucket test asserting every skill has a conforming rubric |

### Consumed APIs

| Interface | Source Module | Description |
|-----------|-------------|-------------|
| `computeCost(usage, model)` | `lib/token-pricing.mjs` | Convert token usage into a cost figure |
| `model_tiers` | `.context-index/platform-context.yaml` | Resolve the judge tier for judged criteria |
| Session JSONL records | Claude Code session store | Real token and duration measurements |

## Quality Attributes

| Attribute | Requirement |
|-----------|-------------|
| Performance | Scoring is pure computation with no network access and must run inside the existing `npm test` time budget. Tier A CI checks add no measurable wall-clock to a PR |
| Determinism | The same rubric and the same verdicts produce a byte-identical score. No clock reads and no randomness anywhere in the scoring path |
| Correctness | Denominator exclusion, the insufficient-evidence guard, empty-evidence rejection, and single-criterion isolation in `buildJudgeContext` are each covered by unit tests using verdict sets that exercise every enum value |
| Security | Rubric, fixture and baseline paths are validated against traversal, following the `UNSAFE_RUBRIC_PATH` / `UNSAFE_SCORE_PATH` precedent in `lib/evals/` (itself modelled on `UNSAFE_TEMPLATE_PATH`). Any identifier interpolated into a path — a `rubric_id` becoming a baseline filename, a catalog slug becoming a directory segment — is refused against a fixed pattern *before* the join, then contained after it. Session JSONL is untrusted input: parsed defensively, never evaluated |
| Observability | Every score reports its attainable maximum alongside the total. Every budget verdict reports its sample count and spread. Every score comparison reports its deterministic and judged deltas separately and names `judge-attributable` movement explicitly rather than folding it into a single number. Any capped or skipped coverage is logged rather than silently omitted |
| Portability | Fixtures resolve with no network, no submodules, and no container runtime, so Tier A and Tier B run on a clean CI checkout. Any Tier A or Tier B test of `collectRunRecord` reads synthetic fixture JSONL committed to the repository, never a real `~/.claude/projects/` session directory, which does not exist on a CI runner |
| Naming | This charter's code lives in `lib/evals/` and its fixtures and evals in `tests/evals/skill-regression/`. Sibling directories differing by one character (`lib/eval/` beside `lib/evals/`) are prohibited: adopted work is moved into the established directories rather than landing beside them. `lib/evals/` is the established name, having shipped with a validated spec behind it |
| Vocabulary | The eval CI tiers (A, B, C) are distinct from the repository's three existing tier vocabularies — `gates.yaml` (fast, integration, e2e), `diagnostics.yaml` (1, 2, 3), and `graduated-rigor-tiers.spec.md` (full, quick). Specs authored under this charter must name which vocabulary they mean |
| Dependencies | Zero new external dependencies, per constitution principle 1. Rubrics stay flat-YAML so the repository's minimal parsers read them correctly |
