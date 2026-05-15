# Implementation Plan: Read-Time Defaulting Integration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/read-time-defaulting.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-7 + SEC-2 resolved in rev 2)
> **Platform:** Node.js (ESM); git for timestamp source

**Goal:** Wire the foundation pieces — `lib/kinds.mjs`, the frontmatter parser, `/adev:hygiene` — into the end-to-end read-time defaulting flow with git-recorded timestamps for cutover classification.

**Architecture:** Integration-kind spec — defines the wiring across three modules. Implementation is mostly small additions across existing modules rather than new modules. Git-timestamp helper sited as a small utility (likely in `lib/git-timestamp.mjs`).

---

## File Structure

**Create:**
- `lib/git-timestamp.mjs` — `getCreationTimestamp(path)` using `git log --follow --diff-filter=A` with `mtime` fallback
- `tests/lib/git-timestamp.test.mjs`
- `tests/integration/read-time-defaulting.test.mjs`

**Modify:**
- `lib/lifecycle-state.mjs` (or canonical parser) — already covered by frontmatter-discriminator's Task 1-3; this plan adds the path-derived layer determination if not already present
- `skills/hygiene/SKILL.md` — covered by hygiene-kind-validity (cross-reference only here)

**Reference:**
- `frontmatter-discriminator.spec.md` — owner of kind/kindValid/kindResolved fields
- `hygiene-kind-validity.spec.md` — consumes the integration

## Context Packets

### Task 1-3 Context
- Spec: read-time-defaulting.spec.md (Interaction Contract, Timestamp source, Error Propagation)
- Spec: frontmatter-discriminator.spec.md (parser output contract)
- Existing: `lib/lifecycle-state.mjs` (parser to be extended)

## Parallelization

Tasks 1 → 2 → 3 sequential (timestamp helper consumed by hygiene wiring; integration test verifies end-to-end).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | lib/git-timestamp.mjs + tests | medium | unit | — | 2 create |
| 2 | Wire parser → hygiene findings via kindValid/kindResolved | small | unit | Task 1, frontmatter-discriminator, hygiene-kind-validity | 0 create, 1 modify |
| 3 | End-to-end integration test | medium | integration | Tasks 1, 2 | 1 create |

---

### Task 1: Implement lib/git-timestamp.mjs [specialist: none]

**Charter capability:** Read-time defaulting integration
**Strategy:** unit
**Files:**
- Create: `lib/git-timestamp.mjs`
- Create: `tests/lib/git-timestamp.test.mjs`
**Tests:** see Files

- [ ] Export `getCreationTimestamp(filePath)` async function
- [ ] Primary: spawn `git log --follow --diff-filter=A --format=%aI -- <path>` and parse the last line as ISO 8601
- [ ] Fallback: if git command fails (nonzero exit) or returns empty (uncommitted file), use `fs.statSync(filePath).mtime.toISOString()` and return `{ timestamp, source: 'mtime', warning: 'Git creation timestamp unavailable; using mtime' }`
- [ ] On success: return `{ timestamp, source: 'git', warning: null }`
- [ ] Cover via unit tests: committed file returns git timestamp; uncommitted file falls back to mtime with warning; non-existent path throws underlying fs error
- [ ] Use `tests/helpers.mjs` `createTempDir` for git-initialized temp fixtures

### Task 2: Wire parser → hygiene with timestamp [specialist: none]

**Charter capability:** Read-time defaulting integration
**Strategy:** unit
**Files:**
- Modify: hygiene audit handler (covered by hygiene-kind-validity plan; this is a cross-spec coordination point — the actual implementation lives there but consumes `getCreationTimestamp` from Task 1)
**Tests:** Task 3
**Depends on:** Task 1, frontmatter-discriminator Task 1-3, hygiene-kind-validity Task 1-3

- [ ] In the hygiene audit code (per hygiene-kind-validity plan), import `getCreationTimestamp`
- [ ] For each artifact with `kindResolved === 'default'`: compare its creation timestamp to the cutover date
- [ ] Post-cutover → `MISSING_KIND` finding; pre-cutover → `LEGACY_DEFAULTED` finding
- [ ] If timestamp source is `mtime` (fallback), attach the `warning` to the finding
- [ ] Note: this task is the contract; implementation is shared with hygiene-kind-validity plan

### Task 3: End-to-end integration test [specialist: none]

**Charter capability:** Read-time defaulting integration
**Strategy:** integration (multi-module verification)
**Files:**
- Create: `tests/integration/read-time-defaulting.test.mjs`
**Tests:** self
**Depends on:** Tasks 1, 2

- [ ] Setup: temp dir with `git init`; commit a fixture spec with `kind: behavioral` (explicit); commit another without `kind:` at an old date; create an uncommitted spec without `kind:`
- [ ] Parse each: verify `kind`, `kindValid`, `kindResolved` are exposed correctly
- [ ] Run hygiene-kind-validity audit on the temp dir: verify pre-cutover artifact yields `LEGACY_DEFAULTED`; post-cutover yields `MISSING_KIND`; uncommitted falls back to mtime with warning
- [ ] Verify no disk content was modified by parsing
- [ ] `npm test` passes

---

## Quality Gates

- Tests pass: `npm test`
- No new external dependencies (uses `node:child_process` for `git log`, `node:fs`)
- Mtime fallback is functional and emits warning when used
