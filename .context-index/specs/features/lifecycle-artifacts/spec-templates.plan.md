<!-- DO NOT EDIT statuses inline — see lifecycle log spec-templates.jsonl -->
# Implementation Plan: Spec Templates

> **Methodology:** adev
> **Charter:** .context-index/specs/features/lifecycle-artifacts/charter.md
> **Spec:** .context-index/specs/features/lifecycle-artifacts/spec-templates.spec.md (revision 1)
> **Review:** PASS (2026-05-14, 1 suggestion)
> **Platform:** Node.js (ESM); markdown templates

**Goal:** Author the four new bundled spec templates (action, skill, integration, artifact) at both `templates/` and `.context-index/specs/features/` dotfile locations.

**Architecture:** Pure markdown artifact. Each template defines its H2 section structure per the spec's "Structural Shape" definitions. After Layer 1, six spec templates exist (behavioral + refactor renamed + four new).

---

## File Structure

**Create (bundled):**
- `templates/spec-template.action.md`
- `templates/spec-template.skill.md`
- `templates/spec-template.integration.md`
- `templates/spec-template.artifact.md`

**Create (user-editable dotfile copies):**
- `.context-index/specs/features/.spec-template.action.md`
- `.context-index/specs/features/.spec-template.skill.md`
- `.context-index/specs/features/.spec-template.integration.md`
- `.context-index/specs/features/.spec-template.artifact.md`

**Reference:**
- Existing `.context-index/specs/features/lifecycle-artifacts/*.spec.md` of each kind as canonical exemplars (kind: action → smoke-validation; kind: skill → specify-kind-routing; kind: integration → read-time-defaulting; kind: artifact → spec-templates itself)

## Context Packets

Per-template context = the corresponding canonical exemplar spec under lifecycle-artifacts/.

## Parallelization

Tasks 1-4 are independent (one template each); Task 5 verifies after all four land.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | spec-template.action.md (Devin-style) | small | unit | — | 2 create |
| 2 | spec-template.skill.md | small | unit | — | 2 create |
| 3 | spec-template.integration.md | small | unit | — | 2 create |
| 4 | spec-template.artifact.md | small | unit | — | 2 create |
| 5 | Verify resolveTemplate resolves each | small | unit | template-resolution, Tasks 1-4 | 0 create, 1 modify (test) |

---

### Task 1: Author spec-template.action.md (Devin-style postcondition-first) [specialist: none]

**Charter capability:** Action template (Devin-style)
**Strategy:** unit
**Files:**
- Create: `templates/spec-template.action.md`
- Create: `.context-index/specs/features/.spec-template.action.md` (copy of the above)
**Tests:** `tests/lib/template-resolution.test.mjs` covers resolution; structure verification in Task 5

- [ ] Frontmatter baseline: `charter`, `kind: action`, `status: draft`, `risk_level: medium`, `milestone:`, `revision: 1`, `charter-revision:`, `created:`, `updated:` (with `{{ }}` placeholders)
- [ ] H2 sections in order: Postconditions / Procedure / Idempotency / Rollback / System Constitution Reference / Acceptance Criteria
- [ ] Inside each section, an HTML comment guiding the author (e.g. `<!-- State-of-world after this action runs. Defines DONE. -->`)
- [ ] No real example content that could be mistaken for a valid spec
- [ ] Reference exemplar: `smoke-validation.spec.md`

### Task 2: Author spec-template.skill.md [specialist: none]

**Files:**
- Create: `templates/spec-template.skill.md` + dotfile copy
**Tests:** Task 5

- [ ] Frontmatter baseline (same shape, `kind: skill`)
- [ ] H2 sections in order: Invocation Modes / Arguments / Output Contract / Failure Modes / System Constitution Reference / Acceptance Criteria
- [ ] HTML comments per section
- [ ] Reference exemplar: `specify-kind-routing.spec.md`

### Task 3: Author spec-template.integration.md [specialist: none]

**Files:**
- Create: `templates/spec-template.integration.md` + dotfile copy
**Tests:** Task 5

- [ ] Frontmatter baseline (same shape, `kind: integration`)
- [ ] H2 sections in order: Participants / Interaction Contract / State Machine / Error Propagation / System Constitution Reference / Acceptance Criteria
- [ ] HTML comments per section
- [ ] Reference exemplar: `read-time-defaulting.spec.md`

### Task 4: Author spec-template.artifact.md [specialist: none]

**Files:**
- Create: `templates/spec-template.artifact.md` + dotfile copy
**Tests:** Task 5

- [ ] Frontmatter baseline (same shape, `kind: artifact`)
- [ ] H2 sections in order: Structural Shape / Required Files / Consumers / System Constitution Reference / Acceptance Criteria
- [ ] HTML comments per section noting that artifact specs intentionally omit Preconditions/Behaviors/Postconditions (static deliverables don't *do* anything)
- [ ] Reference exemplar: `spec-templates.spec.md` itself

### Task 5: Verify resolveTemplate covers each new kind [specialist: none]

**Charter capability:** Template matrix
**Strategy:** unit
**Files:**
- Modify: `tests/lib/template-resolution.test.mjs` — add cases for all 4 new spec kinds
**Tests:** self
**Depends on:** Tasks 1-4, template-resolution module landed

- [ ] For each new kind, assert `resolveTemplate('spec', kind, null)` returns the bundled path AND the file exists AND its body starts with the documented H2 section list
- [ ] Verify `npm test` passes

---

## Quality Gates

- All four bundled templates exist under `templates/`
- All four user-editable dotfile copies exist under `.context-index/specs/features/`
- Each template's frontmatter contains `kind:` set to its kind value
- `resolveTemplate('spec', kind, null)` resolves successfully for each new kind
