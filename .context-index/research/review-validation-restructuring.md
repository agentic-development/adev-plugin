# Research: Review & Validation Restructuring

**Date:** 2026-05-11
**Status:** Complete
**Trigger:** Retro analysis showed ~40-50% check overlap between review-specs and validate, 23 specs shipped without review, and no plan review exists.

## Problem Statement

The current lifecycle has two quality gates (review-specs and validate) with significant overlap. Security review is embedded in spec review only, leaving implementation-time security unchecked. Plans have no review process despite being a common failure point for subagent execution.

## Current State

### Review-Specs (pre-planning)
- 3 parallel reviewers: Structural Architect, Security Reviewer, Consistency Analyzer
- 8 domain-specific reviewers triggered by file patterns
- 118 reviews conducted, 234 findings, 5 blockers (all resolved in-cycle)
- 78% PASS_WITH_NOTES rate
- 23 specs skipped review entirely and shipped fine

### Validate (post-implementation)
- 13 ordered checks with fail-fast
- ~40-50% overlap with review checks (charter consistency, constitution compliance, ADR compliance, boundary compliance, cross-cutting specs)
- Catches implementation issues but also re-checks design decisions already verified at review

### Plans (no review)
- No quality gate between planning and implementation
- Common failure modes: wrong task ordering, missing behavior-to-task mapping, oversized tasks

## Proposed Restructuring

### Principle: Catch Issues at the Cheapest Fix Point

| Phase | Cost to Fix | Focus |
|-------|------------|-------|
| Spec Review | Very low (edit markdown) | Design flaws, security gaps, missing contracts |
| Plan Review (new) | Low (edit task list) | Task ordering, coverage, sizing |
| Implementation | Medium (rewrite code) | Code quality, TDD, security anti-patterns |
| Validation | High (rework) | Verification only — does code match spec? |

### Check Distribution

#### Spec Review — "Is it well-designed?"
Keep:
- Behavior completeness (preconditions, postconditions)
- Security/authorization boundaries
- Cross-spec consistency
- Charter alignment (move from validate)
- Constitution compliance (move from validate)
- ADR compliance (move from validate)

Add:
- Feasibility check (can this actually be built?)

Make optional for pattern-following specs (strategy profiles, docs, workspace extensions).

#### Plan Review (new) — "Is the plan executable?"
Lightweight, single-pass linter (not 3 parallel agents):
- Task ordering matches dependency graph
- Every spec behavior maps to at least one task
- No single task spans too many files
- Infrastructure requirements declared
- Test strategy assigned to each task
- No secrets or credentials in task descriptions
- Estimated complexity is reasonable

#### Implementation Review — "Is the code correct?"
Keep existing 2-stage subagent review in /adev:implement.

Add:
- Security specialist routing for high-risk tasks (auth, input handling, shell execution, DB queries)
- Static anti-pattern scan (raw SQL concatenation, exec with user input, innerHTML, hardcoded secrets)

#### Validation — "Did we build what we specified?"
Reduce from 13 to ~7 checks (verification-only):
- Quality gates (tests pass)
- Source manifest verification
- Spec compliance (code matches behaviors)
- Specialist review (implementation-specific)
- Visual verification (UI only)
- Lifecycle reconciliation
- Reality check
- Security verification (auth/redaction matches spec, dependency audit)

Remove (moved to spec review):
- Charter consistency
- Constitution compliance
- ADR compliance
- Cross-cutting specs
- Boundary compliance

### Security as Cross-Cutting Concern

Security checks at every phase, proportional to what's knowable:

| Phase | Security Focus | Cost |
|-------|---------------|------|
| Spec Review | Auth model, data classification, trust boundaries | Existing |
| Plan Review | No secrets in tasks, safe infra choices | Automated |
| Implement | Security specialist on high-risk tasks + static anti-pattern scan | Targeted |
| Validation | Verify auth/redaction matches spec, dependency audit | Automated |
| Deploy | Inline secret detection, output redaction | Existing |

## Key Data Points

- 5 blockers caught by review = genuine value for novel specs
- 23 specs skipped review and shipped fine = low value for formulaic specs
- 6 validation FAILs all had prior reviews = review didn't prevent validation failures
- Most common validation failures were from unrelated test breakage, not spec quality
- 78% PASS_WITH_NOTES rate may indicate warning fatigue risk

## Recommendations

1. Implement plan linter as first step (highest ROI, lowest cost)
2. Deduplicate checks between review and validate (remove 5 checks from validate)
3. Add security specialist routing during implement for high-risk tasks
4. Make spec review skippable for pattern-following specs
5. Track warning action rate to calibrate PASS_WITH_NOTES signal quality

## Related

- ADR 0003: Configurable Review Registry
- ADR 0004: Execution Profiles
- `.context-index/governance/review.yaml` — current reviewer configuration
- `skills/review-specs/SKILL.md` — review skill
- `skills/validate/SKILL.md` — validation skill
