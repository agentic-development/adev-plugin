# Check 1.5: Source Manifest Verification

If the spec's frontmatter contains a `source-manifest` block (stamped by `/adev:implement`), verify it:

1. Parse the `source-manifest` block from the spec's frontmatter. The block is an object with fields `sha`, `files`, and `computedAt`.
2. Call `verifyManifest(manifest, projectRoot)` from `lib/source-manifest.mjs`, passing the parsed manifest object and the project root path (NOT the spec file path). The function returns `{ matches: bool, currentSha: string|null, missingFiles?: string[] }`. SHA comparison uses SHA-256 of file contents.
3. **Implementation existence check:** For each file in the manifest, verify it has been committed to git (`git log --oneline -1 -- <file>`). If a file exists on disk but has NEVER been committed (untracked or only staged), it was not implemented through the normal workflow — record FAIL with: "Source file `<file>` exists but was never committed. Implementation may be incomplete or was not committed."
4. Report results:
   - **Match:** All source files are unchanged since implementation AND all files are git-tracked. Record PASS.
   - **Drift:** One or more files have been modified since the manifest was stamped. List each drifted file with its expected and actual SHA. Record WARN (does not cause overall FAIL, but signals that source may have diverged from the spec contract).
   - **Missing files:** Source files in the manifest that no longer exist on disk. Record FAIL.
   - **Untracked files:** Source files exist but were never committed. Record FAIL (implementation incomplete).

If the spec has no `source-manifest` block, skip this check with a note: "No source manifest found. Run /adev:implement to stamp one."

This check runs after quality gates (Check 1) regardless of their result, since it is a metadata check, not a code quality check.
