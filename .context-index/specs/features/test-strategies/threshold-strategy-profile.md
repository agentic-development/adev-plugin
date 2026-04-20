---
charter: test-strategies
charter-extension: true
status: review-passed
revision: 1
charter-revision: 2
created: 2026-04-20
updated: 2026-04-20
---

# Live Spec: Threshold Strategy Profile

## Capability

The **threshold** strategy profile drives RED/GREEN test cycles for performance benchmark testing. It validates that a system meets explicit, pre-defined numeric performance thresholds — latency percentiles, error rates, and throughput minimums — before any optimization work begins. Tests fail when a benchmark measurement exceeds a defined threshold; tests pass when all measurements satisfy all thresholds.

This profile is activated when `strategy: threshold` is declared in the test configuration or when the `/adev:write-test` skill detects a benchmark script alongside threshold definitions (k6 options, Gatling assertions, Locust SLAs, etc.).

Permitted tools: k6, Gatling, Locust, Artillery, hyperfine, Lighthouse CI, Go testing.B, JMH.

---

## Behavioral Contract

### Preconditions

- A benchmark framework binary must be present and resolvable on `$PATH`.
- At least one threshold definition must be declared with an explicit numeric value, unit, and metric type before the RED phase begins.
- The target service, URL, or binary must be reachable and returning valid responses (not just TCP-connectable) before measurement starts.
- A warm-up period must complete before threshold measurements are recorded.

### Behaviors

#### 1. RED / GREEN Cycle

- **RED state:** the benchmark tool exits non-zero because at least one performance measurement exceeds a defined threshold (e.g., measured p95 latency is 620ms against a threshold of 500ms). The failure must be attributable to an application performance characteristic — not to service unavailability or benchmark tool misconfiguration.
- **GREEN state:** the benchmark tool exits zero; all threshold checks pass, meaning every measured metric satisfies its defined constraint.
- The cycle is complete only when a targeted performance improvement causes the transition from RED to GREEN without relaxing the threshold definitions.

#### 2. Test Authoring

- Write benchmark scripts with explicit numeric thresholds defined **before** any optimization work begins. Thresholds set after optimization are invalid; they must predict the required performance, not describe current behavior.
- Every threshold definition must include: the metric name, the numeric target, the unit, and the operator (less than, less than or equal to, greater than).
- Benchmark scripts must specify percentile targets (p50, p95, p99) rather than mean-only assertions. Mean latency hides tail behavior.
- Scripts must include both a latency threshold and an error rate threshold. Latency-only thresholds are incomplete; a service may appear fast while silently failing a significant fraction of requests.
- Throughput minimums must be included when the feature under test has a capacity requirement.
- `abortOnFail: true` (or the framework equivalent) must be set so that threshold violations terminate the run immediately rather than accumulating results against a doomed baseline.

#### 3. Gaming Patterns (must be detected and blocked)

| Pattern | Detection Signal |
|---|---|
| Threshold too loose | p95 threshold >= 5s for a user-facing endpoint, or error rate threshold >= 5% |
| Environment mismatch | benchmark running against `localhost` or a single-core CI container for a production latency target |
| Fixed threshold without variance margin | threshold set to exactly the measured baseline with no headroom (e.g., measured 423ms, threshold 423ms) |
| Unrealistic payload | request body is empty `{}` or a minimal stub that does not exercise the code path under test |
| No warm-up | measurements begin at request 0, including JIT compilation or cold-start latency |
| Mean-only assertion | only `avg` or `mean` metric checked; no percentile (p95/p99) assertion present |
| Latency without error rate | threshold block defines latency constraints but no `http_req_failed` or equivalent error rate check |

When a gaming pattern is detected, the hook must emit a `THRESHOLD_GAMING_DETECTED` advisory with the specific pattern name and the offending threshold or script section.

#### 4. Assertion Rules

- Thresholds must be explicit numeric values with units (milliseconds, requests per second, percentage). Relative comparisons ("faster than current" or "below baseline") are not acceptable threshold definitions.
- Every threshold block must assert at minimum: one latency percentile (p95 or p99) AND one error rate metric.
- `abortOnFail: true` or equivalent must be set on every threshold that would indicate a broken service rather than a slow one (e.g., error rate > 1%).
- Thresholds must include a variance margin of at least 10% above the current measured baseline to avoid brittle tests that fail on normal load variation.

#### 5. Seed Data

- Realistic request payloads that exercise the actual code path under test (not minimal stubs). Payloads must be stored in a `fixtures/` or `testdata/` subdirectory alongside the benchmark script.
- Representative concurrency levels: virtual user count and ramp-up curve must match expected production traffic patterns, not a flat 1-VU baseline.
- A documented warm-up period (time or request count) before measurements begin, configured directly in the benchmark script.
- A baseline measurement file (`baseline.json` or equivalent) recording the current measured values at the time thresholds were defined, enabling drift detection.

#### 6. Handoff (inputs the skill must surface)

The `/adev:write-test` skill must surface the following before generating test scaffolding:

| Field | Description |
|---|---|
| `script_paths` | Benchmark script file paths |
| `threshold_definitions` | List of `{ metric, target, unit, operator, abortOnFail }` objects |
| `target_url_or_binary` | Service endpoint URL or binary path under test |
| `concurrency_settings` | Virtual user count, ramp-up duration, test duration |
| `warm_up_config` | Warm-up duration or request count before measurement window opens |
| `baseline_path` | Path to baseline measurement file, if available |
| `framework` | Detected framework name (`k6`, `gatling`, `locust`, `artillery`, etc.) |

#### 7. RED Verification

Before declaring the cycle complete, the hook must verify that:

- The benchmark tool exits non-zero **because** a performance measurement exceeds a threshold — not because the target service is unreachable, returning errors at 100%, or the benchmark tool itself is misconfigured.
- The tool output contains at least one threshold violation message referencing a specific metric name and measured value.
- The service is reachable and returning valid responses (distinguish `THRESHOLD_SERVICE_DOWN` from a genuine threshold failure).
- Improving the implementation (not relaxing the threshold) causes the transition to GREEN.

### Error Cases

| Code | Trigger | Severity | Action |
|---|---|---|---|
| `THRESHOLD_SERVICE_DOWN` | Target URL returns connection refused, timeout, or 5xx on all requests before threshold evaluation | Block | Distinguish from threshold failure; do not report as performance regression |
| `THRESHOLD_NO_FRAMEWORK` | No recognized benchmark tool binary found on `$PATH` | Advisory | List permitted tools; suggest installation path |
| `THRESHOLD_MISSING` | Benchmark script has no threshold block or threshold definitions are absent | Block | Emit: "Define explicit thresholds before running. Thresholds must be set before optimization begins." |
| `THRESHOLD_GAMING_DETECTED` | Gaming pattern detected in threshold definition or script configuration | Advisory | Emit pattern name and offending configuration section; request revision |
| `THRESHOLD_NO_WARMUP` | Script begins measurement at request 0 with no warm-up phase | Advisory | Require warm-up configuration before proceeding to RED phase |
| `THRESHOLD_MEAN_ONLY` | Only mean/avg metric asserted; no percentile threshold present | Block | Require at least one p95 or p99 latency threshold |
| `THRESHOLD_LATENCY_ONLY` | Threshold block defines latency but no error rate metric | Block | Require error rate threshold alongside latency threshold |

---

## Constitution Reference

- **Principle: Tests must be falsifiable.** A threshold set to "below baseline" or updated after optimization is not falsifiable at authoring time; it must be a concrete numeric prediction.
- **Principle: RED must be caused by the subject under test.** A service that is down or returning 100% errors is not in RED state for the threshold strategy; it is in a pre-condition failure state (`THRESHOLD_SERVICE_DOWN`).
- **Principle: Tests must be complete.** Latency-only thresholds that omit error rate are incomplete; a silent error budget violation is indistinguishable from success under latency alone.
- **Principle: Tests must reflect production conditions.** Benchmarks run against underpowered environments with unrealistic payloads and concurrency levels do not produce valid threshold evidence.

---

## Actionable Task Map

| Task | Owner | Depends On |
|---|---|---|
| Detect benchmark framework from `$PATH` and script extension | hook: `pre-tool-use` | — |
| Verify threshold definitions exist before RED phase | hook: `pre-tool-use` | framework detected |
| Verify target service is reachable before measurement | hook: `pre-tool-use` | target URL/binary present |
| Detect gaming patterns in threshold block | hook: `pre-tool-use` | threshold definitions read |
| Verify warm-up phase is configured | hook: `pre-tool-use` | script read |
| Block on `THRESHOLD_MISSING` when no threshold block present | hook: `pre-tool-use` | script parsed |
| Block on `THRESHOLD_MEAN_ONLY` when no percentile threshold | hook: `pre-tool-use` | threshold definitions parsed |
| Block on `THRESHOLD_LATENCY_ONLY` when no error rate threshold | hook: `pre-tool-use` | threshold definitions parsed |
| Distinguish `THRESHOLD_SERVICE_DOWN` from threshold failure | hook: `post-tool-use` | benchmark run complete |
| Confirm transition cause is implementation change not threshold relaxation | hook: `post-tool-use` | GREEN phase complete |
| Surface all seven handoff fields in `/adev:write-test` output | skill: write-test | framework + script present |
| Generate baseline measurement file at RED phase | skill: write-test | first run complete |

---

## Acceptance Criteria

- [ ] Given a k6 script with `p(95) < 500` and `http_req_failed < 0.01` thresholds and an application that responds at p95 800ms, k6 exits non-zero and the hook confirms RED state is a threshold violation (not a service-down condition).
- [ ] Given the same script after an optimization that reduces p95 to 350ms with error rate 0.2%, k6 exits zero and the hook confirms GREEN state without any threshold relaxation.
- [ ] Given a benchmark script with no threshold block, the hook emits `THRESHOLD_MISSING` and blocks before any measurement runs.
- [ ] Given a threshold block with only a mean latency assertion and no percentile, the hook emits `THRESHOLD_MEAN_ONLY` and blocks.
- [ ] Given a threshold block with p95 latency but no error rate metric, the hook emits `THRESHOLD_LATENCY_ONLY` and blocks.
- [ ] Given a target service returning connection refused on all requests, the hook emits `THRESHOLD_SERVICE_DOWN` and does not report a threshold failure.
- [ ] Given a threshold set to p95 < 10s for a user-facing endpoint, the hook emits `THRESHOLD_GAMING_DETECTED` with the "Threshold too loose" pattern name.
- [ ] Given a script with no warm-up configuration, the hook emits `THRESHOLD_NO_WARMUP` as an advisory before the RED phase.
- [ ] Given no recognized benchmark tool on `$PATH`, the hook emits `THRESHOLD_NO_FRAMEWORK` as an advisory.
- [ ] The `/adev:write-test` skill surfaces all seven handoff fields when `strategy: threshold` is active.
- [ ] A baseline measurement file is generated at the end of the first RED phase run and stored alongside the benchmark script.
- [ ] Seed fixtures include realistic request payloads stored under `fixtures/` with documented concurrency and warm-up settings.
