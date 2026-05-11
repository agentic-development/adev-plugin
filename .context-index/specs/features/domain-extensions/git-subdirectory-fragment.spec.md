# Live Spec: Git Subdirectory Fragment Support

<!-- Live Spec within the domain-extensions charter.
     Defines the enhancement to resolve-source.mjs for parsing repo#path fragments.
     Parent Charter: .context-index/specs/features/domain-extensions/charter.md -->

---
charter: domain-extensions
status: review-passed
risk_level: low
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-11
updated: 2026-05-11
---

## Behavioral Contract

### Preconditions

- `lib/extensions/resolve-source.mjs` exists with the current `resolveGit()` function
- Git is on PATH

### Behaviors

1. **When** `resolveExtensionSource()` is called with a git URL containing a `#` fragment (e.g., `https://github.com/org/repo#extensions/data-engineering`) **then** it splits the URI into `repoUrl` (`https://github.com/org/repo`) and `subdir` (`extensions/data-engineering`), clones `repoUrl`, and resolves the extension from `<cloneDir>/<subdir>/`.

2. **When** `resolveExtensionSource()` is called with a git URL without a `#` fragment **then** it behaves identically to the current implementation — clones the repo and looks for `adev-extension.yaml` at the repo root.

3. **When** the subdirectory path after `#` does not exist in the cloned repo **then** it throws a `SOURCE_RESOLUTION` error with a message indicating the subdirectory was not found.

4. **When** the subdirectory exists but does not contain `adev-extension.yaml` **then** it throws a `MISSING_MANIFEST` error (existing behavior, applied to the subdirectory).

5. **When** the `#` fragment contains path traversal segments (`..`) and the resolved path (`path.resolve(cloneDir, subdir)`) does not start with `cloneDir` **then** `resolveExtensionSource()` throws a `SOURCE_RESOLUTION` error indicating the path escapes the clone directory.

6. **When** `classifyUri()` is called with a URL containing `#` **then** it still classifies as `git` (the fragment does not affect classification).

7. **When** `stripCredentials()` is called with a URL containing `#` **then** the fragment is preserved in the stripped output.

### Postconditions

- Extensions hosted in monorepo subdirectories are installable via git URL
- Existing git URL behavior (no fragment) is unchanged
- Path traversal is blocked

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Subdirectory does not exist in cloned repo | Error with subdirectory path in message | `SOURCE_RESOLUTION` |
| Subdirectory exists but no `adev-extension.yaml` | Existing manifest check applies | `MISSING_MANIFEST` |
| Path traversal via `..` in fragment | Error blocking escape from clone directory | `SOURCE_RESOLUTION` |

## System Constitution Reference

- **"Minimize external dependencies"** — Uses only `path.resolve()` and `path.join()` for path handling. No new dependencies.
- **"Pure ESM"** — Change is within existing `.mjs` module.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Parse fragment in `resolveGit()` | Split URI on `#`, pass `repoUrl` to `git clone`, resolve `subdir` after clone | small |
| Add path traversal guard | Validate resolved path stays within clone directory | small |
| Update tests | Add test cases for fragment parsing, missing subdir, traversal, and no-fragment backward compat | medium |

## Acceptance Criteria

- [ ] `resolveExtensionSource("https://...repo#extensions/data-engineering")` resolves to the subdirectory
- [ ] `resolveExtensionSource("https://...repo")` (no fragment) works as before
- [ ] Missing subdirectory throws `SOURCE_RESOLUTION`
- [ ] Path traversal (`..`) in fragment is blocked
- [ ] `classifyUri()` still returns `git` for URLs with fragments
- [ ] `stripCredentials()` preserves the fragment
- [ ] All existing resolve-source tests continue to pass
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
