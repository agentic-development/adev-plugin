---
name: adev-debug
description: Context-aware systematic debugging. Uses the constitution, specs, and repo map to narrow down issues with structured hypotheses and targeted investigation.
---

# Debug an Issue

Systematic debugging grounded in project context.

Full implementation pending. See design doc Part 3, Phase 3.

## Process

1. **Gather symptoms:** Ask the user for the error message, reproduction steps, and affected area.
2. **Load context:** Read the relevant Feature Charter, Live Spec(s), and constitution. If a repo map exists (`.context-kit/hygiene/repomap.md`), use it to locate relevant symbols.
3. **Form hypotheses:** Based on the symptoms and context, generate 3-5 ranked hypotheses about the root cause.
4. **Investigate:** For each hypothesis (starting with most likely):
   a. Identify files and functions to inspect.
   b. Read the code and check against the spec's behavioral contract.
   c. Look for violations of constitutional principles (e.g., missing error handling, wrong dependency direction).
   d. Confirm or eliminate the hypothesis.
5. **Propose fix:** Once the root cause is identified, propose a fix that:
   - Addresses the root cause, not just the symptom
   - Includes a regression test
   - Stays within constitutional boundaries
6. **Optional: apply fix:** If the user approves, implement the fix following TDD (write the regression test first).

## Arguments

- `--error <message>`: the error message or symptom description
- `--spec <path>`: scope debugging to a specific spec's domain
- `--apply`: apply the fix after diagnosis (prompts for confirmation)
