---
charter: multi-repo-workspace
status: validated
risk_level: medium
milestone: phase-2
revision: 1
charter-revision: 4
created: 2026-04-17
updated: 2026-04-17
depends-on:
  - "workspace-foundation"
  - "context-resolution"
  - "workspace-aware-specify"
tracker-ref: issue-71
---

# Live Spec: Workspace-Aware Validate

<!-- Phase 2 capability of the multi-repo-workspace charter.
     Implements Cross-Repo Validation from the Deferred Capabilities table.
     Depends on Reference Validation (Phase 1, validated). -->

## Overview

When `/adev:validate` is invoked on a spec whose `depends-on` frontmatter contains cross-repo references (`@repo-slug/spec-slug`), the skill detects the workspace via `detectWorkspace(cwd)` and resolves each reference via `resolveRef()`. The resolved sibling specs provide read-only interface context that enriches Check 2 (Spec Compliance) and Check 3 (Charter Consistency).

Single-repo behaviour is fully preserved when no workspace is detected.

## Acceptance Criteria

### AC-1: Workspace Detection Gate

When `/adev:validate --spec <path>` is invoked, before running the 12 checks, call `detectWorkspace(cwd)` (from `lib/workspace.mjs`). If the result is non-null and the spec's `depends-on` array contains at least one cross-repo reference (pattern: `@<repo-slug>/<spec-slug>`), enter **workspace-aware validation mode**. Otherwise proceed with the existing single-repo flow unchanged.

### AC-2: Cross-Repo Reference Resolution

For each cross-repo reference in `depends-on`, call `resolveRef(workspaceRoot, ref)` to obtain the absolute path to the sibling spec file. Read the resolved spec's content (frontmatter + body). Collect all resolved specs into a `crossRepoDeps` context object for use by subsequent checks.

### AC-3: Unresolvable References Produce Warnings

If `resolveRef()` returns `null` for a cross-repo reference (repo not in workspace registry, or spec file not found), emit a **warning** (not a blocking error). The warning must include the unresolvable reference string. Validation continues with the remaining resolvable references.

### AC-4: Check 2 (Spec Compliance) — Cross-Repo Interface Verification

When workspace-aware validation mode is active and `crossRepoDeps` is non-empty, Check 2 gains an additional sub-step: for each acceptance criterion that references behaviour defined in a cross-repo dependency spec, verify that the implementation respects the interface contracts (API signatures, data shapes, event payloads) described in the dependency spec. Record findings per criterion as PASS / FAIL / PARTIAL with references to both the local code and the dependency spec.

### AC-5: Check 3 (Charter Consistency) — Cross-Repo Dependency Context

When workspace-aware validation mode is active, Check 3 includes the cross-repo dependency specs as additional scope context. The validator must verify that the implementation does not assume interfaces or behaviours from sibling repos that are not documented in the dependency specs. Undocumented cross-repo assumptions are flagged as WARN.

### AC-6: Sibling Repo Content is Read-Only

Cross-repo spec content is used strictly as read-only reference material. The validate skill must never write to, modify, or suggest modifications to files in sibling repos. This invariant aligns with the charter's Isolation quality attribute.

### AC-7: Cross-Repo Validation Report Section

The validation report gains a new section between Check 3 and Check 4:

```markdown
## Cross-Repo Dependency Validation — PASS | WARN | N/A
- [@repo-slug/spec-slug]: Resolved — interface contracts verified (PASS | FAIL | PARTIAL)
- [@repo-slug/spec-slug]: WARN — reference unresolvable (repo not in workspace)
- N/A — no cross-repo depends-on references
```

This section is purely informational when all references resolve, or WARN when any reference is unresolvable. It does not introduce a new numbered check — it is an addendum to Checks 2 and 3.

### AC-8: Single-Repo Backward Compatibility

When `detectWorkspace(cwd)` returns `null`, or when the spec's `depends-on` contains no cross-repo references, the entire workspace-aware validation path is skipped. All 12 checks behave identically to pre-workspace behaviour. No new output, no new warnings, no performance overhead beyond the single `detectWorkspace()` call.

## Input Hardening

- Cross-repo spec paths returned by `resolveRef()` must be validated with `assertPathInWorkspace(workspaceRoot, resolvedPath)` before reading. Any path that escapes the workspace root is rejected with a warning (not a blocking error).
- Sibling spec file reads are capped at 512 KB per file via `readCappedText` semantics. Files exceeding the cap produce a warning and are skipped.

## Non-Goals

- This spec does not add cross-repo checks to Checks 4-12. Only Checks 2 and 3 are enriched with cross-repo context.
- This spec does not introduce a new numbered check. The cross-repo validation report section is an addendum, not a 13th check.
- This spec does not validate sibling repo implementations — only their spec contracts are used as reference.

## Repo-Mode-Inside-Workspace Advisory

When `detectWorkspace(cwd)` returns non-null but the current working directory is inside a registered repo (not the workspace root), and the spec has no cross-repo `depends-on` references, emit an advisory to stdout (once per invocation): `"Advisory: running repo-scoped inside workspace — cross-repo validation skipped (no cross-repo depends-on references)."` This is informational only and does not affect validation behaviour.
