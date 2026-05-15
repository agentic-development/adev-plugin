# Implementation Plan: Template Resolution

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/template-resolution.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SEC-1 + SA-3 resolved in rev 2)
> **Platform:** Node.js (ESM), .mjs

**Goal:** Author `lib/template-resolution.mjs` exporting `resolveTemplate(layer, kind, domain)` with path-containment guard.

**Architecture:** New peer of `lib/domains/domain-config.mjs`. Resolution order: domain override → bundled `software` default. Path-containment via `fs.realpathSync` against allowed roots (plugin `templates/` and any registered domain `extensions/<domain>/domain/`).

---

## File Structure

**Create:**
- `lib/template-resolution.mjs`
- `tests/lib/template-resolution.test.mjs`

**Reference:**
- `lib/kinds.mjs` — consumes `isValidKind`
- `lib/domains/domain-config.mjs` — consumes `loadDomainConfig()` for domain override path
- `cli/index.mjs` — for plugin root resolution

## Context Packets

### Task 1-3 Context
- Spec: template-resolution.spec.md (all 9 behaviors)
- Spec: kind-enumeration.spec.md (INVALID_LAYER vs INVALID_KIND)
- Source: `lib/domains/domain-config.mjs` (existing domain-override pattern)
- Source: `cli/index.mjs` (plugin root resolution)

## Parallelization

Tasks 1 → 2 → 3 sequential.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | resolveTemplate core resolution chain | medium | unit | kind-enumeration | 1 create |
| 2 | Path-containment guard (UNSAFE_TEMPLATE_PATH) | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Test coverage including symlink-escape | medium | unit | Tasks 1, 2 | 1 create |

---

### Task 1: Implement resolveTemplate core [specialist: none]

**Charter capability:** Template-resolution helper
**Strategy:** unit
**Files:**
- Create: `lib/template-resolution.mjs`
**Tests:** `tests/lib/template-resolution.test.mjs`

- [ ] Export `resolveTemplate(layer, kind, domain)` async function
- [ ] Validate `layer` ∈ `{'spec','charter'}` first — throw `INVALID_LAYER` if not (separate from `INVALID_KIND`)
- [ ] Validate `kind` via `isValidKind(layer, kind)` — throw `INVALID_KIND` if false
- [ ] Try domain override: call `loadDomainConfig(domain, 'spec-template-' + kind, repoRoot, pluginRoot)` (or charter-template) when `domain` is a non-null string
- [ ] Fallback: bundled default at `<pluginRoot>/templates/<layer>-template.<kind>.md`
- [ ] If neither resolves: throw `TEMPLATE_NOT_FOUND` with attempted-paths in error message
- [ ] Return the resolved absolute path
- [ ] Commit

### Task 2: Path-containment guard [specialist: none]

**Charter capability:** Template-resolution helper (SEC-1)
**Strategy:** unit
**Files:**
- Modify: `lib/template-resolution.mjs`
**Tests:** `tests/lib/template-resolution.test.mjs`
**Depends on:** Task 1

- [ ] Determine allowed roots at module load: plugin `templates/` directory + each registered extension's `domain/` directory
- [ ] Before returning, call `fs.realpathSync(candidatePath)` to follow symlinks
- [ ] Verify the realpath is a descendant of one of the allowed roots
- [ ] If escape detected: throw `UNSAFE_TEMPLATE_PATH` with the offending path in the message
- [ ] Path comparison: ensure trailing-slash safety (don't allow `templates-evil/` to match `templates/` prefix)

### Task 3: Test coverage [specialist: none]

**Charter capability:** Template-resolution helper
**Strategy:** unit
**Files:**
- Create: `tests/lib/template-resolution.test.mjs`
**Tests:** self

- [ ] Cover behaviors 1-9
- [ ] Test domain override wins (use fixture extension)
- [ ] Test fallback to bundled when domain absent
- [ ] Test `INVALID_LAYER` vs `INVALID_KIND` distinction
- [ ] Test `TEMPLATE_NOT_FOUND` with attempted-paths surfaced in error
- [ ] **Symlink escape test:** create a temp fixture domain with a symlink at `domain/spec-template.behavioral.md` pointing outside the allowed roots; verify `UNSAFE_TEMPLATE_PATH` is thrown
- [ ] Verify `npm test` passes

---

## Quality Gates

- Tests pass: `npm test`
- No new dependencies (Node `node:fs`, `node:path` only)
- Symlink-escape test covers SEC-1
