# Feature Charter: Token Observability

## Business Intent

The token-observability module measures token usage across end-to-end adev lifecycle scenarios inside the eval harness, with emphasis on workflow complexity rather than isolated skill prompts. It exists to show where token cost compounds across happy paths, rework loops, and subagent-heavy review phases so the team can prioritize optimization work based on real lifecycle cost, not intuition.

It is explicitly observational in v1: it records and reports input, output, and total tokens per phase, per scenario, and per subagent boundary, but does not change skill behavior, enforce budgets, or optimize prompts automatically.

## Scope and Boundaries

### In Scope

- Eval-only lifecycle scenarios that execute adev workflow paths end to end
- Token accounting for each phase, including brainstorm, specify, review-specs, plan, implement, validate, and recover or re-review loops where applicable
- Per-step metrics for input tokens, output tokens, total tokens, scenario id, run id, phase id, attempt number, subagent count, and event ordering
- Multi-subagent attribution for reviewer-heavy phases
- Scenario reports and one rollup summary
- Live provider execution for Claude Code, Codex, and OpenCode within the eval boundary
- Cross-provider comparison of the same lifecycle scenarios for observability purposes only
- Workflow-complexity matrix coverage, including happy path, review or revise or re-review paths, debug or recover paths, fan-out review paths, and validation retry paths
- File-based logging inside the eval boundary

### Out of Scope

- Runtime instrumentation of normal user plugin sessions outside evals
- Automatic prompt optimization or prompt rewriting
- Hard token budgets or failing builds on token cost
- Cross-provider rankings or findings outside the controlled eval scenario matrix
- Cost-in-dollars accounting unless token accounting already makes that trivial
- UI or dashboard service; outputs remain repo artifacts

### Dependencies

| Dependency | Type | Description |
|---|---|---|
| `tests/evals/` | internal eval surface | Existing eval harness and artifact conventions |
| lifecycle skills | internal module surface | Skills whose workflow paths are exercised by scenarios |
| structured token metadata | execution wrapper contract | Token payloads emitted by eval wrappers or runner integrations |
| repomap-style reports | internal reference pattern | Existing eval reporting shape used as a baseline for output structure |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| LifecycleScenario | A named end-to-end workflow exercised by the eval harness | scenario_id, scenario_name, phases, branches, complexity_tags, start_phase_id, terminal_phase_ids, max_total_steps, max_phase_visits, max_subagent_events_per_phase |
| ScenarioRun | One execution of a lifecycle scenario, optionally scoped to one provider in live-eval mode | run_id, scenario_id, started_at, finished_at, status, status_reason, model, provider |
| PhaseRun | One phase within a scenario run | phase_event_id, run_id, phase_id, phase_name, skill_name, attempt, status, parent_phase_event_id |
| SubagentRun | A delegated agent execution within a phase | subagent_event_id, parent_phase_event_id, role, attempt, status |
| TokenUsage | Token accounting attached to a phase run or subagent run | input_tokens, output_tokens, total_tokens, input_availability, output_availability, total_availability, source |
| ScenarioRunReport | Human-readable summary for one scenario run | run_id, scenario_id, phase_totals, loop_costs, fanout_costs, top_drivers |
| RollupReport | Aggregate summary across all lifecycle scenarios for one invocation | scenarioTotals, phaseRankings, retryMultipliers, subagentCostShare, topOptimizationCandidates |
| CrossProviderRollupReport | Aggregate summary comparing the same lifecycle scenarios across providers for one live invocation | invocation_id, comparedScenarioIds, providerTotals, scenarioComparisons, unknownCoverageSummary, integrationFindings |

### Relationships

- One LifecycleScenario has many ScenarioRuns
- One ScenarioRun has many PhaseRuns
- One PhaseRun may have many SubagentRuns
- Each PhaseRun has one token usage record
- Each SubagentRun may have one token usage record
- One LifecycleScenario can produce many ScenarioRunReports across repeated invocations
- RollupReport summarizes many run-scoped scenario reports within one invocation
- CrossProviderRollupReport summarizes many provider-scoped ScenarioRuns within one live invocation

### Invariants

- Every phase recorded in a scenario run must have token usage or an explicit unknown or unavailable marker
- `total_tokens = input_tokens + output_tokens` whenever both components are known
- Subagent token usage must remain attributable to a parent phase
- `subagent_count` for a phase is derived from the number of linked subagent events for that phase within one run
- Retry and re-review loops must be represented as distinct attempts, not overwritten runs
- Reports must preserve the difference between direct phase cost and subagent-attributed cost
- Provider comparison must only compare the same declared scenario ids within one invocation and must not mix different scenario sets
- Scenario ids used in config must be safe kebab-case slugs, and file writes derived from scenario or run ids must be path-contained within the eval artifact root
- Every scenario must define bounded execution limits so cyclic branch graphs cannot produce unbounded runs
- `run_id` must be a filesystem-safe lowercase RFC 4122 UUID string

## Capability Map

| Capability | Description | Priority | Phase |
|---|---|---|---|
| Scenario Registry | Define lifecycle eval scenarios as named workflow paths with complexity tags and ordered phases | must-have | v1 |
| Run Orchestration | Execute lifecycle scenarios through the existing eval harness and persist one run record per execution | must-have | v1 |
| Phase Token Capture | Record input, output, and total tokens for each lifecycle phase | must-have | v1 |
| Subagent Attribution | Attribute reviewer and other delegated-agent token usage back to parent phases | must-have | v1 |
| Retry and Loop Tracking | Represent re-review, debug, recovery, and validation retries as separate attempts with explicit costs | must-have | v1 |
| Scenario Reporting | Generate a human-readable report per scenario run showing total cost and phase breakdown | must-have | v1 |
| Rollup Reporting | Generate an aggregate report ranking scenarios, phases, retries, and fan-out costs | must-have | v1 |
| Complexity Matrix Coverage | Support the full workflow-path scenario matrix selected for v1 | must-have | v1 |
| Raw Event Export | Preserve low-level JSONL or structured event output for later analysis | should-have | v1 |
| Live Provider Execution | Execute the same lifecycle scenario matrix through Claude Code, Codex, and OpenCode wrappers in isolated eval mode | should-have | v1 |
| Cross-Provider Reporting | Compare the same lifecycle scenarios across providers inside one live eval invocation | should-have | v1 |
| Quality Correlation | Compare token cost against eval quality outcomes or pass/fail status | should-have | v2 |
| Budget Alerts | Flag unusually expensive phases or scenarios without enforcing hard gates | should-have | v2 |
| Broader Provider or Model Comparison | Compare token profiles across arbitrary providers or models beyond the fixed live eval matrix | could-have | v2 |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `npm run eval:lifecycle-tokens` | CLI command | Runs the lifecycle scenario matrix and writes raw logs plus reports |
| `tests/evals/lifecycle-tokens/scenarios/*.json` | Config file | Scenario registry entries describing lifecycle paths and branches |
| `tests/evals/lifecycle-tokens/reports/<run-id>.md` | File artifact | Per-scenario-run lifecycle token report |
| `tests/evals/lifecycle-tokens/reports/ROLLUP.md` | File artifact | Aggregate rollup across the full matrix |
| `tests/evals/lifecycle-tokens/reports/CROSS_PROVIDER.md` | File artifact | Cross-provider rollup for one live invocation |
| `tests/evals/lifecycle-tokens/reports/<run-id>.jsonl` | File artifact | Raw token event log for one scenario run |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| lifecycle skill wrappers | eval runner | Execution boundary that returns structured phase and token metadata |
| scenario registry files | scenario-registry | Declares valid lifecycle paths, branches, and complexity tags |
| raw token events | phase-token-capture | Input for scenario and rollup reporting |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Observability | Lifecycle token cost must be diagnosable at phase, retry, and subagent levels |
| Determinism | Given the same scenario definitions and token events, reports should have stable structure and ordering |
| Isolation | All artifacts stay within the eval boundary and must not affect normal plugin execution |
| Attribution Fidelity | Reviewer fan-out and retry loops must remain traceable and not be flattened into one opaque total |
| Graceful Degradation | Missing token metadata must remain explicit rather than silently dropped |
| Scalability | The event and reporting model must handle a growing scenario matrix without redesign |
| Low Overhead | Measurement should not materially distort the workflow it is observing |
| Safety | Scenario ids, run ids, and rendered labels must be validated or escaped before file or Markdown output is produced |
| Schema Clarity | Scenario registry and raw event artifacts use snake_case field names; aggregate in-memory summary objects may use camelCase only if the boundary is documented explicitly in implementation and reports |
