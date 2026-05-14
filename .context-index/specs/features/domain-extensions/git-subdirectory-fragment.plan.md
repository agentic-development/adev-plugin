<!-- DO NOT EDIT statuses inline — see lifecycle log git-subdirectory-fragment.jsonl -->
# Implementation Plan: Git Subdirectory Fragment Support

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-extensions/charter.md
> **Spec:** .context-index/specs/features/domain-extensions/git-subdirectory-fragment.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-11)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Enable `resolveExtensionSource()` to parse `repo#path` fragments in git URLs, cloning the repo and resolving extensions from subdirectories.

**Architecture:** Minimal change to `resolveGit()` in `lib/extensions/resolve-source.mjs`. Split URI on `#`, clone the repo URL, then resolve into the subdirectory. Add path traversal guard using `path.resolve()` containment check. Follows the same pattern as `assertContained()` in `lib/extensions/register.mjs`.

---

## File Structure

**Modify:**
- `lib/extensions/resolve-source.mjs` — Add fragment parsing to `resolveGit()`, path traversal guard
- `tests/lib/extensions/resolve-source.test.mjs` — Add test cases for fragment, missing subdir, traversal, backward compat

**Reference (read, do not modify):**
- `lib/extensions/register.mjs:81-88` — `assertContained()` pattern for path containment
- `.context-index/specs/features/domain-extensions/git-subdirectory-fragment.spec.md` — Behavioral contract

## Context Packets

### Task 1 Context
- Spec: `git-subdirectory-fragment.spec.md` (behaviors 1-5)
- Source: `lib/extensions/resolve-source.mjs` (full read — `resolveGit()` at line 159)
- Pattern: `lib/extensions/register.mjs:81-88` (`assertContained()` for path safety)

### Task 2 Context
- Spec: `git-subdirectory-fragment.spec.md` (behaviors 6-7)
- Source: `lib/extensions/resolve-source.mjs` (`classifyUri()` at line 41, `stripCredentials()` at line 64)
- Tests: `tests/lib/extensions/resolve-source.test.mjs` (existing test patterns)

## Parallelization

- Group A (sequential): Task 1 → Task 2 (shared source file)

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Fragment parsing and path traversal guard | medium | unit | — | 0 create, 2 modify |
| 2 | classifyUri and stripCredentials fragment preservation | small | unit | Task 1 | 0 create, 1 modify |

---

### Task 1: Fragment parsing and path traversal guard [specialist: none]

**Charter capability:** Git Subdirectory Fragment Support
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/extensions/resolve-source.mjs:159-183` — `resolveGit()` function
- Test: `tests/lib/extensions/resolve-source.test.mjs`

**Tests:** `tests/lib/extensions/resolve-source.test.mjs`

- [x] **Write failing tests**

Add tests for:
1. Git URL with `#subdir` resolves to `<cloneDir>/subdir/`
2. Git URL without `#` resolves to repo root (backward compat)
3. Subdirectory not found → `SOURCE_RESOLUTION` error
4. Subdirectory exists but no `adev-extension.yaml` → `MISSING_MANIFEST`
5. Path traversal `../` in fragment → `SOURCE_RESOLUTION` error

- [x] **Verify tests fail**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: FAIL — new tests reference unimplemented fragment behavior

- [x] **Implement**

In `resolveGit()`:
1. Split URI on first `#`: `const [repoUrl, subdir] = uri.split('#', 2)`
2. Clone `repoUrl` (not original `uri`)
3. If `subdir` exists, resolve: `const extensionDir = subdir ? join(cloneDir, subdir) : cloneDir`
4. Add containment check: `if (!path.resolve(extensionDir).startsWith(path.resolve(cloneDir)))` → throw `SOURCE_RESOLUTION`
5. Check `extensionDir` exists with `existsSync()`
6. Call `readAndValidateManifest(extensionDir)`

- [x] **Verify tests pass**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/extensions/resolve-source.mjs tests/lib/extensions/resolve-source.test.mjs
git commit -m "feat(extensions): add git subdirectory fragment support in resolveGit()"
```

### Task 2: classifyUri and stripCredentials fragment preservation [specialist: none]

**Charter capability:** Git Subdirectory Fragment Support
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `tests/lib/extensions/resolve-source.test.mjs`

**Tests:** `tests/lib/extensions/resolve-source.test.mjs`

**Depends on:** Task 1

- [x] **Write failing tests**

Add tests for:
1. `classifyUri("https://github.com/org/repo#extensions/data-engineering")` returns `"git"`
2. `stripCredentials("https://user:pass@github.com/org/repo#subdir")` preserves `#subdir`

- [x] **Verify tests fail or pass**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: These may already pass since `classifyUri` checks prefixes and `stripCredentials` uses URL parsing. Verify.

- [x] **Fix if needed**

If `stripCredentials()` drops the fragment, fix the URL reconstruction to preserve it.

- [x] **Verify tests pass**

Run: `node --test tests/lib/extensions/resolve-source.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add tests/lib/extensions/resolve-source.test.mjs lib/extensions/resolve-source.mjs
git commit -m "test(extensions): add fragment preservation tests for classifyUri and stripCredentials"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
