## Step 5: Update Spec Status and Source Manifest

> Legal status values are defined in `lib/spec-status.mjs::SPEC_STATUSES`. The
> `adev/status-enum-legal` diagnostic enforces this enum at write time.

After all tasks are complete and before reporting completion:

1. Read the spec file that this plan implements (the plan file references the spec)
2. Parse YAML frontmatter
3. Update status: `review-passed` → `implemented`
4. **Compute source manifest:** Collect all source files produced by this implementation, then call the CLI to compute a deterministic SHA-256 manifest. Stamp the result as a `source-manifest` block in the spec's YAML frontmatter.

   **Collecting the file list:** Walk each task in the plan and collect every file listed under `Files: Modify:` and `Files: Create:` (exclude `Files: Reference:` — those are read-only context). Deduplicate and sort. These are project-root-relative paths (e.g., `lib/milestones.mjs`, not absolute paths).

   **Invocation:**
   ```bash
   adev source-manifest compute --files <comma-separated-paths>
   ```

   Example:
   ```bash
   adev source-manifest compute --files lib/feature.mjs,tests/feature.test.mjs
   ```

   Stdout is a single-line JSON object matching `computeManifest()`'s return shape: `{ sha, files, computedAt }`. The `sha` is the first 7 characters of the composite SHA-256. The `files` array is sorted ascending. The `computedAt` is an ISO 8601 timestamp. Pass `--out <path>` to write the JSON to a file instead of stdout (the file is created with `mkdir -p` semantics for the parent directory). Exit codes: `0` on success, `1` on argument error, missing source file, or path traversal.

   Write the returned manifest into the spec's YAML frontmatter:
   ```yaml
   source-manifest:
     sha: "abc1234"          # first 7 chars of composite SHA-256
     files:
       - lib/feature.mjs
       - tests/feature.test.mjs
     computed-at: "2026-04-01T10:00:00.000Z"
   ```
5. Write the spec file back.

   **Incremental authoring for source-manifest stamping (`.partial` pattern):** When the spec file is non-trivial (~ 2 KB or larger, which is the common case for any reviewed Live Spec), the frontmatter rewrite MUST follow the `.partial` + atomic-rename protocol from `incremental-artifact-writes.spec.md`. Write the updated spec body to `<spec-path>.partial` with a `partial_schema: implement@1` marker in the first authored chunk (the chunk that carries the new frontmatter), then atomically rename to `<spec-path>` once the write completes. Use the existing artifact-commit CLI verb (`adev artifact commit ...`) which already implements the `.tmp` byte-level atomic-rename idiom — the `.partial` layer applies when the rewrite is performed by an agent over multiple Write calls rather than a single fs operation. On a mid-rewrite crash, the next `/adev:implement` invocation detects the partial and resumes.

   **Runaway-write guard:** Before each Write to the spec's `.partial`, run `adev partial check-size --artifact <spec-path>` to verify the in-progress rewrite has not exceeded `partial_oversize_multiplier × expected` bytes (defaults: 3× max(prior spec size, 50 KB)). Exit code 2 with `PARTIAL_ARTIFACT_OVERSIZE` is a hard stop: do NOT continue rewriting, do NOT commit the rename, surface the error to the user. Protects against retry loops re-writing prior chunks.

6. **Clear drift flag:** After re-stamping the source manifest, clear any drift flag on the spec:
   ```javascript
   const { clearDrift } = await import('<ADEV_ROOT>/lib/spec-drift.mjs');
   await clearDrift(specPath);
   ```
   If `clearDrift()` fails (e.g., write error), log a warning but do not block implementation completion.
7. **Update charter Capability Map:** Read the parent charter and update the Capability Map. For each capability covered by this spec, set its `Status` column to `implemented`.
8. Log: "Updated spec status: review-passed → implemented"
