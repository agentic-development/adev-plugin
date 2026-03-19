---
name: adev-review-specs
description: Architecture review using parallel specialist subagents. A structural architect, security reviewer, and consistency analyzer independently evaluate specs before planning begins.
---

# Review Specs

Run an architecture review on one or more Live Specs using parallel specialist subagents.

Full implementation pending. See design doc Part 3, Phase 2.

## Specialist Subagents

| Specialist | Prompt File | Focus |
|------------|-------------|-------|
| Structural Architect | `structural-architect-prompt.md` | API shape, data flow, module boundaries, dependency direction |
| Security Reviewer | `security-reviewer-prompt.md` | Auth/authz gaps, data exposure, injection surfaces, secrets handling |
| Consistency Analyzer | `consistency-analyzer-prompt.md` | Naming drift, pattern violations, contract mismatches across specs |

Each specialist runs in parallel and produces a finding list with severity (blocker, warning, suggestion).

## Process

1. **Load specs:** Read the target spec(s) and their parent charter(s).
2. **Load constitution:** Read constitutional principles and coding standards.
3. **Fan out:** Launch all three specialist subagents in parallel, each receiving the spec(s), charter(s), and constitution.
4. **Collect findings:** Merge results into a unified review report.
5. **Gate decision:** If any blocker-severity findings exist, the spec is marked as `review: blocked`. Otherwise, `review: passed`.
6. **Output:** Write review report to `.context-kit/specs/features/<module>/<spec-slug>-review.md`.

## Arguments

- No arguments: review all unreviewed specs
- `--spec <path>`: review a specific spec file
- `--charter <module>`: review all specs under a charter
