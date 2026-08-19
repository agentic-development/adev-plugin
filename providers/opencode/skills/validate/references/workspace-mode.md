## Workspace-Aware Validation Mode

Before running the 12 checks, call `detectWorkspace(cwd)` from `lib/workspace.mjs`.

**If `detectWorkspace(cwd)` returns `null`** (no workspace detected), skip all workspace-aware logic. All 12 checks behave identically to single-repo behaviour. No new output, no new warnings, no performance overhead beyond the single `detectWorkspace()` call.

**If a workspace is detected** and the spec's `depends-on` frontmatter array contains at least one cross-repo reference matching the pattern `@<repo-slug>/<spec-slug>`, enter **workspace-aware validation mode**:

1. For each cross-repo reference in `depends-on`, call `resolveRef(workspaceRoot, ref)` to obtain the absolute path to the sibling spec file.
2. Validate each resolved path with `assertPathInWorkspace(workspaceRoot, resolvedPath)` before reading. Any path that escapes the workspace root is rejected with a warning (not a blocking error).
3. Read each resolved sibling spec (capped at 512 KB per file via `readCappedText` semantics — files exceeding the cap produce a warning and are skipped).
4. Collect all successfully resolved specs into a `crossRepoDeps` context object for use by Checks 2 and 3.

**Unresolvable cross-repo references:** If `resolveRef()` returns `null` for a cross-repo reference (repo not in workspace registry, or spec file not found), emit a **warning** — not a blocking error. The warning must include the unresolvable reference string. Validation continues with the remaining resolvable references.

**Sibling repo content is read-only reference.** Cross-repo spec content is used strictly as read-only reference material. The validate skill must never write to, modify, or suggest modifications to files in sibling repos.

**Repo-mode-inside-workspace advisory:** When `detectWorkspace(cwd)` returns non-null but the spec has no cross-repo `depends-on` references, emit an advisory to stdout (once per invocation): `"Advisory: running repo-scoped inside workspace — cross-repo validation skipped (no cross-repo depends-on references)."` This is informational only and does not affect validation behaviour.
