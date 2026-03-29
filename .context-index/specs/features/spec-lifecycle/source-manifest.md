# Live Spec: Source Manifest

---
charter: spec-lifecycle
status: implemented
risk_level: medium
milestone: v1
revision: 1
charter-revision: 1
created: 2026-03-27
updated: 2026-03-28
---

## Behavioral Contract

### Preconditions

- A spec exists with a plan that lists files to touch per task
- The implementing files exist on disk (post-GREEN phase)
- Node.js `crypto` and `fs` built-ins are available

### Behaviors

1. **When** `/adev-implement` completes all tasks for a spec and tests pass (GREEN) **then** it reads the plan's file list, computes a SHA-256 hash of the concatenated sorted file contents, and stamps a `source-manifest` block in the spec's frontmatter.

2. **When** `computeManifest(filePaths)` is called **then** it validates that all paths resolve inside the project root (rejects any path resolving outside with `PATH_OUTSIDE_ROOT`), reads each file, computes a SHA-256 hash per file, sorts the per-file hashes alphabetically, hashes the sorted hash list to produce the final SHA, and returns `{ sha: <first 7 chars>, files: [<sorted paths>], computedAt: <ISO timestamp> }`. The per-file hashing avoids content-boundary collision risks from naive concatenation. The truncated SHA is for readability only, not cryptographic integrity.

3. **When** `verifyManifest(manifest)` is called **then** it re-reads the files listed in `manifest.files`, recomputes the SHA using the same algorithm, and returns `{ matches: <boolean>, currentSha: <string> }`.

4. **When** `verifyManifest` is called and a file in `manifest.files` no longer exists **then** it returns `{ matches: false, currentSha: null, missingFiles: [<paths>] }`.

5. **When** `/adev-validate` runs on a spec with a `source-manifest` **then** it calls `verifyManifest` and reports whether code matches the spec's last known state.

6. **When** `/adev-status` reports on a spec with a `source-manifest` **then** it calls `verifyManifest` and displays match/drift status.

7. **When** a spec has no `source-manifest` block **then** `/adev-status` and `/adev-validate` report "no source manifest — spec may not be implemented" rather than failing.

### Postconditions

- Source manifest `sha` is deterministic: identical file contents always produce the same hash
- `source-manifest` block in frontmatter contains `sha`, `files`, and `computed-at`
- `lib/source-manifest.mjs` exports `computeManifest` and `verifyManifest` as named exports

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| One or more files in plan do not exist at compute time | `computeManifest` throws with list of missing files | FILES_NOT_FOUND |
| File path resolves outside project root | `computeManifest` throws with the offending path | PATH_OUTSIDE_ROOT |
| File in manifest deleted after compute | `verifyManifest` returns `{ matches: false, missingFiles: [...] }` | — (drift) |
| Empty file list passed to `computeManifest` | Returns `{ sha: null, files: [], computedAt: <timestamp> }` | — (no-op) |
| File read permission denied | `computeManifest` throws with the filesystem error | READ_ERROR |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Uses only `crypto.createHash('sha256')` and `fs.readFile` from Node.js built-ins.
- **Principle:** "Pure ESM" — `lib/source-manifest.mjs` is an ESM module with named exports.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create `lib/source-manifest.mjs` | Implement `computeManifest` and `verifyManifest` functions | medium |
| Update `adev-implement/SKILL.md` | Add source manifest computation after GREEN phase | small |
| Update `adev-validate/SKILL.md` | Add source manifest verification step | small |
| Write tests for `lib/source-manifest.mjs` | Test compute, verify, missing files, empty list, determinism | medium |

## Acceptance Criteria

- [ ] `computeManifest([filePaths])` returns `{ sha, files, computedAt }` with deterministic SHA
- [ ] `verifyManifest(manifest)` returns `{ matches, currentSha }` comparing current vs stored SHA
- [ ] Missing files during verify return `{ matches: false, missingFiles: [...] }`
- [ ] Same file contents always produce the same SHA regardless of call order
- [ ] `/adev-implement` stamps `source-manifest` in spec frontmatter after GREEN
- [ ] `/adev-validate` checks source manifest and reports match/drift
- [ ] `lib/source-manifest.mjs` uses only Node.js built-ins
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
