# Implementation Plan: Charter Templates

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/charter-templates.spec.md (revision 2)
> **Review:** PASS_WITH_NOTES (2026-05-14, SA-6 + CON-1 resolved in rev 2 via deviation/asymmetry callouts)
> **Platform:** Node.js (ESM); markdown templates; git for the feature rename

**Goal:** Author three new bundled charter templates (module, cross-cutting, initiative) and rename the existing `charter-template.md` to `charter-template.feature.md`.

**Architecture:** Pure markdown artifact + small rename. The rename is bundled here per the accepted deviation in ADR-0009: small renames prerequisite to artifact introduction may live in the artifact spec.

---

## File Structure

**Rename (git mv):**
- `templates/charter-template.md` → `templates/charter-template.feature.md`
- `.context-index/specs/features/.charter-template.md` → `.context-index/specs/features/.charter-template.feature.md`

**Create (bundled):**
- `templates/charter-template.module.md`
- `templates/charter-template.cross-cutting.md`
- `templates/charter-template.initiative.md`

**Create (user-editable dotfile copies):**
- `.context-index/specs/features/.charter-template.module.md`
- `.context-index/specs/features/.charter-template.cross-cutting.md`
- `.context-index/specs/features/.charter-template.initiative.md`

**Modify (reference updates from the rename):**
- `skills/brainstorm/SKILL.md` — `.charter-template.md` references
- `skills/init/SKILL.md` and `cli/index.mjs` — bundled-template copy paths (if hardcoded)
- Any `lib/*.mjs` referencing the old path

## Context Packets

### Task 1 Context (rename)
- Spec: charter-templates.spec.md (Required Files section)
- Grep: `grep -rln "charter-template\.md" skills/ lib/ cli/`

### Task 2-4 Context (new templates)
- Spec: charter-templates.spec.md (Structural Shape per kind)
- Audit: `.context-index/research/charter-format-audit.md` (defines section shapes per archetype)

## Parallelization

Task 1 (rename + references) → Tasks 2, 3, 4 (independent template authoring) → Task 5 (verify resolveTemplate).

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Rename charter-template.md → .feature.md + update refs | small | unit | — | 2 renames, ~3 modify |
| 2 | charter-template.module.md (skill-registry shape) | small | unit | Task 1 | 2 create |
| 3 | charter-template.cross-cutting.md | small | unit | Task 1 | 2 create |
| 4 | charter-template.initiative.md (refactor-shaped) | small | unit | Task 1 | 2 create |
| 5 | Verify resolveTemplate resolves each charter kind | small | unit | template-resolution, Tasks 2-4 | 0 create, 1 modify |

---

### Task 1: Rename charter-template.md → charter-template.feature.md [specialist: none]

**Charter capability:** Module / cross-cutting / initiative templates (prerequisite rename)
**Strategy:** unit
**Files:**
- Renames: 2 files via `git mv`
- Modify: skills/brainstorm/SKILL.md, skills/init/SKILL.md, cli/index.mjs (any references found via grep)
**Tests:** Task 5

- [ ] `git mv templates/charter-template.md templates/charter-template.feature.md`
- [ ] `git mv .context-index/specs/features/.charter-template.md .context-index/specs/features/.charter-template.feature.md`
- [ ] `grep -rln "charter-template\.md" skills/ lib/ cli/ extensions/` to find references
- [ ] Update each reference: `charter-template.md` → `charter-template.feature.md`
- [ ] Verify `grep -r "charter-template\.md[^.]" skills/ lib/ cli/` returns zero matches (the negative lookahead excludes the new suffix variants)

### Task 2: Author charter-template.module.md [specialist: none]

**Charter capability:** Module / cross-cutting / initiative templates
**Strategy:** unit
**Files:**
- Create: `templates/charter-template.module.md` + dotfile copy
**Tests:** Task 5
**Depends on:** Task 1

- [ ] Frontmatter baseline (charter shape — kind / status / revision / updated; no charter-revision/risk_level/milestone per the asymmetry note)
- [ ] H2 sections: Purpose / Skills / Key Behaviors / Key Files / Constitution Reference / Capability Map
- [ ] HTML comments noting this is the minimal skill-registry shape for manifest-registered lifecycle-slot modules
- [ ] Reference exemplars: `.context-index/specs/features/cli/charter.md`, `.context-index/specs/features/hooks/charter.md` (existing minimal-shape charters)

### Task 3: Author charter-template.cross-cutting.md [specialist: none]

**Files:**
- Create: `templates/charter-template.cross-cutting.md` + dotfile copy
**Tests:** Task 5
**Depends on:** Task 1

- [ ] Frontmatter baseline (charter shape, `kind: cross-cutting`)
- [ ] H2 sections: Business Intent / Scope / Affected Modules / Interface Contracts / Quality Attributes
- [ ] HTML comment in "Affected Modules" guiding a per-module impact table (high/medium/low + changes required)
- [ ] No Domain Model section (intentionally omitted; entities live in affected modules)

### Task 4: Author charter-template.initiative.md [specialist: none]

**Files:**
- Create: `templates/charter-template.initiative.md` + dotfile copy
**Tests:** Task 5
**Depends on:** Task 1

- [ ] Frontmatter baseline (`kind: initiative`)
- [ ] H2 sections: Business Intent / Scope / Current State / Target State / Migration Plan / Acceptance Criteria (refactor-shaped at charter layer)
- [ ] HTML comment noting time-bounded nature and auto-archive expectation

### Task 5: Verify resolveTemplate covers all four charter kinds [specialist: none]

**Charter capability:** Module / cross-cutting / initiative templates
**Strategy:** unit
**Files:**
- Modify: `tests/lib/template-resolution.test.mjs`
**Tests:** self
**Depends on:** Tasks 1-4, template-resolution module landed

- [ ] Assert `resolveTemplate('charter', kind, null)` returns the bundled path for every kind in `CHARTER_KINDS` (feature, module, cross-cutting, initiative)
- [ ] Verify each resolved file's H2 section list matches the documented shape
- [ ] `npm test` passes

---

## Quality Gates

- Charter-template.md renamed to charter-template.feature.md; references updated
- Three new bundled charter templates land
- Each carries explicit `kind:` in frontmatter
- `resolveTemplate('charter', kind, null)` resolves every charter kind
