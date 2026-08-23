### Phase 6: Validate and Record

**Goal:** Confirm the fix is complete and capture any architectural insight.

1. **Run quality gates.**
   - Execute all commands from the constitution's Quality Gates section.
   - All tests pass, lint passes, type check passes.
   - **Under `--auto`, on failure:** capture the failing checks as a stable, comparable, sorted set of IDs (e.g., failing test names, one per line, sorted). If the test runner's output cannot be parsed into discrete IDs, fall back to the raw failure output instead — the degraded-mode bounding of that raw text (hash, not full text) is the consuming `per-issue-attempt-cap` spec's responsibility, not this step's; this step only guarantees the raw text reaches the write in step 4 below.

2. **Verify spec compliance.**
   - Compare the fixed behavior against the spec's behavioral contract.
   - The fix must not violate any constitutional principles.

3. **Consider drafting an ADR.**
   - **Under `--auto`:** skip the interactive prompt entirely — there is no user present to answer it. If an architectural insight was detected, compute a confidence note carrying an insight description (not a generic label) via the existing `adev verify format-note` CLI verb:
     ```bash
     adev verify format-note --action "Architectural insight (auto mode): <one-sentence insight description>" --confidence low \
                             --spec-path <specPath>
     ```
     `<one-sentence insight description>` is the actual finding from this step (the unexpected coupling, missing abstraction, violated assumption, or technology constraint) — never the literal placeholder text. **Do not call `update()` here.** Phase 6 step 4 is the single call site that writes to the issue's `notes` field; hand this note's text to step 4, which appends it to whichever notes string it ends up writing (see Phase 6 step 4 below). ADR authorship stays a deferred human follow-up; `--auto` never drafts one autonomously.
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
   - Update the issue: build the notes string as `<confidence note>`, and **if Phase 6 step 3 computed an insight note under `--auto`,** append it on its own line in the same call: `update(id, { status: "closed", notes: "<confidence note>" + (insightNote ? "\n" + insightNote : "") })`. Without an insight note, this is unchanged from today. This is the HIGH-confidence closing branch — the Completion token section below follows immediately after this step, and this branch is what earns `ADEV-DEBUG: FIXED`.
   - Only close with HIGH confidence (quality gates pass + fix verified against spec). If gates have not been run or fail, add a note but do not close. Build the notes string by concatenating, each on its own line, whichever of these apply — all in this one `update()` call: (1) the base literal `"Fix applied but not yet validated — run /adev:validate"`; (2) **under `--auto`, if step 1 captured failing checks,** a `FAILING-CHECKS: <sorted-json-array>` block (or the raw fallback text); (3) **under `--auto`, if Phase 6 step 3 computed an insight note,** that note text. Example with all three present:
     `update(id, { notes: "Fix applied but not yet validated — run /adev:validate\nFAILING-CHECKS: <sorted-json-array>\n<insight note>" })`
     Without `--auto`, or when neither step 1 nor step 3 produced anything extra, the notes string is unchanged from today. This is the annotate-without-closing branch — the Completion token section below follows immediately after this step, and this branch is what earns `ADEV-DEBUG: PARKED`.
   - If the CLI invocation fails (e.g., `adev verify` not yet available in this environment), skip this step (non-blocking).
   - Report to user: "Updated issue `<id>` — closed with high confidence (tests pass, spec compliant)."
