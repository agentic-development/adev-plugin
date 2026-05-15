# Implementation Plan: /adev:specify Kind Routing

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-8 resolved in rev 2 — direct flags preserved, no `--mode`)
> **Platform:** Node.js (ESM); markdown SKILL.md content

**Goal:** Teach `/adev:specify` to ask for `kind:` up-front (or accept `--kind`), validate it, resolve the matching template via `resolveTemplate`, and write the spec with explicit `kind:` in frontmatter.

**Architecture:** SKILL.md content edit (autonomous per constitution Architecture Boundaries). The kind axis is orthogonal to the existing `--extract` / `--refactor` / `--from-diff` / `--cross-cutting` direct workflow flags. Layer 1 does NOT introduce a `--mode` flag.

---

## File Structure

**Modify:**
- `skills/specify/SKILL.md` — add kind prompt + `--kind` arg + routing logic
- `providers/codex/skills/specify/SKILL.md` (if exists) — mirror updates
- `providers/opencode/skills/specify/SKILL.md` (if exists) — mirror updates

**Create:**
- `tests/skills/specify-kind-routing.test.mjs` — fixture-based test of the routing decision

**Reference:**
- `lib/kinds.mjs`, `lib/template-resolution.mjs` (consumed at skill runtime)

## Context Packets

### Task 1-3 Context
- Spec: specify-kind-routing.spec.md (all sections)
- Existing: `skills/specify/SKILL.md` (find Step 2 / Step 3 insertion points)
- Spec: kind-enumeration.spec.md (closed enumeration)

## Parallelization

Tasks 1 → 2 → 3 sequential within the primary skill; provider mirrors land alongside Task 1.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Add `--kind` arg + ask-first prompt to SKILL.md | medium | unit | kind-enumeration, template-resolution | 1 modify (+ provider mirrors) |
| 2 | Wire resolveTemplate call into spec authoring | small | unit | Task 1, spec-templates, template-resolution | 1 modify |
| 3 | Fixture test of routing decision | medium | unit | Tasks 1, 2 | 1 create |

---

### Task 1: Add `--kind` arg + ask-first prompt [specialist: none]

**Charter capability:** /adev:specify kind routing; Workflow/kind orthogonality
**Strategy:** unit
**Files:**
- Modify: `skills/specify/SKILL.md`
- Modify: `providers/codex/skills/specify/SKILL.md` (if exists)
- Modify: `providers/opencode/skills/specify/SKILL.md` (if exists)
**Tests:** Task 3

- [ ] Add `--kind <kind>` to the Arguments table near the existing direct flags
- [ ] After Step 3 (Identify Capability), insert "Step 3.5: Resolve Kind": if `--kind` was provided, validate via `isValidKind('spec', kind)`; if invalid → reject with valid-options list. If absent, present ask-first menu listing all 6 kinds with one-line descriptions; user picks. No defaulting on write — re-prompt if user skips. Strict-on-write.
- [ ] Document explicitly: existing `--extract`, `--refactor`, `--from-diff`, `--cross-cutting` remain direct boolean flags. NO `--mode` flag is introduced. The kind axis combines with workflow flags independently
- [ ] Mirror to provider SKILL.md files where they exist

### Task 2: Wire resolveTemplate into spec authoring [specialist: none]

**Charter capability:** /adev:specify kind routing
**Strategy:** unit
**Files:**
- Modify: `skills/specify/SKILL.md` (Step 5 — Write the Spec)
**Tests:** Task 3
**Depends on:** Task 1, spec-templates Tasks 1-4, template-resolution Task 1

- [ ] In Step 5 instructions, replace any hardcoded reference to `live-spec-template.md` with: "Call `resolveTemplate('spec', kind, domain)` from `lib/template-resolution.mjs` where `kind` is the user-selected kind and `domain` comes from `resolveDomain(...)`. Use the returned path as the template body."
- [ ] Ensure the spec is written with explicit `kind:` in frontmatter — no defaulting at write time
- [ ] If `resolveTemplate` throws `TEMPLATE_NOT_FOUND`: fail with diagnostic showing attempted paths
- [ ] If `resolveTemplate` throws `UNSAFE_TEMPLATE_PATH`: fail with the offending path

### Task 3: Fixture-based routing test [specialist: none]

**Charter capability:** /adev:specify kind routing
**Strategy:** unit
**Files:**
- Create: `tests/skills/specify-kind-routing.test.mjs`
**Tests:** self
**Depends on:** Tasks 1, 2

- [ ] Test the routing **decision logic** as pure functions where possible (extract validate-kind / resolve-template-for-spec helpers from the skill logic into `lib/specify-routing.mjs` if needed)
- [ ] Cover: `--kind action` resolves to `templates/spec-template.action.md`
- [ ] Cover: `--kind unknown` rejected with valid-options message
- [ ] Cover: missing kind on write throws `KIND_REQUIRED`
- [ ] Cover: workflow/kind orthogonality — `--extract --kind artifact` accepted; both flags survive arg parsing

---

## Quality Gates

- `skills/specify/SKILL.md` documents the ask-first prompt and `--kind` flag
- Tests pass: `npm test`
- No `--mode` flag introduced
- Workflow direct flags preserved unchanged
