# Cross-Provider Rollup

## Provider Totals

| Provider | Known Total Tokens | Unknown Runs | Failed Runs | Incomplete Runs |
|---|---:|---:|---:|---:|
| claude-code | 0 | 3 | 0 | 3 |
| codex | 0 | 1 | 0 | 3 |
| opencode | 0 | 3 | 0 | 3 |

## Scenario: Happy Path

| Provider | Model | Status | Reason | Total Tokens | Retry Overhead | Fan-Out Overhead | Unknown Events |
|---|---|---|---|---:|---:|---:|---:|
| codex | unknown | incomplete | provider_timeout | 0 | 0 | 0 | 0 |
| claude-code | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |
| opencode | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |

## Scenario: Review Fails Once

| Provider | Model | Status | Reason | Total Tokens | Retry Overhead | Fan-Out Overhead | Unknown Events |
|---|---|---|---|---:|---:|---:|---:|
| codex | unknown | incomplete | provider_timeout | 0 | 0 | 0 | 0 |
| claude-code | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |
| opencode | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |

## Scenario: Subagent Heavy Review

| Provider | Model | Status | Reason | Total Tokens | Retry Overhead | Fan-Out Overhead | Unknown Events |
|---|---|---|---|---:|---:|---:|---:|
| claude-code | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |
| codex | unknown | incomplete | awaiting_feature_brainstorm_input | unknown | 0 | 0 | 1 |
| opencode | unknown | incomplete | provider_runner_not_configured | unknown | 0 | 0 | 1 |

## Incomplete And Failed Runs

- claude-code / happy-path: incomplete (provider_runner_not_configured)
- claude-code / review-fails-once: incomplete (provider_runner_not_configured)
- claude-code / subagent-heavy-review: incomplete (provider_runner_not_configured)
- codex / happy-path: incomplete (provider_timeout)
- codex / review-fails-once: incomplete (provider_timeout)
- codex / subagent-heavy-review: incomplete (awaiting_feature_brainstorm_input)
- opencode / happy-path: incomplete (provider_runner_not_configured)
- opencode / review-fails-once: incomplete (provider_runner_not_configured)
- opencode / subagent-heavy-review: incomplete (provider_runner_not_configured)

## Integration Findings

- claude-code produced 3 incomplete run(s).
- claude-code reported unknown token fields in 3 run(s).
- codex produced 3 incomplete run(s).
- codex reported unknown token fields in 1 run(s).
- opencode produced 3 incomplete run(s).
- opencode reported unknown token fields in 3 run(s).
