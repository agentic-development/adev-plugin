# Implementation Plan: /adev:brainstorm Kind Routing

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/brainstorm-kind-routing.spec.md (revision 1)
> **Review:** PASS (2026-05-14, 1 suggestion about directory-creation UX)
> **Platform:** Node.js (ESM); markdown SKILL.md content

**Goal:** Teach `/adev:brainstorm` to ask for charter `kind:` (or accept `--kind`), validate, and route to the matching charter template. `kind: cross-cutting` charters land under `specs/cross-cutting/`.

**Architecture:** SKILL.md content edit. The kind prompt is inserted in Step 2 (Clarify) before approach selection, so subsequent clarifying questions are kind-aware (e.g. `kind: cross-cutting` doesn't ask Domain Model questions).

---

## File Structure

**Modify:**
- `skills/brainstorm/SKILL.md` — add kind prompt + `--kind` arg + routing logic
- Provider mirrors if they exist

**Create:**
- `tests/skills/brainstorm-kind-routing.test.mjs`

## Context Packets

### Task 1-3 Context
- Spec: brainstorm-kind-routing.spec.md (all sections)
- Existing: `skills/brainstorm/SKILL.md` (Step 2 Clarify insertion point)

## Parallelization

Tasks 1 → 2 → 3 sequential.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Add `--kind` arg + ask-first prompt to SKILL.md | medium | unit | kind-enumeration, template-resolution | 1 modify |
| 2 | Wire cross-cutting path policy + manifest warning | small | unit | Task 1, charter-templates | 1 modify |
| 3 | Fixture test of routing decision | small | unit | Tasks 1, 2 | 1 create |

---

### Task 1: Add `--kind` arg + ask-first prompt [specialist: none]

**Charter capability:** /adev:brainstorm kind routing
**Strategy:** unit
**Files:**
- Modify: `skills/brainstorm/SKILL.md`
- Modify: provider mirrors if present
**Tests:** Task 3

- [ ] Add `--kind <kind>` to the Arguments table
- [ ] In Step 2 (Clarify), insert kind prompt before approach selection: list the 4 charter kinds with one-line descriptions; user picks. Validate via `isValidKind('charter', kind)`. No defaulting on write.
- [ ] Document that kind shapes subsequent clarifying questions (e.g., `kind: cross-cutting` skips Domain Model in Step 4 since the charter template's H2 section list determines section structure)

### Task 2: Cross-cutting path policy + manifest warning [specialist: none]

**Charter capability:** /adev:brainstorm kind routing
**Strategy:** unit
**Files:**
- Modify: `skills/brainstorm/SKILL.md` (Step 5 Write Charter section)
**Tests:** Task 3
**Depends on:** Task 1, charter-templates Tasks 1-4, template-resolution

- [ ] When `kind: cross-cutting`: save to `.context-index/specs/cross-cutting/<slug>/charter.md` instead of `features/<slug>/`. If the parent `cross-cutting/` directory doesn't exist, prompt user before creating it (addresses SA-9 suggestion).
- [ ] When `kind: module`: cross-reference the user-supplied module slug against `manifest.yaml:modules[]`. If no match, warn (non-blocking): "Module charters typically correspond to a manifest entry. Add to manifest.yaml after this charter lands."
- [ ] Replace hardcoded charter-template path with `resolveTemplate('charter', kind, domain)`

### Task 3: Fixture-based routing test [specialist: none]

**Charter capability:** /adev:brainstorm kind routing
**Strategy:** unit
**Files:**
- Create: `tests/skills/brainstorm-kind-routing.test.mjs`
**Tests:** self
**Depends on:** Tasks 1, 2

- [ ] Test routing decision: `--kind feature` → `templates/charter-template.feature.md`; `--kind module` → `charter-template.module.md`; etc.
- [ ] Test cross-cutting path: `--kind cross-cutting` resolves save-path to `specs/cross-cutting/<slug>/charter.md`
- [ ] Test manifest-warning when `kind: module` without manifest entry
- [ ] `npm test` passes

---

## Quality Gates

- `skills/brainstorm/SKILL.md` documents the prompt and `--kind` flag
- Tests pass: `npm test`
- cross-cutting charters land under the right directory
