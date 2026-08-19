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
