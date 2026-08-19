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
