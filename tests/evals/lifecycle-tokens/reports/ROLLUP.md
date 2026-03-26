# Lifecycle Token Rollup

## Scenario Rankings

| Scenario | Status | Total Tokens | Retry Overhead | Fan-Out Overhead |
|---|---|---:|---:|---:|
| subagent-heavy-review | passed | 195 | 0 | 43 |
| review-fails-once | passed | 180 | 36 | 0 |
| happy-path | passed | 108 | 0 | 0 |

## Retry Overhead

- review-fails-once: 36

## Fan-Out Overhead

- subagent-heavy-review: 43 (22.1% subagent share)

## Top Optimization Candidates

- Highest total scenario: subagent-heavy-review (195 tokens)
- Highest retry overhead: review-fails-once (36 tokens)
- Highest fan-out overhead: subagent-heavy-review (43 tokens)
