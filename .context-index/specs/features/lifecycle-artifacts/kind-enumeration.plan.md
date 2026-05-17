<!-- DO NOT EDIT statuses inline — see lifecycle log kind-enumeration.jsonl -->
# Implementation Plan: Kind Enumeration

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md
> **Review:** PASS (2026-05-14)
> **Platform:** Node.js (ESM), .mjs, npm, node:test

**Goal:** Author `lib/kinds.mjs` exporting the closed enumerations + `isValidKind` + `defaultKindFor`.

**Architecture:** Zero-import ESM module sited as a peer of `lib/domains/domain-config.mjs`. Uses `Object.freeze` on the arrays; exports are module-level constants (not factory functions).

---

## File Structure

**Create:**
- `lib/kinds.mjs` — the foundational module
- `tests/lib/kinds.test.mjs` — coverage of all 8 behaviors + frozen invariant

**Reference:**
- `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` — closed enumerations defined here
- `lib/domains/domain-config.mjs` — sibling module for style reference

## Context Packets

### Task 1 Context (lib/kinds.mjs)
- Spec: `.context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md` (behaviors 1-8)
- ADR: `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` (decision §1)
- Sample: `lib/domains/domain-config.mjs` (style reference for sibling ESM module)

### Task 2 Context (tests)
- Test runner: node:test (per `platform-context.yaml`)
- Test pattern: existing tests at `tests/lib/*.test.mjs` (e.g. `tests/lib/manifest.test.mjs`)

## Parallelization

Tasks 1 → 2 strictly sequential (test verifies impl).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Author lib/kinds.mjs | small | unit | — | 1 create |
| 2 | Author tests/lib/kinds.test.mjs | small | unit | Task 1 | 1 create |

---

### Task 1: Author lib/kinds.mjs [specialist: none]

**Charter capability:** Kind enumeration
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/kinds.mjs`
**Tests:** `tests/lib/kinds.test.mjs` (created in Task 2)

**Context to load:**
- `.context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md`
- `.context-index/adrs/0009-lifecycle-artifact-taxonomy.md` §1

- [ ] **Write failing test** — see Task 2; this task can be authored after Task 2's RED phase
- [ ] **Implement** — export `SPEC_KINDS` (frozen array of 6 strings), `CHARTER_KINDS` (frozen array of 4 strings), `isValidKind(layer, kind)` (returns boolean for valid layer, throws `INVALID_LAYER` otherwise; non-string `kind` returns false), `defaultKindFor(layer)` (returns `'behavioral'` for `'spec'`, `'feature'` for `'charter'`, throws `INVALID_LAYER` otherwise). Use `Object.freeze()` on the two arrays. Zero imports.
- [ ] **Verify test passes** — `npm test -- tests/lib/kinds.test.mjs`
- [ ] **Commit** — `feat(lifecycle-artifacts): add lib/kinds.mjs with closed enumerations + validators` with `Spec:` and `Plan-task: 1` trailers

### Task 2: Author tests/lib/kinds.test.mjs [specialist: none]

**Charter capability:** Kind enumeration
**Strategy:** unit
**Files:**
- Create: `tests/lib/kinds.test.mjs`
**Tests:** self
**Depends on:** Task 1 (file exists), but written first in TDD order

- [ ] **Write failing tests covering all 8 behaviors:**
  1. `SPEC_KINDS` deep-equals `['behavioral','refactor','action','skill','integration','artifact']` AND `Object.isFrozen(SPEC_KINDS) === true`
  2. `CHARTER_KINDS` deep-equals `['module','feature','cross-cutting','initiative']` AND frozen
  3. `isValidKind('spec', 'behavioral')` returns `true`; same for every valid (layer, kind) pair
  4. `isValidKind('spec', 'unknown')` returns `false`; `isValidKind('charter', 'behavioral')` returns `false` (cross-layer)
  5. `isValidKind('spec', null)` / `isValidKind('spec', 123)` / `isValidKind('spec', {})` return `false`
  6. `isValidKind('foo', 'behavioral')` throws `Error` with `code === 'INVALID_LAYER'`
  7. `defaultKindFor('spec') === 'behavioral'`; `defaultKindFor('charter') === 'feature'`
  8. `defaultKindFor('foo')` throws `INVALID_LAYER`
- [ ] **Additional invariant:** attempting `SPEC_KINDS.push('x')` throws `TypeError` (ESM strict mode)
- [ ] **Verify all tests RED before Task 1, GREEN after**
- [ ] **Commit** — `test(lifecycle-artifacts): cover lib/kinds.mjs (8 behaviors + frozen invariant)`

---

## Quality Gates

- Tests pass: `npm test`
- No new dependencies (zero imports in lib/kinds.mjs verified by `grep "^import" lib/kinds.mjs` returning empty)
- ESM `.mjs` extension; no CommonJS
