---
strategy_id: threshold
red_exit_condition: "Benchmark exits non-zero because performance does not meet the defined threshold — p95 latency exceeds target, error rate above limit, or throughput below minimum"
green_exit_condition: "All thresholds met — benchmark tool exits zero, p95/p99 latency within target, error rate within limit, throughput above minimum"
gaming_blockers:
  - "Thresholds set too loose — p95 >= 5s or error rate >= 5% will almost always pass"
  - "Testing on underpowered environments that don't reflect production — localhost or single-core CI runner"
  - "Fixed thresholds without variance margin — using exact baseline as threshold"
  - "Unrealistic payloads — empty request bodies or trivially small data"
  - "No warm-up period — cold-start measurements skewing results"
  - "Mean-only assertions without percentile targets — mean hides tail latency"
  - "Latency thresholds without error rate — fast responses that are mostly errors"
assertion_rules: "Thresholds must be explicit numeric values with units. Must specify percentile type (p50, p95, p99). Must include both latency AND error rate thresholds. Set abortOnFail: true to fail fast on threshold breach."
seed_data_rule: "Realistic request payloads matching production traffic patterns. Representative concurrency levels. Warm-up period before measurement begins. Stable test environment documented."
handoff_format: "Benchmark script paths + threshold definitions (metric + target + operator) + target URL or service + concurrency/duration settings + warm-up config + baseline measurement path + framework name"
permitted_tools:
  - "k6"
  - "Gatling"
  - "Locust"
  - "Artillery"
  - "hyperfine"
  - "Lighthouse CI"
  - "Go testing.B"
  - "JMH"
  - "wrk"
  - "ab"
---

# Threshold Strategy Profile

Performance benchmark testing profile. Verifies system meets explicit latency, throughput, and error rate thresholds under realistic load.
