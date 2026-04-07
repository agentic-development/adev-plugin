# Architecture Review: session-start-resume

> **Date:** 2026-04-06
> **Spec:** .context-index/specs/features/session-awareness/session-start-resume.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 70df8c35d4cb739530ec13922e2d3783144c1746

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — **Resume Block Format > Active State:** The spec does not explicitly state where the progress checklist is sourced from within the execution state file. The sibling spec (execution-state-file.md) defines a markdown body with a `## Progress` section containing checkboxes, but this spec's resume block builder needs to reference that structure explicitly. **Recommendation:** Add a note in "Resume Block Format" or "Implementation Approach" stating that progress is sourced from the execution state file's markdown body (the `progress` array returned by `readExecutionState`).

- **SA-2** (suggestion) — **Behavioral Contract > Behavior 5:** "Malformed" is not precisely defined. A file with valid YAML but an unrecognized `status` value (e.g., `status: completed`) has ambiguous behavior. **Recommendation:** Add a clarification: "Any execution state file that cannot be parsed or has a `status` value other than `active`, `blocked`, or `idle` is treated as malformed."

- **SA-3** (suggestion) — **Postconditions / Resume Block Format:** The `\n---\n` separator between skill content and resume block could collide with the resume block's own YAML frontmatter opening fence. **Recommendation:** Document that the separator is intentionally the opening fence of the resume block's frontmatter (i.e., no separate separator needed — just a newline before the resume block's `---`), or use `\n\n---\n\n` to distinguish it as a markdown horizontal rule.

- **SA-4** (suggestion) — **System Constitution Reference:** The spec references `session-capture.sh` as a pattern to follow, but this is an implicit dependency not listed in the charter's dependencies table. Informational only.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning) — **Input Validation:** The resume block content from `.execution-state.md` is concatenated directly into `additionalContext` without length constraints. An oversized or adversarially crafted file could inject excessive content into the agent's context window. **Recommendation:** Specify a maximum field length for string fields and/or a document-level size cap (e.g., reject files over 64 KB) in `readExecutionState` or the resume block builder.

- **SEC-2** (warning) — **Data Exposure:** Execution state fields (`issueBinding`, `planRef`, `nextAction`, `blockers`) are injected into `additionalContext`, which may be logged or stored in session transcripts. The spec does not classify which fields may contain sensitive project data. **Recommendation:** Add a note identifying data classification for execution state fields surfaced in context output.

- **SEC-3** (suggestion) — **Input Validation (hardening):** A file that parses successfully but has missing or wrong-typed fields could produce a resume block with empty or undefined values without triggering the malformed fallback. **Recommendation:** Define required fields and expected types for a state file to be considered valid; treat field-level validation failures as malformed.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (suggestion) — **Terminology (Postconditions):** The `\n---\n` separator could be confused with YAML frontmatter markers inside the resume block format. **Recommendation:** Clarify that the separator is a markdown horizontal rule used to visually separate skill content from the resume block.

## Domain Specialists

No specialists registered in manifest.yaml. No domain specialist reviews dispatched.

---

## Summary

**Total findings:** 8 (0 blockers, 3 warnings, 5 suggestions)
**Action required:** The spec passed with notes. The warnings (SA-1, SEC-1, SEC-2) are worth addressing before planning but are not blocking. SA-1 (progress source) is the most important to clarify for implementers. SEC-1 and SEC-2 are reasonable hardening suggestions given that `additionalContext` is treated as trusted agent input.
