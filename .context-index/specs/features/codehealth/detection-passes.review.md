# Architecture Review: detection-passes

> **Date:** 2026-04-02
> **Spec:** .context-index/specs/features/adev:codehealth/detection-passes.md
> **Charter:** .context-index/specs/features/adev:codehealth/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** f625c30391a190e309225bbc0b496899aa15d364

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1 (warning):** `require()` scanning in pure ESM project. **Acknowledged** — included for compatibility with consumer projects.
- **SA-2 (warning → fixed):** Two different file scopes across passes. **Fixed** — added postcondition clarifying dependency-graph-scoped vs file-system-scoped passes.
- **SA-3 (suggestion):** Re-export edge direction ambiguous. Acknowledged — implementation will check `edge.to` matching file path.
- **SA-4 (suggestion):** "Incoming edges" semantics could be more precise. Acknowledged.
- **SA-5 (warning → fixed):** Duplicate logic pass assumed pre-computed AST hashes that don't exist in repomap. **Fixed** — Behavior 16 now specifies runtime tree-sitter parsing of source files.
- **SA-6 (suggestion):** Artifact paths not repeated from preconditions spec. Intentional — preconditions spec owns path resolution.

## Security Reviewer

**Verdict:** PASS

- **SEC-1 (warning):** `--module` path traversal. Handled by preconditions spec validation.
- **SEC-2 (warning):** Reports should contain metadata only, not source snippets. Aligned with charter scope (report only).
- **SEC-3 (warning):** `--pass` allowlist. Specified in preconditions spec.
- **SEC-4 (suggestion):** `git log` should extract only structured metadata. Acknowledged.
- **SEC-5 (suggestion):** Schema validation for dependency-graph.json. Covered by FORMAT_ERROR error case.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1 (warning):** Severity taxonomy not centralized in charter. Acknowledged — charter invariant states "high, medium, low — never omitted."
- **CON-2 (warning):** Repomap artifact schema not formally defined. Spec preconditions describe expected fields.
- **CON-3 (warning):** Error code registry not unified. Deferred — each spec's error codes are self-consistent.
- **CON-6 (warning):** Finding schema has optional fields (line_number, symbol). **Fixed** in report-generation spec.
- **CON-8 (warning):** Unused-deps import scanning approach unclear vs repomap data. **Acknowledged** — dependency-graph.json only tracks relative imports, not package imports. Manual scan necessary.

---

## Summary

**Total findings:** 16 (0 blockers, 5 warnings, 11 suggestions)
**Action required:** None blocking. Spec is ready for planning.
