---
name: adev-debug
description: Context-aware systematic debugging. Checks ADRs for known issues, specs for expected behavior, and orientation for architecture context before investigating. Use when encountering any bug, test failure, or unexpected behavior.
---

# Debug an Issue

Systematic debugging grounded in project context. Forked from Superpowers' systematic-debugging with context-awareness additions from the Agentic Development Framework.

## Arguments

- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
- `--apply`: apply the fix after diagnosis (prompts for confirmation)

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1 and Phase 2, you cannot propose fixes. Symptom fixes are failure.

## When to Use

Use for ANY technical issue:
- Test failures
- Bugs in production or development
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

Use this ESPECIALLY when:
- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You have already tried multiple fixes
- Previous fix did not work
- You do not fully understand the issue

## Process

Six phases. Complete each before proceeding to the next.

### Phase 1: Reproduce

**Goal:** Confirm the problem exists and is consistent.

1. **Read error messages carefully.**
   - Do not skip past errors or warnings.
   - Read stack traces completely.
   - Note line numbers, file paths, error codes.

2. **Reproduce consistently.**
   - Can you trigger it reliably?
   - What are the exact steps?
   - Does it happen every time?
   - If not reproducible, gather more data. Do not guess.

3. **Check recent changes.**
   - Run `git diff` and `git log --oneline -10` in the affected area.
   - New dependencies, config changes, environmental differences.

### Phase 2: Investigate (with Context)

**Goal:** Understand the affected area using project context before forming hypotheses.

This is the key difference from generic debugging. Before diving into code, load the project's documented knowledge.

1. **Check ADRs for known issues.**
   - Read `.context-index/adrs/` for decisions related to the affected area.
   - Look for ADRs that document known trade-offs, workarounds, or constraints.
   - A previous team may have already encountered and documented this failure mode.

2. **Check specs for expected behavior.**
   - Read the relevant Feature Charter at `.context-index/specs/features/<module>/charter.md`.
   - Read the Live Spec if one exists for the current task.
   - Compare the observed behavior against the spec's behavioral contract.
   - The bug may be "working as specified" (spec problem, not code problem).

3. **Check orientation for architecture context.**
   - Read `.context-index/orientation/architecture.md` for module relationships.
   - Read `.context-index/platform-context.yaml` for technology constraints.
   - Understand data flow across the affected module boundaries.

4. **Check the constitution for relevant principles.**
   - Read `.context-index/constitution.md` for non-negotiable rules.
   - The bug may result from violating a constitutional boundary.

5. **Check the repo map if available.**
   - Read `.context-index/hygiene/repo-map.md` to locate symbols and dependencies.
   - Identify which files import or depend on the broken component.

6. **Gather evidence in multi-component systems.**

   WHEN the system has multiple components (API to service to database, CI to build to deploy):

   BEFORE proposing fixes, add diagnostic instrumentation:
   ```
   For EACH component boundary:
     - Log what data enters the component
     - Log what data exits the component
     - Verify environment/config propagation
     - Check state at each layer

   Run once to gather evidence showing WHERE it breaks.
   THEN analyze evidence to identify the failing component.
   THEN investigate that specific component.
   ```

7. **Trace data flow.**
   - Where does the bad value originate?
   - What called this with the bad value?
   - Keep tracing backward until you find the source.
   - Fix at source, not at symptom.

### Phase 3: Hypothesize

**Goal:** Form a single, testable hypothesis about the root cause.

1. **Find working examples.**
   - Locate similar working code in the same codebase.
   - What works that is similar to what is broken?

2. **Compare against references.**
   - If implementing a pattern, read the reference implementation completely.
   - Check golden samples in `.context-index/samples/` for how the pattern should look.
   - Do not skim. Read every line.

3. **Form a single hypothesis.**
   - State clearly: "I think X is the root cause because Y."
   - Be specific, not vague.
   - Ground the hypothesis in the evidence from Phase 2 (reference ADRs, specs, or architecture docs that support or contradict the hypothesis).

### Phase 4: Verify

**Goal:** Test the hypothesis with the smallest possible change.

1. **Test minimally.**
   - Make the SMALLEST possible change to test the hypothesis.
   - One variable at a time.
   - Do not fix multiple things at once.

2. **Evaluate the result.**
   - Hypothesis confirmed? Proceed to Phase 5.
   - Hypothesis rejected? Return to Phase 3 with a new hypothesis.
   - Do not add more fixes on top of a failed hypothesis.

3. **If 3+ hypotheses have failed: question the architecture.**
   - Pattern indicating architectural problem: each fix reveals new shared state, coupling, or a problem in a different place.
   - STOP and question fundamentals. Read relevant ADRs and the orientation doc.
   - Discuss with the user before attempting more fixes.
   - This is NOT a failed hypothesis. This is a wrong architecture.

### Phase 5: Fix

**Goal:** Fix the root cause, not the symptom.

1. **Create a failing test case.**
   - Simplest possible reproduction as an automated test.
   - This test MUST fail before the fix and pass after.

2. **Implement a single fix.**
   - Address the root cause identified in Phase 4.
   - ONE change at a time.
   - No "while I'm here" improvements.
   - No bundled refactoring.
   - Stay within constitutional boundaries.

3. **Verify the fix.**
   - Failing test now passes.
   - No other tests broken.
   - Issue actually resolved end-to-end.

### Phase 6: Validate and Record

**Goal:** Confirm the fix is complete and capture any architectural insight.

1. **Run quality gates.**
   - Execute all commands from the constitution's Quality Gates section.
   - All tests pass, lint passes, type check passes.

2. **Verify spec compliance.**
   - Compare the fixed behavior against the spec's behavioral contract.
   - The fix must not violate any constitutional principles.

3. **Check for checkpoint rewind (if Entire is installed).**
   - Read `.context-index/manifest.yaml` for `integrations.session_capture.provider`.
   - If `provider: entire`, check whether the issue was introduced during the current session.
   - If so, suggest reverting to a checkpoint before the deviation using the Entire checkpoint branch.
   - Format: "The issue was introduced at [approximate point]. You can rewind to a checkpoint before that change if the fix is complex."

4. **Consider drafting an ADR.**
   - If the root cause reveals an architectural insight (unexpected coupling, missing abstraction, violated assumption, technology constraint), suggest drafting an ADR.
   - Prompt the user: "The root cause was [X]. This reveals [architectural insight]. Want me to draft an ADR to document this decision/constraint?"
   - If yes, create a draft ADR in `.context-index/adrs/` with the next sequential number.
   - Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md` if it exists.

## Red Flags

If you catch yourself thinking any of these, STOP and return to Phase 1:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Here are the main problems: [lists fixes without investigation]"
- "One more fix attempt" (when you have already tried 2+)
- Each fix reveals a new problem in a different place

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes do not stick. Test first proves it. |
| "Multiple fixes at once saves time" | Cannot isolate what worked. Causes new bugs. |
| "I see the problem, let me fix it" | Seeing symptoms is not understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures means architectural problem. Question the pattern. |

## Quick Reference

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Reproduce** | Read errors, reproduce consistently, check recent changes | Problem is confirmed and repeatable |
| **2. Investigate** | Load ADRs, specs, orientation, constitution, repo map | Affected area is understood in context |
| **3. Hypothesize** | Find working examples, compare, form single hypothesis | Specific, evidence-grounded theory |
| **4. Verify** | Test minimally, one variable at a time | Hypothesis confirmed or new one formed |
| **5. Fix** | Create failing test, implement single fix, verify | Root cause resolved, tests pass |
| **6. Validate** | Run quality gates, check spec compliance, consider ADR | Fix is complete, insight captured |
