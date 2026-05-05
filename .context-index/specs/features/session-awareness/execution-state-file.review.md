# Architecture Review: execution-state-file

> **Date:** 2026-04-06
> **Spec:** .context-index/specs/features/session-awareness/execution-state-file.spec.md
> **Charter:** .context-index/specs/features/session-awareness/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** 1c98066bd81f3107eaf6e182893c7737ddf2d345

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — **YAML Frontmatter Schema:** The frontmatter uses kebab-case keys (`plan-ref`, `current-task`, `issue-binding`, `next-action`) while the Behavioral Contract and charter Domain Model use camelCase (`planRef`, `currentTask`, `issueBinding`, `nextAction`). No explicit key-mapping is defined. **Recommendation:** Add a key-mapping table in the File Format section, or standardize on one casing.

- **SA-2** (suggestion) — **Behavioral Contract, Behavior 7:** When `status: "idle"`, `planRef`, `currentTask`, and `issueBinding` are cleared, but `blockers` and `nextAction` are not mentioned. Stale values could confuse consumers. **Recommendation:** Clarify whether `blockers` and `nextAction` are also cleared on idle.

- **SA-3** (suggestion) — **Error Cases, Atomic rename fails:** Spec says temp file is "cleaned up" on rename failure but does not specify behavior if cleanup itself fails. **Recommendation:** Add a note that cleanup is best-effort (errors during cleanup are swallowed).

- **SA-4** (suggestion) — **File Format, Progress Body:** The `(current)` marker in the progress checklist is a semantic convention that `readExecutionState` presumably must parse, but the Behavioral Contract only returns `{task, done}` objects. **Recommendation:** Either drop `(current)` (since `current-task` in frontmatter identifies it) or add a `current` boolean to the progress object schema.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning) — **input-validation:** The `projectRoot` parameter is not validated against path traversal. A crafted relative path could cause reads/writes outside the intended project. **Recommendation:** Specify that `projectRoot` must be resolved to an absolute path; reject relative paths as a precondition.

- **SEC-2** (warning) — **input-validation:** Free-form string fields (`blockers`, `nextAction`, `planRef`) are written into hand-rolled YAML frontmatter without sanitization. Values containing `---` or newlines could corrupt the frontmatter. **Recommendation:** Specify that the serializer must escape or reject newlines and `---` sequences in field values.

- **SEC-3** (warning) — **data-exposure:** The file stores filesystem paths and issue IDs and is declared a "public contract." In shared or version-controlled directories, this could leak internal structure. **Recommendation:** Specify whether `.execution-state.md` should be added to `.gitignore` by default.

- **SEC-4** (suggestion) — **input-validation:** Task descriptions in the progress body originate from plan text and could contain markdown metacharacters. **Recommendation:** Specify that task descriptions are serialized as plain text with markdown characters escaped.

- **SEC-5** (suggestion) — **input-validation:** The temp file name entropy size is unspecified. **Recommendation:** Specify at least 16 bytes of random entropy for temp file names, consistent with `file-adapter.mjs` precedent.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning) — **naming:** YAML frontmatter uses kebab-case (`plan-ref`, `current-task`) while the constitution specifies camelCase for variables and the charter Domain Model uses camelCase (`planRef`, `currentTask`). **Recommendation:** Align YAML keys to camelCase to match domain model conventions.

- **CON-2** (warning) — **contract:** The spec defines function exports but does not document how consumers (skills, hooks) discover and import them. **Recommendation:** Add consumer guidance or an explicit import path note.

- **CON-3** (suggestion) — **pattern:** `readExecutionState` return semantics are well-defined, but `writeExecutionState` does not specify its return value on success. **Recommendation:** Clarify return value (e.g., `undefined`, the written state object, or `true`).

- **CON-4** (suggestion) — **terminology:** `planRef` path format is ambiguous — could be absolute, relative from projectRoot, or relative from `.context-index/`. **Recommendation:** Specify the expected path format in the YAML Frontmatter Schema section.

- **CON-5** (suggestion) — **domain-model:** The `progress` field is listed as an ExecutionState attribute in the charter but stored only as a markdown body, not YAML frontmatter. The parsing strategy (derived from body on read) should be made explicit. **Recommendation:** Document that `progress` is parsed from the markdown body and returned as a structured array by `readExecutionState()`.

## Domain Specialists

No domain specialists matched.

---

## Summary

**Total findings:** 14 (0 blockers, 6 warnings, 8 suggestions)
**Action required:** The spec passed with notes. The most impactful warnings cluster around the kebab-case vs camelCase gap between file format and domain model (SA-1, CON-1) and input sanitization for hand-rolled YAML (SEC-2). Address these before or during planning; they do not block proceeding.
