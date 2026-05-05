# Architecture Review: workspace-aware-specify

> **Date:** 2026-04-17
> **Spec:** .context-index/specs/features/multi-repo-workspace/workspace-aware-specify.spec.md
> **Charter:** .context-index/specs/features/multi-repo-workspace/charter.md
> **Verdict:** PASS_WITH_NOTES
> **last-reviewed-revision:** 1
> **file-sha:** f05f04f3c52fc8c66f1cfa4309fb7a53ab36bdf3

## Structural Architect

**Verdict:** PASS_WITH_NOTES

- **SA-1** (warning) — **Behavioral Contract, Behavior 1:** The condition `currentRepoSlug === null` is used without stating how it is derived. Readers must infer this from `lib/workspace.mjs` internals. **Recommendation:** Add a brief data-flow note: "where `currentRepoSlug` is the `slug` field returned by `detectWorkspace()`, or `null` when `cwd` is the workspace root."

- **SA-2** (warning) — **Behavioral Contract, Behavior 5 / Error Cases:** The Error Cases table assigns programmatic error codes (`INVALID_TARGET_REPO`, `INVALID_MODULE_NAME`) but this is a markdown skill — no runtime code emits these codes. **Recommendation:** Clarify that error codes are for human/agent reference only, not programmatic. Or remove the Error Code column.

- **SA-3** (suggestion) — **Preconditions:** `assertPathInWorkspace()` is listed as a precondition but never referenced in any behavior or error case. **Recommendation:** Either remove from preconditions or explicitly state which behavior uses it (likely the isolation guard, Task 5).

- **SA-4** (suggestion) — **Task Map, Task 6:** "Write SKILL.md content assertions" is ambiguous about test infrastructure. **Recommendation:** Clarify whether these are regex-based assertions (matching the pattern from `brainstorm-workspace-bootstrap.test.mjs` and `plan-workspace-mode.test.mjs`), snapshot tests, or review checklist items.

- **SA-5** (warning, downgraded from blocker) — **Behavioral Contract, Behavior 8:** The spec mentions "duplicate detection across repos and cross-repo `depends-on` suggestions" without defining what constitutes a duplicate or the reference format. **Reviewer's note:** The cross-repo reference format `@<repo-slug>/<spec-slug>` is already defined in the charter Domain Model and `cross-repo-references.md`. However, the "duplicate detection" scope in Behavior 8 is vague and could lead to implementation drift. **Recommendation:** Either define what duplicate detection entails (title match? behavioral overlap?) or remove it from Behavior 8's scope, noting it as a future enhancement.

## Security Reviewer

**Verdict:** PASS_WITH_NOTES

- **SEC-1** (warning) — **Input Validation:** `parseSimpleYaml()` extracts repo paths from `adev-workspace.yaml` without applying `assertPathInWorkspace()`. A crafted path like `../../etc/passwd` would cause `resolveWorkspaceContext()` to resolve outside the workspace tree. **Recommendation:** Apply `assertPathInWorkspace(workspaceRoot, repo.path)` in `parseWorkspaceFile()` after path resolution. *Note: This finding applies to `lib/workspace.mjs` upstream (tracked as issue-95), not to this spec directly. The spec correctly calls `resolveWorkspaceContext()` which inherits this risk.*

- **SEC-2** (warning) — **Input Validation:** `resolveRef()` does not validate `specSlug` via `validateModuleName()` before building a filename, allowing potential path traversal. **Recommendation:** Validate both `repoSlug` and `specSlug` with `validateModuleName()`. *Note: Same upstream concern as SEC-1; tracked in issue-95.*

- **SEC-3** (suggestion) — **Input Validation:** No maximum length defined for `target-repo:` input. **Recommendation:** Add a max-length guard (e.g., 128 chars) to `validateModuleName()` or the prompt validation.

- **SEC-4** (suggestion) — **Data Exposure:** Warning messages from `resolveWorkspaceContext()` may expose full filesystem paths. **Recommendation:** User-facing warnings should show only repo slugs, not absolute paths.

## Consistency Analyzer

**Verdict:** PASS (after factual correction)

- **CON-1** (not applicable, overridden) — Originally flagged as blocker claiming `validateModuleName()` and `assertPathInWorkspace()` do not exist. **Factual correction:** Both functions are exported from `lib/workspace.mjs` (lines 332-354), implemented in Epic-10 (workspace-aware-vision, fully closed). This finding is factually incorrect and is discarded.

- **CON-2** (warning) — **Behavioral Contract, Behavior 8:** The spec states the skill reads sibling repos for "duplicate detection" via `resolveWorkspaceContext()`, but `context-resolution.md` documents that this function returns paths only — no file parsing. The spec should detail what reading operations are performed and apply the same hardening patterns (size caps, path containment) used in `workspace-aware-vision.md` Behavior 8. **Recommendation:** Specify the reading operations or state that duplicate detection is limited to the workspace's own `.context-index/` (not sibling repos).

---

## Summary

**Total findings:** 10 (0 blockers, 4 warnings, 4 suggestions, 1 overridden, 1 not applicable)
**Action required:** Address warnings SA-1, SA-2, SA-5, and CON-2 before or during planning. Security warnings SEC-1/SEC-2 are upstream concerns already tracked in issue-95. The spec is ready for `/adev:plan`.
