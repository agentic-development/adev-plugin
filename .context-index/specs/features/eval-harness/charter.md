---
status: draft
kind: feature
revision: 1
updated: 2026-08-19
---

# Feature Charter: eval-harness

## Business Intent

adev scores work in two places with two incompatible implementations of one idea: `/adev:eval` Layer 3 scores a user's implementation of a spec, and `tests/evals/` scores adev's own skills. Both declare `required_elements` and `quality_dimensions`, but with different value shapes and different verdict semantics — and neither can report what a run cost.

eval-harness owns one rubric contract, one scoring engine consumed by both, the run-cost record that prices a quality change, the fixtures those rubrics assert against, and the rubric set that gives every adev skill a regression baseline — so that a quality regression in any of the 30 skills is detectable by running a command, and priced when it is.

## Scope and Boundaries

### In Scope

- Unified rubric schema — top-level keys, the flat-YAML constraint, and the verdict enum (`met` / `not_met` / `unknown` / `not_applicable`)
- Rubric loader and validator, rejecting nested maps, missing keys, and invalid verdict values at load time
- Scoring engine — verdict tallying, denominator exclusion, the insufficient-evidence guard, and attainable-maximum reporting
- `adev eval score` CLI verb wrapping the engine, so both consumers call one implementation
- Run-cost record derived from session JSONL — wall-clock duration, the four-way token split, cost, turn counts, and subagent rollup, joined to the verdict table
- Budget thresholds expressed as flat rubric keys that resolve to failing verdicts, evaluated over a sample set using median plus spread
- Baseline provenance and percent-regression comparison
- A hermetic fixture project with planted ground truth — known violations that must be caught, and known-clean artifacts that must not be flagged
- A rubric per skill for all 30 skills, conforming to the unified schema
- Migration of the three existing skill-compression rubrics from 1-5 scales to binary verdicts
- Tiered CI integration for the eval suite

### Out of Scope

- The five `adev-*-eval` git submodules and the four domain project repos they point at — owned by the `eval-projects` charter. This charter's fixtures are in-repo and hermetic; it never adds a submodule, a Docker dependency, or a network fetch
- Spawning and driving `claude` CLI sessions — `tests/evals/token-optimization/run-ab-eval.mjs` retains that responsibility; this charter consumes the records it produces
- The product-side cost ticker in `lib/cost-summary.mjs` and `lib/cli/cost.mjs` — owned by the Token Cost and Measurement epic
- Repomap parser accuracy measurement — owned by the `repomap-eval` charter
- Whether `/adev:eval` survives as a distinct skill or merges into `validate --score` — a skill-surface decision outside this charter. The shared engine is written so either outcome leaves it intact
- Rubric content for the domain-specific eval projects — owned by `eval-projects`

### Dependencies

| Dependency | Type | Description |
|-----------|------|-------------|
| `lib/token-pricing.mjs` | internal module | Per-model token pricing used to convert usage into cost |
| Session JSONL under `~/.claude/projects/` | external service | Source of real token and duration data. Treated as untrusted input |
| `.context-index/platform-context.yaml` | internal module | `model_tiers` supplies the judge tier for judged criteria |
| `skills/eval` | internal module | Consumer of the shared schema and scoring engine via the CLI verb |
| `tests/evals/skill-compression` | internal module | Consumer of the shared schema and scoring engine |
| `tests/evals/token-optimization` | internal module | Supplies the session-JSONL collector this charter generalises |
| `eval-projects` | internal module | Owns the domain submodule fixtures this charter must not duplicate |

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
| Baseline | A stored RunRecord and score for regression comparison | `rubric_id`, `run_record`, `score`, `recorded_at`, `model_id`, `plugin_version` |

### Relationships

- A Rubric owns many RequiredElements and many QualityCriteria; each resolves to exactly one Verdict per run
- A Rubric declares at most one Budget; a Budget is evaluated against a set of RunRecords, never a single one
- A Fixture is asserted against by many Rubrics; one enriched Fixture unlocks checks across several skills
- A Baseline pairs one Rubric with one RunRecord and the score that RunRecord accompanied
- A RunRecord is produced by the session-JSONL collector and joined to the verdict table by the scoring engine

### Invariants

- A rubric file containing a nested map is rejected at load with a named error, never silently loaded as an empty structure
- Absence of evidence resolves to `unknown`, never to `not_met`
- `unknown` is excluded from judged-criterion denominators; `not_applicable` is excluded from deterministic-element denominators
- A RequiredElement never resolves to `unknown`; a QualityCriterion never resolves to `not_applicable`
- A numeric aggregate is never reported without its verdict table
- Exactly one criterion is given to each judge dispatch; a judge is never shown another criterion's verdict or the running total
- A budget verdict requires at least three samples and is computed on the median, never on a single run or a mean
- Every RunRecord names the model id and plugin version that produced it
- A baseline comparison across differing model ids or pricing tables reports `incomparable`, never a regression
- Every fixture assertion has a negative twin: a planted violation that must be caught and a known-clean artifact that must not be flagged
- Fixtures resolve without network access, submodules, or container runtimes

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|-----------|-------------|----------|-------|--------|
| Unified rubric schema | One rubric contract serving both consumers: key set, flat-YAML rule, verdict enum, point budgets, budget keys | must-have | v1 | — |
| Rubric loader and validator | Parse and validate a rubric, failing loudly on nested maps, missing keys, and invalid verdicts | must-have | v1 | — |
| Scoring engine and `adev eval score` | Verdict tallying, denominator exclusion, insufficient-evidence guard, attainable-maximum reporting, exposed as a CLI verb | must-have | v1 | — |
| Hermetic fixture project and planted ground-truth catalog | An in-repo fixture tree carrying the scaffolding skills read, with a catalog of planted violations and known-clean artifacts | must-have | v1 | — |
| Run-cost record | Generalise the session-JSONL collector so every scored run emits duration, token split, cost, turns, and subagent rollup | must-have | v1 | — |
| Budget thresholds as failing verdicts | Flat budget keys resolving to verdicts, with median-plus-spread over a sample set so the gate does not flap | must-have | v1 | — |
| Rubric set, change-imminent tier | Rubrics for the 11 skills queued for demotion, merge, or deletion: codehealth, repomap, document, deploy, sync, learn, issues, eval, assess, using-adev, prototype | must-have | v1 | — |
| Rubric set, core lifecycle tier | Rubrics for the 12 highest-blast-radius skills: work, brainstorm, specify, review-specs, plan, route, implement, write-test, validate, debug, build, hygiene | must-have | v1 | — |
| CI integration, tiered eval gates | Tier A schema and coverage checks on every PR; Tier B deterministic scoring on skill changes; Tier C judged and cost runs nightly and pre-release | must-have | v1 | — |
| Baseline provenance and percent-regression | Store per-rubric baselines with model and version provenance; compare by percent regression rather than absolute ceiling | should-have | v1 | — |
| Rubric set, remaining tier | Rubrics for the 7 remaining skills: init, reconcile, recover, research, retro, sample, status | should-have | v2 | — |

Capability ordering is deliberate. The fixture project precedes every rubric tier because it is their hard prerequisite. The change-imminent tier precedes the core tier despite carrying less blast radius, because a rubric authored after a skill is compressed measures the compressed skill against itself.

## Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|-----------|--------|-------------|------------|
| Handoff-contract assertions | A different contract — downstream parser conformance rather than rubric scoring | v2 | Hermetic fixture project |
| Reuse the collector for `lib/cost-summary.mjs` | The product-side cost surface is owned by the Token Cost and Measurement epic | v2 | Run-cost record |
| Judge-panel disagreement reporting | Requires multiple judges per criterion, which the one-judge-per-criterion invariant forbids by design | v2 | Scoring engine and `adev eval score` |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|-----------|------|-------------|
| `adev eval score --rubric <path> --input <path> [--json]` | CLI verb | Score an input against a rubric, returning the verdict table and aggregate |
| `loadRubric(path)` | function | Parse and validate a rubric file, throwing named errors on schema violations |
| `scoreRubric(rubric, verdicts)` | function | Aggregate verdicts into a score with attainable maximum |
| `collectRunRecord(sessionId)` | function | Build a RunRecord from a session JSONL file, including subagent rollup |
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
| Correctness | Denominator exclusion and the insufficient-evidence guard are covered by unit tests using verdict sets that exercise every enum value |
| Security | Rubric and fixture paths are validated against traversal, following the `UNSAFE_TEMPLATE_PATH` precedent. Session JSONL is untrusted input: parsed defensively, never evaluated |
| Observability | Every score reports its attainable maximum alongside the total. Every budget verdict reports its sample count and spread. Any capped or skipped coverage is logged rather than silently omitted |
| Portability | Fixtures resolve with no network, no submodules, and no container runtime, so Tier A and Tier B run on a clean CI checkout |
| Dependencies | Zero new external dependencies, per constitution principle 1. Rubrics stay flat-YAML so the repository's minimal parsers read them correctly |
