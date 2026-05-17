<!-- DO NOT EDIT statuses inline — see lifecycle log template-renames.jsonl -->
# Implementation Plan: Template Renames

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/template-renames.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-4 resolved in rev 2 via Scope Boundary)
> **Platform:** Node.js (ESM), .mjs; git for rename history preservation

**Goal:** Rename the two existing spec templates (live-spec and refactoring-spec) to the new `.spec-template.<kind>.md` convention. Update every reference in `skills/`, `lib/`, `cli/`, and `extensions/`.

**Architecture:** Mechanical `git mv` to preserve history, followed by grep-based reference updates across the codebase. Refactor-kind spec — scoped to spec templates only; the charter-template rename is owned by `charter-templates.spec.md`.

---

## File Structure

**Rename (git mv):**
- `.context-index/specs/features/.live-spec-template.md` → `.context-index/specs/features/.spec-template.behavioral.md`
- `.context-index/specs/features/.refactoring-spec-template.md` → `.context-index/specs/features/.spec-template.refactor.md`
- `templates/live-spec-template.md` → `templates/spec-template.behavioral.md`
- `templates/refactoring-spec-template.md` → `templates/spec-template.refactor.md`

**Modify (reference updates):**
- `skills/specify/SKILL.md` — template path references
- `skills/brainstorm/SKILL.md` — adjacent references
- `skills/init/SKILL.md` and `cli/index.mjs` — bundled-template copy paths (if hardcoded)
- Any `lib/*.mjs` that references these paths (discovered by grep)

## Context Packets

### Task 1-3 Context
- Spec: template-renames.spec.md (full)
- Existing grep target: `grep -r "live-spec-template\|refactoring-spec-template" skills/ lib/ cli/ extensions/`

## Parallelization

Tasks 1 → 2 → 3 strictly sequential (each step assumes the previous landed).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | git mv the four files | small | unit | — | 4 renames |
| 2 | Update references across codebase | medium | unit | Task 1 | ~5-10 modify |
| 3 | Verify zero remaining references + tests pass | small | unit | Task 2 | 0 |

---

### Task 1: git mv the four files [specialist: none]

**Charter capability:** Template renames
**Strategy:** unit (verification = greps in Task 3)
**Files:** 4 renames (see File Structure)
**Tests:** N/A — mechanical rename; verification in Task 3

- [ ] `git mv .context-index/specs/features/.live-spec-template.md .context-index/specs/features/.spec-template.behavioral.md`
- [ ] `git mv .context-index/specs/features/.refactoring-spec-template.md .context-index/specs/features/.spec-template.refactor.md`
- [ ] `git mv templates/live-spec-template.md templates/spec-template.behavioral.md`
- [ ] `git mv templates/refactoring-spec-template.md templates/spec-template.refactor.md`
- [ ] Verify with `git status --porcelain` — should show 4 renames, no content changes
- [ ] `git diff --stat HEAD` — should show no content delta on the four files

### Task 2: Update references across codebase [specialist: none]

**Charter capability:** Template renames
**Strategy:** unit
**Files:** all files containing references to old paths
**Tests:** N/A — verification in Task 3
**Depends on:** Task 1

- [ ] Run `grep -rln "live-spec-template\|refactoring-spec-template" skills/ lib/ cli/ extensions/ providers/ 2>/dev/null` to enumerate references
- [ ] For each file in the grep output: replace `live-spec-template.md` → `spec-template.behavioral.md`; replace `refactoring-spec-template.md` → `spec-template.refactor.md`
- [ ] Verify intra-file consistency (paths may be quoted or in code blocks)
- [ ] Note: this spec's Out-of-Scope clause excludes the charter-template rename — only update references to the two spec templates here

### Task 3: Verify zero remaining references + tests pass [specialist: none]

**Charter capability:** Template renames
**Strategy:** unit
**Files:** 0 (verification only)
**Tests:** `npm test` for regression
**Depends on:** Task 2

- [ ] `grep -r "live-spec-template\|refactoring-spec-template" skills/ lib/ cli/ extensions/ providers/` MUST return zero matches
- [ ] `npm test` passes (no `ENOENT` from broken paths)
- [ ] Smoke-test `/adev:init` on a temp dir: verify it produces a working scaffold with the renamed templates (manual verification step)
- [ ] Commit the entire refactor as one PR with conventional commit `refactor(lifecycle-artifacts): rename spec templates to .spec-template.<kind>.md`

---

## Quality Gates

- Zero references to old filenames in tracked code
- All existing tests pass
- Renamed files have no content changes (rename-only diff)
