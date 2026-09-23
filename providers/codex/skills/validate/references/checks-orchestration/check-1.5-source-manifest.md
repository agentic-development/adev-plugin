### Check 1.5: Source Manifest Verification

If the spec's frontmatter contains a `source-manifest` block (stamped by `/adev:implement`), verify it via the CLI:

```bash
adev source-manifest verify --spec <spec-path>
```

The verb parses the `source-manifest` block from the spec's frontmatter (fields `sha`, `files`, and `computed-at`) and delegates to `verifyManifest(manifest, projectRoot)` from `lib/source-manifest.mjs` — passing the parsed manifest object and the project root path (NOT the spec file path). SHA comparison uses SHA-256 of file contents. The function returns `{ matches: bool, currentSha: string|null, missingFiles?: string[] }`; the verb classifies the result into one of the four outcomes below. Stdout is a single line; exit code follows the outcome.

| Outcome | Stdout shape | Exit | Validator verdict |
|---------|--------------|------|--------------------|
| Match — all listed files unchanged since stamping | `Check 1.5: PASS — source manifest matches (sha: <sha>)` | 0 | PASS |
| Drift — one or more files modified since stamping | `Check 1.5: WARN — source manifest drifted (...). Files: <list>` | 0 | PASS_WITH_NOTES (does not block) |
| Missing file — a listed file no longer exists on disk | `Check 1.5: FAIL — missing source files: <list>` | 1 | FAIL |
| No manifest block — spec has not been implemented yet | `Check 1.5: SKIP — no source manifest found. Run /adev:implement to stamp one.` | 0 | SKIP |

Pass `--quiet` to suppress the PASS / SKIP stdout line (errors and WARN are still emitted). The validator should still emit a `validator_report` event per Check 1.5 outcome via `adev report --type validator --validator validate.check-1.5-source-manifest`.

**Implementation existence check (post-CLI, validator-side):** For each file in the manifest, verify it has been committed to git (`git log --oneline -1 -- <file>`). If a file exists on disk but has NEVER been committed (untracked or only staged), it was not implemented through the normal workflow — record FAIL with: "Source file `<file>` exists but was never committed. Implementation may be incomplete or was not committed." The CLI does not perform this git-tracked check (it only inspects file content vs. SHA); the validator wraps it around the CLI call.

This check runs after quality gates (Check 1) regardless of their result, since it is a metadata check, not a code quality check.
