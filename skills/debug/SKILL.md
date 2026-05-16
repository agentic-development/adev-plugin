---
name: adev:debug
description: "Context-aware systematic debugging. Checks ADRs for known issues, specs for expected behavior, and orientation for architecture context before investigating. Use when encountering any bug, test failure, or unexpected behavior. Trigger on 'fix this', 'fix the bug', 'something is broken', 'this test fails', 'unexpected error', 'why is this not working', 'this doesn't work', 'can you fix', 'there's an error', 'it's failing', or any request to fix, debug, or investigate a problem."
---

# Debug an Issue

Systematic debugging grounded in project context. Forked from Superpowers' systematic-debugging with context-awareness additions from the Agentic Development Framework.

## Arguments

- No arguments: interactive (asks for symptoms)
- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
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

4. **Heuristics:** Load module-scoped heuristics for the buggy file's module via the CLI:

   ```bash
   adev heuristics retrieve --module <module-slug> --tier summary --format text \
       [--keyword <token>]...
   ```

   Derive keywords from the error message or bug description: split on whitespace and punctuation,
   filter to tokens of 3+ characters, remove common stop words (the, and, is, was, not, for, with,
   from, this, that, are, has, have, its, etc.), take the first 5 unique tokens as keywords. Pass each as a `--keyword` flag.
   Example: `"ERR_FS_CP_EINVAL: src and dest cannot be the same"` → `--keyword src --keyword dest --keyword same --keyword err --keyword einval`.
   If fewer than 3 tokens are extracted, omit `--keyword` entirely and fall back to module-only retrieval.

   Stdout is either rendered markdown blocks (one per heuristic, separated by blank lines) or the literal sentinel `__NONE__` when no heuristics match. The verb exits 0 regardless — retrieval failures degrade to `__NONE__` so heuristic injection stays non-blocking.
   When heuristics are present (output is not `__NONE__`), prepend: "The following heuristics are lessons learned from past work
   in this module. Use them as guidance, not as hard rules."

### Phase 1.5: Infrastructure Preflight

After reproducing the issue and loading heuristics, check whether the relevant spec or plan declares `infra_requirements`. If so, run the infrastructure preflight before investigating.

**`--no-infra` resolution:** Read `--no-infra` flag from arguments. If not passed, check `ADEV_NO_INFRA` env var (only exact value `1` activates bypass). Read once at skill entry, convert to `options.noInfra`. The agent must never set `--no-infra` or `ADEV_NO_INFRA` autonomously — if preflight fails, report the failure and wait for user direction.

**Three-tier spec/plan resolution:**

1. **Arguments:** If `--spec <path>` was passed, read that spec. Look for a `.plan.md` sibling adjacent to it (same directory, same base name). Use both for the preflight invocation.

2. **Active plan:** If no `--spec` was passed, read `.context-index/hygiene/.active-plan`. If the file exists and contains a plan path, read the plan and extract the referenced spec from the plan's `Spec:` header.

3. **Inference:** If neither tier 1 nor tier 2 produced a spec, determine the module from the buggy file's path via `manifest.yaml` modules. Glob specs in `.context-index/specs/features/<module>/` (cap at 10 spec files; validate each path is within the project root). Check each spec for `infra_requirements` in its frontmatter.

**Invocation:** Run the preflight via the CLI:

```bash
adev preflight run --spec <specPath> [--plan <planPath>] [--timeout 10] [--no-infra]
```

Stdout is a single JSON object — the preflight report. Exit codes: 0 on PASS or skipped, 2 on FAIL, 1 on argument errors.

**For tiers 1 and 2 (explicit spec/plan):** If the report has `passed === false` (exit 2), display the formatted report and block:

```
Infrastructure Preflight: FAILED

<formatted report output>

Execution blocked. Options:
  1. Fix the issues above and retry
  2. Re-run with --no-infra to bypass (user decision only)
```

**For tier 3 (inference):** If `report.passed === false`, use a NON-BLOCKING advisory instead of a hard block:

```
Infrastructure may be unavailable (inferred from <module> specs):
  ✗ <system>: <issue>

Waiting for user direction. Fix the infrastructure issues above, or
re-run with --no-infra to bypass.
```

Hard pause — the agent must not answer on behalf of the user.

If `report.passed === true` and `report.skipped === true`, emit: "Infrastructure preflight skipped (--no-infra)."

If `report.passed === true` and `report.skipped === false`, proceed silently.

If `lib/infra-preflight.mjs` fails to import, block with: "Infrastructure preflight library could not be loaded: <error>. Fix the library before proceeding."

If no spec with `infra_requirements` is found across all three tiers, skip the preflight silently.

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
   - For spec status and prior reviewer/validator outcomes, call `currentState(projectRoot, specPath)` from `<ADEV_ROOT>/lib/lifecycle-state.mjs` — read `state.steps.review` for the latest review verdict and notes, and `state.steps.validate` for prior validator findings. Do NOT parse `.review.md` or `.validate.md` files directly.
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

6. **Load debug playbooks.**

   Load structured diagnostic playbooks that map failure modes to ordered investigation procedures.

   a. **Read playbook files.**
      - Read `.context-index/specs/features/<module>/debug-playbook.md` if it exists (module determined in Phase 1).
      - Read `.context-index/specs/cross-cutting/debug-playbook.md` if it exists.
      - If no playbook exists for the affected module and no cross-cutting playbook exists, skip this step silently — no warnings, no degradation. Proceed with standard Phase 2.
      - If a file exists but is malformed (missing YAML frontmatter with `last-verified`, or missing failure mode sections with `id`, `triggers`, `steps`, and `escalation`), log a warning and skip it.

   b. **Match triggers against Phase 1 symptoms.**
      - For each failure mode in the loaded playbooks, compare its trigger patterns semantically against the error messages, stack traces, and behavioral descriptions from Phase 1.
      - This is an LLM-side operation — read each trigger's pattern text and compare it against the symptom descriptions. No helper library or code-based matcher is used.
      - When both module and cross-cutting playbooks contain failure modes whose triggers match the same symptom, the module-scoped failure mode takes precedence — present only the module-scoped failure mode for that symptom. Non-overlapping cross-cutting failure modes are still included.
      - If triggers match: present the matched failure modes with their ordered diagnostic steps as the recommended investigation path.
      - If no triggers match but a playbook exists: present the full list of failure mode titles as a menu for the user to select from.

   c. **Execute diagnostic steps.**
      - For each matched failure mode, follow its ordered steps.
      - If a step has a `command` field, execute it via the Bash tool. Command execution is subject to Claude Code's standard tool approval — the user sees and approves each command. Compare output against the `expected` field.
      - Command output is ephemeral: used to inform the investigation but not written to disk or included in reports beyond a one-line summary.
      - If a command fails or times out, report the failure as a diagnostic finding and continue to the next step.
      - If the escalation condition is met, stop following the playbook and report the escalation target (human, ADR review, or architecture reassessment) before proceeding to Phase 3.

7. **Gather evidence in multi-component systems.**

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

8. **Trace data flow.**
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
   - If the test already exists and is failing, do NOT weaken it. Read the test,
     understand what it expects, then fix the code to satisfy the original assertion.
   - If you need to change the test, explain why the REQUIREMENT changed, not just
     why the code produces a different value.

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

4. **Record the debug intervention in the lifecycle log.**

   If the bug is tracked by a spec, emit a `debug_intervention` event so the projection captures the intervention (replaces any prior "append to debug log" prose):

   ```javascript
   import { reportIntervention } from '<ADEV_ROOT>/lib/lifecycle-state.mjs';
   reportIntervention(projectRoot, specPath, {
     kind: "debug",
     note: "<≤200-char operator summary of root cause and fix>",
   });
   ```

   Severity is stamped at write time by the lib. `notes` MUST NOT include API keys, tokens, file contents, or stack traces beyond the immediate error message (4 KB cap; ≤200 chars in practice).

### Phase 6: Validate and Record

**Goal:** Confirm the fix is complete and capture any architectural insight.

1. **Run quality gates.**
   - Execute all commands from the constitution's Quality Gates section.
   - All tests pass, lint passes, type check passes.

2. **Verify spec compliance.**
   - Compare the fixed behavior against the spec's behavioral contract.
   - The fix must not violate any constitutional principles.

3. **Consider drafting an ADR.**
   - If the root cause reveals an architectural insight (unexpected coupling, missing abstraction, violated assumption, technology constraint), suggest drafting an ADR.
   - Prompt the user: "The root cause was [X]. This reveals [architectural insight]. Want me to draft an ADR to document this decision/constraint?"
   - If yes, create a draft ADR in `.context-index/adrs/` with the next sequential number.
   - Use the template at `${CLAUDE_PLUGIN_ROOT}/templates/adr-template.md` if it exists.

4. **Update issue board with confidence.**
   - Read `tasks.backend` from `manifest.yaml`. If not configured, skip.
   - Search the issue board for a bug issue matching the error description or spec reference (by title keyword match or `spec_ref`).
   - If a matching issue is found and quality gates pass (step 1 above), compute the confidence-annotated note via the CLI:

     ```bash
     adev verify format-note --action "Bug fixed" --confidence high \
                             --spec-path <specPath> --tests-pass true
     ```

     The verb wraps `formatConfidenceNote` and emits a single JSON object `{note}` on stdout.
   - Update the issue: `update(id, { status: "closed", notes: "<confidence note>" })`
   - Only close with HIGH confidence (quality gates pass + fix verified against spec). If gates have not been run or fail, add a note but do not close: `update(id, { notes: "Fix applied but not yet validated — run /adev:validate" })`
   - If the CLI invocation fails (e.g., `adev verify` not yet available in this environment), skip this step (non-blocking).
   - Report to user: "Updated issue `<id>` — closed with high confidence (tests pass, spec compliant)."

### Phase 7: Documentation Impact

**Goal:** Check if the fix changes assumptions documented in specs, charters, or ADRs.

1. **Review the fix against spec assumptions.**
   - Re-read the relevant Live Spec (from Phase 2).
   - Does the fix change the behavioral contract? (e.g., error handling now works differently, a default value changed, an edge case is now handled)
   - If yes: update the spec's acceptance criteria to reflect the new behavior. Flag this to the user.

2. **Review the fix against charter scope.**
   - Does the fix reveal that a capability was missing from the charter's Capability Map?
   - If yes: suggest adding it to the charter.

3. **Review the fix against ADRs.**
   - Does the fix contradict or extend a previous architectural decision?
   - If yes: suggest updating the ADR or creating a new one (see Phase 6 step 4).

4. **Summary.** Report what documentation changes (if any) are needed:
   - "No documentation impact" (most common for isolated bug fixes)
   - "Spec update needed: [spec path] — [what changed]"
   - "ADR update needed: [ADR path] — [what changed]"
   - "Charter update suggested: [charter path] — [what to add]"

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
