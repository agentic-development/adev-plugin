# Implementation Plan: Frontmatter Discriminator

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-2 resolved in rev 2 via kindResolved declaration)
> **Platform:** Node.js (ESM), .mjs

**Goal:** Extend the spec-lifecycle frontmatter parser to recognize `kind:`, apply read-time defaulting, and expose `kindValid`/`kindResolved` sentinels on parsed results.

**Architecture:** Add field recognition to the existing frontmatter parser in `lib/lifecycle-state.mjs` (and any adjacent parsers in `lib/source-manifest.mjs`, `lib/spec-drift.mjs` if they read frontmatter). Layer determined from path (`*.spec.md` → `'spec'`; `charter.md` → `'charter'`). Skill write paths (Tasks owned by `specify-kind-routing` / `brainstorm-kind-routing`) reject missing/invalid kind upfront.

---

## File Structure

**Create:**
- `tests/lib/frontmatter-kind-field.test.mjs` — parser-side behavior coverage

**Modify:**
- `lib/lifecycle-state.mjs` (or adjacent frontmatter parser) — add `kind:`, `kindValid:`, `kindResolved:` to parsed result shape

**Reference:**
- `lib/kinds.mjs` — consumes `isValidKind`, `defaultKindFor`
- `.context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md`

## Context Packets

### Task 1-4 Context
- Spec: `.context-index/specs/features/lifecycle-artifacts/frontmatter-discriminator.spec.md` (all 8 behaviors)
- Spec: `.context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md` (foundation)
- Source: `lib/lifecycle-state.mjs` (the existing parser — locate the frontmatter parse function)

## Parallelization

Task 1 → 2 → 3 → 4 strictly sequential (each builds parser surface area incrementally).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Recognize `kind:` field on parser output | small | unit | kind-enumeration | 0 create, 1 modify |
| 2 | Apply read-time defaulting (`kindResolved`) | small | unit | Task 1 | 0 create, 1 modify |
| 3 | Validate via `isValidKind`; expose `kindValid` | small | unit | Task 1, 2 | 0 create, 1 modify |
| 4 | Test coverage for all 8 behaviors | small | unit | Tasks 1-3 | 1 create |

---

### Task 1: Recognize `kind:` field on parser output [specialist: none]

**Charter capability:** Frontmatter discriminator
**Strategy:** unit
**Files:**
- Modify: `lib/lifecycle-state.mjs` (or the canonical frontmatter parser identified by grep)
**Tests:** `tests/lib/frontmatter-kind-field.test.mjs`

- [ ] Locate the frontmatter parsing function (grep `lib/` for `parseYaml`, `extractFrontmatter`, or YAML-block parsing)
- [ ] Add `kind` to the returned object: parse the YAML `kind:` field if present; preserve the raw string verbatim
- [ ] Determine artifact layer from the spec path (`*.spec.md` → `'spec'`; ending in `charter.md` → `'charter'`)
- [ ] Verify in test: parsed spec with `kind: behavioral` exposes `kind === 'behavioral'`
- [ ] Commit with `Spec:` + `Plan-task: 1` trailers

### Task 2: Apply read-time defaulting and `kindResolved` sentinel [specialist: none]

**Charter capability:** Frontmatter discriminator
**Strategy:** unit
**Files:**
- Modify: same parser module
**Tests:** `tests/lib/frontmatter-kind-field.test.mjs`
**Depends on:** Task 1

- [ ] Import `defaultKindFor` from `lib/kinds.mjs`
- [ ] If `kind:` absent from frontmatter: set `kind = defaultKindFor(layer)`, `kindResolved = 'default'`
- [ ] If `kind:` present: set `kindResolved = 'explicit'`
- [ ] Verify: parsed spec without `kind:` exposes `kind === 'behavioral'`, `kindResolved === 'default'`
- [ ] Verify: parsed spec with explicit `kind:` exposes `kindResolved === 'explicit'`
- [ ] Disk content MUST NOT be modified — parser is pure read

### Task 3: Validate via `isValidKind`; expose `kindValid` [specialist: none]

**Charter capability:** Frontmatter discriminator
**Strategy:** unit
**Files:**
- Modify: same parser module
**Tests:** `tests/lib/frontmatter-kind-field.test.mjs`
**Depends on:** Task 1, 2

- [ ] Import `isValidKind` from `lib/kinds.mjs`
- [ ] Compute `kindValid = isValidKind(layer, kind)` on every parse
- [ ] Verify: parsed spec with `kind: invalid-value` exposes raw `kind === 'invalid-value'`, `kindValid === false`, `kindResolved === 'explicit'`
- [ ] Verify: parsed spec with `kind: behavioral` exposes `kindValid === true`

### Task 4: Test coverage for all 8 behaviors [specialist: none]

**Charter capability:** Frontmatter discriminator
**Strategy:** unit
**Files:**
- Create: `tests/lib/frontmatter-kind-field.test.mjs`
**Tests:** self

- [ ] One test case per behavior (1-8 in spec)
- [ ] Use temp fixtures: `createTempDir()` + `writeFixture()` from `tests/helpers.mjs`
- [ ] Behaviors 7-8 (skill-write rejection) are covered by specify-kind-routing tests, not here — note that in the test file
- [ ] Verify `npm test` passes

---

## Quality Gates

- Tests pass: `npm test`
- No new dependencies
- Parser remains a pure read operation (no disk mutation in test fixtures)
