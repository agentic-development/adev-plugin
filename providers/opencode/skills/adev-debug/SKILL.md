---
name: adev-debug
description: "Context-aware systematic debugging. Checks ADRs for known issues, specs for expected behavior, and orientation for architecture context. In OpenCode, invoke with skill({ name: 'adev-debug' })"
---

# Debug an Issue

Systematic debugging grounded in project context. Six phases: Reproduce, Investigate, Hypothesize, Verify, Fix, Validate.

## Arguments

- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
- `--apply`: apply the fix after diagnosis

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1 and Phase 2, you cannot propose fixes.

## When to Use

Use for ANY technical issue:

- Test failures
- Bugs in production or development
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

## Phase 1: Reproduce

**Goal:** Confirm the problem exists and is consistent.

1. **Read error messages carefully.** Note line numbers, file paths, error codes.
2. **Reproduce consistently.** Can you trigger it reliably? What are the exact steps?
3. **Check recent changes.** Run `git diff` and `git log --oneline -10`.

## Phase 2: Investigate (with Context)

**Goal:** Understand the affected area using project context before forming hypotheses.

1. **Check ADRs for known issues.** Read `.context-index/adrs/` for decisions related to the affected area.
2. **Check specs for expected behavior.** Read the Feature Charter and Live Spec. Compare observed behavior against the spec's behavioral contract.
3. **Check orientation for architecture context.** Read `.context-index/orientation/architecture.md` for module relationships.
4. **Check the constitution.** Read `.context-index/constitution.md` for non-negotiable rules.
5. **Check the repo map if available.** Read `.context-index/hygiene/repo-map.md` to locate symbols.
6. **Gather evidence in multi-component systems.** Add diagnostic instrumentation at component boundaries.
7. **Trace data flow.** Where does the bad value originate? Keep tracing backward.

## Phase 3: Hypothesize

**Goal:** Form a single, testable hypothesis about the root cause.

1. **Find working examples.** Locate similar working code in the same codebase.
2. **Compare against references.** Read golden samples in `.context-index/samples/`.
3. **Form a single hypothesis.** "I think X is the root cause because Y."

## Phase 4: Verify

**Goal:** Test the hypothesis with the smallest possible change.

1. **Test minimally.** One variable at a time.
2. **Evaluate the result.**
   - Hypothesis confirmed? Proceed to Phase 5.
   - Hypothesis rejected? Return to Phase 3 with a new hypothesis.
3. **If 3+ hypotheses have failed:** Question the architecture. Stop and discuss with user.

## Phase 5: Fix

**Goal:** Fix the root cause, not the symptom.

1. **Create a failing test case.** Simplest possible reproduction as an automated test.
2. **Implement a single fix.** Address the root cause identified in Phase 4.
3. **Verify the fix.** Failing test now passes. No other tests broken.

## Phase 6: Validate and Record

**Goal:** Confirm the fix is complete and capture architectural insight.

1. **Run quality gates.** Execute all commands from the constitution's Quality Gates section.
2. **Verify spec compliance.** Compare fixed behavior against spec's behavioral contract.
3. **Consider drafting an ADR.** If the root cause reveals an architectural insight, prompt the user.

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Reproduce** | Read errors, reproduce consistently | Problem is confirmed |
| **2. Investigate** | Load ADRs, specs, orientation, constitution | Affected area understood |
| **3. Hypothesize** | Find working examples, compare, form hypothesis | Specific, evidence-grounded theory |
| **4. Verify** | Test minimally, one variable at a time | Hypothesis confirmed |
| **5. Fix** | Create failing test, implement fix | Root cause resolved |
| **6. Validate** | Run quality gates, check spec compliance | Fix is complete |

## Red Flags

If you catch yourself thinking any of these, STOP and return to Phase 1:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
