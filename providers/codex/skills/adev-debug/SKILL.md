---
name: adev-debug
description: "Context-aware systematic debugging. Checks ADRs for known issues, specs for expected behavior, and orientation for architecture context. In Codex, invoke with $adev-debug"
---

# Debug an Issue

Systematic debugging grounded in project context. Six phases.

## Arguments

- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message
- `--spec <path>`: scope to specific spec's domain
- `--apply`: apply fix after diagnosis

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## Phase 1: Reproduce

1. Read error messages carefully
2. Reproduce consistently
3. Check recent changes: `git diff`, `git log --oneline -10`

## Phase 2: Investigate (with Context)

1. Check ADRs for known issues
2. Check specs for expected behavior
3. Check orientation for architecture context
4. Check constitution for non-negotiable rules
5. Check repo map if available
6. Gather evidence in multi-component systems

## Phase 3: Hypothesize

1. Find working examples in codebase
2. Compare against golden samples
3. Form single, testable hypothesis

## Phase 4: Verify

1. Test minimally, one variable at a time
2. Evaluate:
   - Hypothesis confirmed? → Phase 5
   - Hypothesis rejected? → Phase 3 with new hypothesis
3. If 3+ hypotheses failed: question architecture, discuss with user

## Phase 5: Fix

1. Create failing test case (simplest reproduction)
2. Implement single fix (root cause, not symptom)
3. Verify: test passes, no other tests broken

## Phase 6: Validate and Record

1. Run quality gates
2. Verify spec compliance
3. Consider drafting ADR if architectural insight revealed

## Quick Reference

| Phase | Activities | Success |
|-------|-----------|---------|
| 1. Reproduce | Read errors, reproduce | Problem confirmed |
| 2. Investigate | Load ADRs, specs, constitution | Area understood |
| 3. Hypothesize | Find examples, compare, form | Evidence-grounded theory |
| 4. Verify | Test minimally | Hypothesis confirmed |
| 5. Fix | Failing test, minimal fix | Root cause resolved |
| 6. Validate | Run gates, check spec | Fix complete |

## Red Flags

If you catch yourself thinking:
- "Quick fix for now"
- "Just try changing X"
- "Skip the test"
- "I don't fully understand but..."

STOP and return to Phase 1.
