## Audit Pass 14: Code Provenance

**Goal:** Classify all source files by their git provenance — whether commits that touched them carry lifecycle trailers (`Spec:`, `Plan-task:`, `Issue:`, `Author-type:`).

**Steps:**

1. Identify all source files under `lib/`, `hooks/`, `cli/`, and `tests/` (or project-specific source directories from `platform-context.yaml`).
2. For each file, run `git log --format='%(trailers)' -- <file>` to extract trailers from all commits.
3. Classify each file into one of three categories:
   - **Fully traced**: ALL commits have `Spec:` and `Plan-task:` trailers → linked to the lifecycle
   - **Partially traced**: SOME commits have `Spec:` trailers, later ones don't → post-implementation drift
   - **Untraced**: NO commits have `Spec:` trailers → written entirely outside the lifecycle
4. For untraced files, cross-reference file names and content keywords against charter Capability Map entries marked as v2/future/nice-to-have. Flag potential matches.
5. Use `buildReverseIndex()` from `lib/source-manifest.mjs` to identify which files are claimed by source manifests.
6. For partially traced files, identify the most recent untracked commit and report it.

**Bootstrapping note:** Distinguish between "pre-pipeline commits" (before trailers were active in the repo) and "post-pipeline untracked commits" (written after trailers were available). Use the first commit with any trailer as the cutoff date. Commits before this date are labeled "pre-pipeline" and excluded from the untracked count.

**Status mapping:**

| Condition | Status |
|-----------|--------|
| All files fully traced | PASS |
| Some files partially traced (post-impl drift) | WARN |
| Post-pipeline untraced files exist | FAIL |
| Only pre-pipeline untraced files | WARN |

**Output format:**
```
## Code Provenance

Scanned: N source files, M commits

| Category | Count | Files |
|----------|-------|-------|
| Fully traced | N | lib/login.mjs, ... |
| Partially traced | N | lib/drifted.mjs (2 untracked commits), ... |
| Untraced (post-pipeline) | N | lib/orphan.mjs, ... |
| Untraced (pre-pipeline) | N | ... |

**Capability matches for untraced files:**
- lib/orphan.mjs → may implement "SSO Integration" (auth charter, v2)

**Actions:**
- [ ] Review N partially traced files for spec updates
- [ ] Create specs or mark N untraced files as intentionally untracked
```

**Integration with summary table:**
```
| Code Provenance | WARN | 2 drifted, 3 untraced |
```
