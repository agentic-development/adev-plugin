---
name: adev:debug
description: "Context-aware systematic debugging. Checks ADRs for known issues, specs for expected behavior, and orientation for architecture context before investigating. Use when encountering any bug, test failure, or unexpected behavior. Trigger on 'fix this', 'fix the bug', 'something is broken', 'this test fails', 'unexpected error', 'why is this not working', 'this doesn't work', 'can you fix', 'there's an error', 'it's failing', or any request to fix, debug, or investigate a problem."
---

# Debug an Issue

Systematic debugging grounded in project context. Forked from Superpowers' systematic-debugging with context-awareness additions from the Agentic Development Framework.

### Load Skill Extensions

**Load Skill Extensions:** Load any skill extension instructions before proceeding:

```bash
adev skill-ext load --skill debug
```

If the output is not `__NONE__`, incorporate it as additional standing instructions that apply to this skill's entire execution. Frame it as: *"The following skill extension instructions apply to this invocation (source: installed domain extensions and/or project-level overrides)."* If the output is `__NONE__`, continue normally.

---

## Arguments

- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
- `--issue <id>`: the board issue tracking this bug — claimed in Phase 1.6 so a second agent cannot fix it in parallel
- `--auto`: non-interactive mode. No step in Phase 1 or Phase 6 blocks waiting for user input — every decision point that would otherwise prompt falls back to a deterministic default (see Phase 1's bounded reproduction limit and Phase 6 step 3 below). Intended for `/adev:bugfix-loop`'s unattended invocations.
- `--apply`: apply the fix after diagnosis (prompts for confirmation)
- `--no-infra`: skip infrastructure preflight checks (user-only — the agent must never set this flag)

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

Establishes a deterministic reproduction before any fix is attempted.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-1-reproduce.md` for the full instructions. Do not act on this section from the summary above.

### Phase 1.5: Infrastructure Preflight

Runs only when the failing area declares infra_requirements.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-1.5-infra-preflight.md` for the full instructions. Do not act on this section from the summary above.

### Phase 1.6: Ownership Claim

Claims the issue so concurrent sessions do not duplicate the fix.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-1.6-ownership-claim.md` for the full instructions. Do not act on this section from the summary above.

### Phase 2: Investigate (with Context)

Context-aware investigation across ADRs, specs, and orientation.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-2-investigate.md` for the full instructions. Do not act on this section from the summary above.

### Phase 3: Hypothesize

Forms a falsifiable hypothesis from the investigation.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-3-hypothesize.md` for the full instructions. Do not act on this section from the summary above.

### Phase 4: Verify

Confirms or refutes the hypothesis before changing code.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-4-verify.md` for the full instructions. Do not act on this section from the summary above.

### Phase 5: Fix

Applies the minimal fix that the verified hypothesis implies.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-5-fix.md` for the full instructions. Do not act on this section from the summary above.

### Phase 6: Validate and Record

Runs the gates and records the fix against its spec.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-6-validate-and-record.md` for the full instructions. Do not act on this section from the summary above.

### Completion token (`/goal`-friendly)

After Phase 6's confidence gate resolves, the **final line** of your chat output for this run MUST be the completion token — emit it verbatim:

- Phase 6 step 4 closed the issue with HIGH confidence (quality gates pass, fix verified against spec) → `ADEV-DEBUG: FIXED`
- Phase 6 step 4 annotated without closing (gates not run, failed, or fix unverified) → `ADEV-DEBUG: PARKED`
- Phase 1 exhausted its bounded reproduction-attempt limit under `--auto` without reproducing the symptom (see Phase 1) → `ADEV-DEBUG: UNREPRODUCIBLE`

Rules: emit it exactly once, as plain text (no code fence, no backticks, no trailing prose after it), regardless of the active persona or verbosity level. This is a transcript-provable marker so Claude Code's `/goal` evaluator and the sibling `/adev:bugfix-loop` skill can read completion from the transcript's last line (see `.context-index/specs/cross-cutting/completion-tokens/`). Subagents dispatched by this skill MUST NOT emit a completion-token-grammar line — only this top-level skill does.

### Phase 7: Documentation Impact

Updates specs/ADRs whose assumptions the fix invalidated.

> **Conditional loading:** Read `<ADEV_ROOT>/skills/debug/references/phases/phase-7-documentation-impact.md` for the full instructions. Do not act on this section from the summary above.

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
| **2. Investigate** | Load ADRs, specs, orientation, constitution, repo map, playbooks | Affected area is understood in context |
| **3. Hypothesize** | Find working examples, compare, form single hypothesis | Specific, evidence-grounded theory |
| **4. Verify** | Test minimally, one variable at a time | Hypothesis confirmed or new one formed |
| **5. Fix** | Create failing test, implement single fix, verify | Root cause resolved, tests pass |
| **6. Validate** | Run quality gates, check spec compliance, consider ADR | Fix is complete, insight captured |
| **7. Doc Impact** | Check if fix changes spec/charter/ADR assumptions | Documentation updated or confirmed unchanged |

## API reference

Lifecycle event log:

- `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read the projection (`state.steps.review`, `state.steps.validate`, `state.interventions`). Replaces filesystem inspection of `.review.md` / `.validate.md` artifacts.
- `reportIntervention(projectRoot, specPath, { kind: "debug", note })` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — emits a `debug_intervention` event in Phase 5 step 4. Severity is stamped at write time.

Issue board (Phase 6 step 4 update):

- `getIssueManager(manifest)` from `<ADEV_ROOT>/lib/issues/registry.mjs` — returns the active adapter.
- `IssueManagerInterface` — `init`, `create`, `update`, `close`, `list`, `get`, `listEpics`, `createEpic`, `updateEpic`, `addDependency`, `walkTree`.

Reality check (confidence scoring before closing):

- `formatConfidenceNote` and `verifyIssueCompleted` from `<ADEV_ROOT>/lib/reality-check.mjs`.

Manifest:

- `loadManifest(projectRoot)` from `<ADEV_ROOT>/lib/manifest.mjs` — parses `.context-index/manifest.yaml`.
