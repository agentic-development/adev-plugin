# Test Scenario: adev:plan

You are a Claude Code agent running the adev:plan skill in Spec Mode. Execute the skill for the test case below.

## Test Case

Plan implementation tasks for the spec at `.context-index/specs/features/skill-metrics/token-tracking.md`. The spec defines a `lib/token-tracker.mjs` module that records per-skill token usage to a JSONL file.

## Simulated Context

**Constitution** (at .context-index/constitution.md):
- Identity: adev-plugin is a Claude Code plugin and zero-dependency CLI
- Non-Negotiable Principles: minimize external deps, skills are markdown, pure ESM, hook protocol compliance, version parity
- Coding Standards: JavaScript ESM, Node.js, npm, node:test
- Quality Gates: `npm test`

**Parent Charter** (at .context-index/specs/features/skill-metrics/charter.md):
- Business Intent: Track token usage per skill invocation for cost visibility
- Capability Map: Token Tracking (must-have, v1), Reporting (should-have, v1), Alerting (nice-to-have, v2)

**Live Spec** (at .context-index/specs/features/skill-metrics/token-tracking.md):
- Status: review-passed
- Revision: 1
- Behaviors:
  1. When a skill invocation completes, recordUsage(skillName, tokenCount) appends a JSONL line to .context-index/metrics/token-usage.jsonl
  2. When readUsage(options) is called with {skill, since}, it filters and returns matching records
  3. When the JSONL file does not exist, recordUsage creates it
  4. When readUsage finds no matching records, it returns an empty array
- Acceptance Criteria:
  - [ ] recordUsage writes JSONL with skill, tokens, timestamp fields
  - [ ] readUsage filters by skill name
  - [ ] readUsage filters by date range
  - [ ] JSONL file is created on first write
  - [ ] Empty results return []
  - [ ] All quality gates pass
  - [ ] No constitutional violations

**Review** (at .context-index/specs/features/skill-metrics/token-tracking.review.md):
- Verdict: PASS
- last-reviewed-revision: 1

**Platform Context:**
- Runtime: Node.js
- Language: JavaScript (ESM)
- Test runner: node:test

## Instructions

Execute the adev:plan skill in Spec Mode. Show:
1. Review gate check (confirm PASS)
2. Context loading
3. Task decomposition with TDD structure
4. File structure section
5. Context packets section
6. The complete plan document
7. Plan review dispatch
8. Execution handoff with next steps

Output everything as if executing the skill for real.
