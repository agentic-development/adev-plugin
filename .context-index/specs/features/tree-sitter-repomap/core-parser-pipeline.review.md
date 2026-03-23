# Architecture Review: core-parser-pipeline

> **Date:** 2026-03-23
> **Spec:** .context-index/specs/features/tree-sitter-repomap/core-parser-pipeline.md
> **Charter:** .context-index/specs/features/tree-sitter-repomap/charter.md
> **Verdict:** PASS_WITH_NOTES

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) [Postconditions, dependency-graph.json schema]: Edge `type` field has no enumerated values. Downstream consumers need to know valid types (e.g., `import`, `require`, `re-export`, `dynamic-import`). **Recommendation:** Add enumeration of valid edge types.

- **SA-2** (warning) [Behavior #4]: Bare/package specifiers (e.g., `import express from 'express'`) are not addressed. External imports could create phantom nodes corrupting PageRank. **Recommendation:** Explicitly state that unresolvable imports are excluded from the graph.

- **SA-3** (warning) [Task Map]: Grammar WASM acquisition, storage, and caching are not covered. The pipeline cannot run in tree-sitter mode without grammars, but no behavior or error case addresses this. **Recommendation:** Scope grammar acquisition out of this spec and reference which spec will own it, or add behaviors.

- **SA-4** (suggestion) [Postconditions, symbol-ranks.json]: "Reference count" is ambiguous — could mean import-site references or usage-site references. **Recommendation:** Define as "number of distinct files that import the symbol."

- **SA-5** (suggestion) [Behavior #3]: Valid `kind` values not enumerated. Different languages have different export constructs. **Recommendation:** Define canonical `kind` vocabulary.

- **SA-6** (suggestion) [Behavior #5]: Degenerate graph topologies (1-2 files) not addressed. **Recommendation:** Note baseline behavior for trivial graphs.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning) [Preconditions/Behavior #3]: Glob patterns from `manifest.yaml` could resolve paths outside the project root via symlinks. **Recommendation:** Add path containment check — all resolved paths must be within project root.

- **SEC-2** (suggestion) [Output artifacts]: Confirm `.context-index/hygiene/` is gitignored by default to avoid exposing architecture details in public repos. **Recommendation:** Verify existing scaffolding covers this. (Note: `/adev-init` already adds this to `.gitignore`.)

- **SEC-3** (suggestion) [Error cases]: Error messages include file paths verbatim. Low risk in local context. **Recommendation:** No action needed for current scope.

## Consistency Analyzer

**Verdict:** PASS_WITH_NOTES

- **CON-1** (warning) [Task Map]: File names missing `lib/repomap/` prefix (e.g., `parse.mjs` vs `lib/repomap/parse.mjs`). **Recommendation:** Use fully qualified paths to match charter conventions.

- **CON-2** (warning) [Behaviors/Postconditions]: Output directory `.context-index/hygiene/` is assumed but not explicitly defined in the charter. **Recommendation:** Call out as a deliberate decision, or update charter.

- **CON-3** (suggestion) [Postconditions]: Spec uses `Parser: web-tree-sitter` but charter defines parser mode as `tree-sitter`. **Recommendation:** Use `Parser: tree-sitter` to match charter terminology.

- **CON-4** (suggestion) [Postconditions]: `generated` and `commit` fields lack explicit type annotations (timestamp, hash). **Recommendation:** Clarify types for documentation precision.

- **CON-5** (suggestion) [Task Map]: Checked-in fixture project (`tests/fixtures/`) is a new pattern vs existing `createTempDir()` approach. **Recommendation:** Note as intentional new pattern.

## Domain Specialists

No domain specialists configured.

---

## Summary

**Total findings:** 12 (0 blockers, 5 warnings, 7 suggestions)
**Action required:** Address warnings before planning, or accept them as-is. None are blocking.

Warnings to address:
1. SA-1: Enumerate valid edge types
2. SA-2: Define handling of external/unresolvable imports
3. SA-3: Scope grammar acquisition (own spec or add behaviors here)
4. SEC-1: Add path containment check
5. CON-1: Use fully qualified file paths in task map
