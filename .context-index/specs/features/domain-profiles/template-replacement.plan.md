# Implementation Plan: Template Replacement for Domain Profiles

> **Methodology:** adev
> **Charter:** .context-index/specs/features/domain-profiles/charter.md
> **Spec:** .context-index/specs/features/domain-profiles/template-replacement.spec.md
> **Review:** PASS_WITH_NOTES (2026-05-10)
> **Platform:** Node.js, JavaScript (ESM), npm, node:test

**Goal:** Replace markdown overlay merging (H2 section matching) with full domain-specific templates so LLM agents reliably use domain-specific section names and vocabulary.

**Architecture:** The overlay infrastructure (`loadOverlay`, `constants.mjs`) stays in place — only the markdown overlay types change from fragments to full templates. YAML overlays (reviewers, gates, verification, gate-config, test-config) are completely untouched. The `mergeTemplateOverlay()` function is deleted once all consumers are migrated. Skills load complete templates and reference them generically instead of listing hardcoded section names.

---

## File Structure

**Create:**
- `templates/domains/software/charter-template.md` — Full charter template (identical to `templates/charter-template.md`)
- `templates/domains/software/spec-template.md` — Full spec template (identical to `templates/live-spec-template.md`)
- `templates/domains/data-engineering/charter-template.md` — Full charter template with data-domain vocabulary
- `templates/domains/data-engineering/spec-template.md` — Full spec template with data-domain vocabulary
- `templates/domains/process-automation/charter-template.md` — Full charter template with workflow-domain vocabulary
- `templates/domains/process-automation/spec-template.md` — Full spec template with workflow-domain vocabulary

**Delete:**
- `templates/domains/software/charter-overlay.md`
- `templates/domains/software/spec-overlay.md`
- `templates/domains/data-engineering/charter-overlay.md`
- `templates/domains/data-engineering/spec-overlay.md`
- `templates/domains/process-automation/charter-overlay.md`
- `templates/domains/process-automation/spec-overlay.md`
- `lib/domains/merge-template-overlay.mjs`
- `tests/lib/domains/merge-template-overlay.test.mjs`

**Modify:**
- `lib/domains/constants.mjs` — Rename overlay type entries
- `lib/domains/overlay.mjs` — Add deprecation warning for old type names
- `tests/domains/bundled-profiles.test.mjs` — Update file inventory assertions
- `tests/domains/backward-compat.test.mjs` — Update template loading assertions
- `tests/lib/domains/constants.test.mjs` — Update overlay type assertions
- `tests/lib/domains/integration.test.mjs` — Update integration test overlay type references
- `tests/lib/domains/overlay.test.mjs` — Update overlay type references
- `skills/brainstorm/SKILL.md` — Remove hardcoded sections, reference loaded template
- `skills/specify/SKILL.md` — Remove hardcoded sections, reference loaded template
- `.context-index/specs/features/domain-profiles/charter.md` — Rename entity, update capability map
- `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md` — Update type names
- `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md` — Update type names
- `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md` — Update file inventory

**Reference (read, do not modify):**
- `templates/charter-template.md` — Base charter template (software domain source)
- `templates/live-spec-template.md` — Base spec template (software domain source)
- `lib/domains/merge-template-overlay.mjs` — Used in Task 1 to generate full templates before deletion

---

## Context Packets

### Task 1 Context
- Spec: `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Behaviors 1-5, Migration Step 1)
- Source files: `templates/charter-template.md`, `templates/live-spec-template.md` (base templates)
- Source files: `templates/domains/*/charter-overlay.md`, `templates/domains/*/spec-overlay.md` (current overlays)
- Source files: `lib/domains/merge-template-overlay.mjs` (merge function to generate full templates)

### Task 2 Context
- Spec: `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Behaviors 1-2, 7, Migration Step 2)
- Source files: `lib/domains/constants.mjs`, `lib/domains/overlay.mjs`

### Task 3 Context
- Spec: `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Behaviors 3-5, Migration Step 3)
- Source files: `skills/brainstorm/SKILL.md`, `skills/specify/SKILL.md`

### Task 4 Context
- Spec: `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Migration Step 4, all ACs)
- Source files: `lib/domains/merge-template-overlay.mjs` (to delete)
- Test files: `tests/domains/bundled-profiles.test.mjs`, `tests/domains/backward-compat.test.mjs`, `tests/lib/domains/merge-template-overlay.test.mjs`, `tests/lib/domains/constants.test.mjs`, `tests/lib/domains/integration.test.mjs`, `tests/lib/domains/overlay.test.mjs`

### Task 5 Context
- Spec: `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Cross-Spec Impact section)
- Charter: `.context-index/specs/features/domain-profiles/charter.md`
- Sibling specs: all 3 domain-profiles specs

---

## Parallelization

- Group A (sequential): Task 1 → Task 2 → Task 4 (Task 2 depends on templates from Task 1; Task 4 deletes merge function after Task 2 removes all callers)
- Group B (independent after Task 2): Task 3 (skill updates need new type names from Task 2)
- Group C (independent): Task 5 (spec/charter documentation updates, no code overlap)

Task 3 and Task 5 can run in parallel after Task 2 completes.

---

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Generate full templates from overlays + base | medium | unit | — | 6 create, 6 delete |
| 2 | Update constants, overlay loader, and deprecation warning | small | unit | Task 1 | 0 create, 2 modify |
| 3 | Update brainstorm and specify skills | medium | unit | Task 2 | 0 create, 2 modify |
| 4 | Remove mergeTemplateOverlay and update tests | small | unit | Task 2 | 1 delete, 6 modify |
| 5 | Update sibling specs and charter | small | unit | — | 0 create, 4 modify |

---

### Task 1: Generate Full Templates from Overlays + Base [specialist: none]

**Charter capability:** Template Replacement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `templates/domains/software/charter-template.md`
- Create: `templates/domains/software/spec-template.md`
- Create: `templates/domains/data-engineering/charter-template.md`
- Create: `templates/domains/data-engineering/spec-template.md`
- Create: `templates/domains/process-automation/charter-template.md`
- Create: `templates/domains/process-automation/spec-template.md`
- Delete: `templates/domains/software/charter-overlay.md`
- Delete: `templates/domains/software/spec-overlay.md`
- Delete: `templates/domains/data-engineering/charter-overlay.md`
- Delete: `templates/domains/data-engineering/spec-overlay.md`
- Delete: `templates/domains/process-automation/charter-overlay.md`
- Delete: `templates/domains/process-automation/spec-overlay.md`
- Test: `tests/domains/bundled-profiles.test.mjs` (migration verification test added here, moved to permanent tests in Task 4)

**Tests:** `tests/domains/bundled-profiles.test.mjs`

**Context to load:**
- `templates/charter-template.md` (base charter template)
- `templates/live-spec-template.md` (base spec template)
- `templates/domains/*/charter-overlay.md` (current overlays — read before deleting)
- `templates/domains/*/spec-overlay.md` (current overlays — read before deleting)
- `lib/domains/merge-template-overlay.mjs` (merge function)

- [x] **Write failing test**

Write a migration verification test that:
1. For the software domain: asserts `charter-template.md` exists and contains the same H2 sections as `templates/charter-template.md`
2. For the software domain: asserts `spec-template.md` exists and contains the same H2 sections as `templates/live-spec-template.md`
3. For data-engineering: asserts `charter-template.md` contains "Data Model", "Data Contract", "Data Lineage", "Pipeline Stages"
4. For data-engineering: asserts `spec-template.md` contains "Failure Mode", "Recovery Action", "Data Quality Expectations", "Output Schema"
5. For process-automation: asserts `charter-template.md` contains "Integration Points", "Workflow Steps", "Recovery & Compensation"
6. For process-automation: asserts `spec-template.md` contains "Trigger", "Outcome", "Integration Points", "Recovery Actions"
7. Asserts overlay files (`charter-overlay.md`, `spec-overlay.md`) no longer exist in any domain directory

- [x] **Verify test fails**

Run: `npm test -- --test-name-pattern "charter-template|spec-template"`
Expected: FAIL — template files do not exist yet

- [x] **Implement**

For each domain:
1. Read the base charter template (`templates/charter-template.md`)
2. Read the domain's current charter overlay (`templates/domains/<domain>/charter-overlay.md`)
3. Apply `mergeTemplateOverlay(base, overlay)` to produce the full template
4. For the software domain: the full template should be identical to the base template (since the overlay IS the base sections)
5. For data-engineering and process-automation: the full template has domain-specific sections merged in
6. Write the result as `templates/domains/<domain>/charter-template.md`
7. Repeat steps 1-6 for spec templates (base: `templates/live-spec-template.md`, overlay: `spec-overlay.md`, output: `spec-template.md`)
8. Delete all 6 overlay files (`charter-overlay.md`, `spec-overlay.md` from each domain)

- [x] **Verify test passes**

Run: `npm test -- --test-name-pattern "charter-template|spec-template"`
Expected: PASS

- [x] **Commit**

```bash
git add templates/domains/
git commit -m "refactor(domain-profiles): replace overlay fragments with full domain templates

Generate complete charter-template.md and spec-template.md for each bundled
domain by applying mergeTemplateOverlay() to base + overlay. Delete the
overlay fragment files. Each domain now ships complete templates instead of
H2-section fragments.

Spec: .context-index/specs/features/domain-profiles/template-replacement.spec.md
Plan-task: 1"
```

---

### Task 2: Update Constants, Overlay Loader, and Deprecation Warning [specialist: none]

**Charter capability:** Template Replacement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `lib/domains/constants.mjs`
- Modify: `lib/domains/overlay.mjs`
- Test: `tests/lib/domains/constants.test.mjs`, `tests/lib/domains/overlay.test.mjs`

**Tests:** `tests/lib/domains/constants.test.mjs`, `tests/lib/domains/overlay.test.mjs`

**Context to load:**
- `lib/domains/constants.mjs` (current constants)
- `lib/domains/overlay.mjs` (current loader)
- `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Behavior 7 — deprecation warning)

- [x] **Write failing test**

In `tests/lib/domains/constants.test.mjs`:
1. Assert `OVERLAY_TYPES` contains `charter-template` and `spec-template`
2. Assert `OVERLAY_TYPES` does NOT contain `charter-overlay` or `spec-overlay`
3. Assert `OVERLAY_FILENAMES` maps `charter-template` to `charter-template.md`
4. Assert `charter-template` is NOT in `STRUCTURED_OVERLAY_TYPES` (returns string, not parsed object)

In `tests/lib/domains/overlay.test.mjs`:
1. Assert `loadOverlay(domain, 'charter-template', ...)` returns the full template string
2. Assert `loadOverlay(domain, 'charter-overlay', ...)` returns `null` (deprecated type)

- [x] **Verify test fails**

Run: `node --test tests/lib/domains/constants.test.mjs tests/lib/domains/overlay.test.mjs`
Expected: FAIL — old type names still registered

- [x] **Implement**

1. In `lib/domains/constants.mjs`:
   - Replace `'charter-overlay'` with `'charter-template'` in `OVERLAY_TYPES`
   - Replace `'spec-overlay'` with `'spec-template'` in `OVERLAY_TYPES`
   - Update `OVERLAY_FILENAMES`: `'charter-template' -> 'charter-template.md'`, `'spec-template' -> 'spec-template.md'`
   - Remove `'charter-template'` and `'spec-template'` from `STRUCTURED_OVERLAY_TYPES` (they return strings)
   - Add `DEPRECATED_OVERLAY_TYPES` map: `{ 'charter-overlay': 'charter-template', 'spec-overlay': 'spec-template' }`

2. In `lib/domains/overlay.mjs`:
   - Import `DEPRECATED_OVERLAY_TYPES` from constants
   - Before the `OVERLAY_TYPES.has()` check, add deprecation handling:
     ```javascript
     if (DEPRECATED_OVERLAY_TYPES.has(overlayType)) {
       const newType = DEPRECATED_OVERLAY_TYPES.get(overlayType);
       console.warn(`OVERLAY_TYPE_DEPRECATED: "${overlayType}" has been renamed to "${newType}". Update your domain profile files.`);
       return null;
     }
     ```

- [x] **Verify test passes**

Run: `node --test tests/lib/domains/constants.test.mjs tests/lib/domains/overlay.test.mjs`
Expected: PASS

- [x] **Commit**

```bash
git add lib/domains/constants.mjs lib/domains/overlay.mjs tests/lib/domains/constants.test.mjs tests/lib/domains/overlay.test.mjs
git commit -m "refactor(domain-profiles): rename overlay types to template types

Update OVERLAY_TYPES registry: charter-overlay → charter-template,
spec-overlay → spec-template. Add DEPRECATED_OVERLAY_TYPES map with
deprecation warning for old type names. loadOverlay() emits
OVERLAY_TYPE_DEPRECATED and returns null for deprecated types.

Spec: .context-index/specs/features/domain-profiles/template-replacement.spec.md
Plan-task: 2"
```

---

### Task 3: Update Brainstorm and Specify Skills [specialist: none]

**Charter capability:** Template Replacement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Modify: `skills/brainstorm/SKILL.md`
- Modify: `skills/specify/SKILL.md`

**Tests:** Manual verification — run brainstorm/specify with each domain and verify output uses domain section names.

**Context to load:**
- `skills/brainstorm/SKILL.md` (current skill with hardcoded sections)
- `skills/specify/SKILL.md` (current skill with hardcoded sections)
- `templates/domains/data-engineering/charter-template.md` (to understand domain section names)

- [x] **Implement**

In `skills/brainstorm/SKILL.md`:
1. Replace the `mergeTemplateOverlay()` code block with a simpler `loadOverlay(domain, 'charter-template', ...)` call. Remove the `mergeTemplateOverlay` import.
2. After loading, add instruction: "The loaded template defines the charter's section structure. Use the template's H2 headings as the section names for this charter. Do not use hardcoded section names — the template is the single source of truth for section structure."
3. In Step 2 (Clarify, lines 138-143): replace the hardcoded section name list with: "Ask questions to fill each section defined in the loaded domain template. Map each question to the corresponding H2 section in the template."
4. In Step 4 (Present Design Sections, lines 223-228): replace the hardcoded 4a-4f list with: "For each H2 section in the loaded domain template, present the content and ask 'Does this look right?' before moving to the next. Scale detail to complexity."
5. In Step 5 (Write Charter, line 234): replace `${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md` with: "Use the domain template loaded in Step 1 as the template for writing the charter."

In `skills/specify/SKILL.md`:
1. Replace the `mergeTemplateOverlay()` code block with `loadOverlay(domain, 'spec-template', ...)`. Remove the `mergeTemplateOverlay` import.
2. After loading, add: "The loaded template defines the spec's section structure. Use the template's H2 headings and table columns as the structure for this spec."
3. In Step 4 (Interactive Spec Authoring): replace hardcoded section names with: "Guide the user through each section defined in the loaded domain template."
4. In Step 5 (Write the Spec, line ~300): replace the hardcoded base template path with: "Use the domain template loaded in Step 1."

- [x] **Commit**

```bash
git add skills/brainstorm/SKILL.md skills/specify/SKILL.md
git commit -m "refactor(domain-profiles): remove hardcoded section names from skills

Update brainstorm and specify SKILL.md to load domain templates via
loadOverlay(domain, 'charter-template'/'spec-template') and reference
the loaded template as the section structure. Remove all hardcoded
charter/spec section names from skill prose.

Spec: .context-index/specs/features/domain-profiles/template-replacement.spec.md
Plan-task: 3"
```

---

### Task 4: Remove mergeTemplateOverlay and Update Tests [specialist: none]

**Charter capability:** Template Replacement
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2
**Files:**
- Delete: `lib/domains/merge-template-overlay.mjs`
- Delete: `tests/lib/domains/merge-template-overlay.test.mjs`
- Modify: `tests/domains/bundled-profiles.test.mjs`
- Modify: `tests/domains/backward-compat.test.mjs`
- Modify: `tests/lib/domains/integration.test.mjs`
- Modify: `tests/lib/domains/overlay.test.mjs`
- Test: all modified test files

**Tests:** `tests/domains/bundled-profiles.test.mjs`, `tests/domains/backward-compat.test.mjs`

**Context to load:**
- `tests/domains/bundled-profiles.test.mjs` (current file inventory tests)
- `tests/domains/backward-compat.test.mjs` (current overlay loading tests)
- `tests/lib/domains/integration.test.mjs` (integration tests)

- [x] **Write failing test**

Update `tests/domains/bundled-profiles.test.mjs`:
1. Change `EXPECTED_FILES` array: replace `'charter-overlay.md'` with `'charter-template.md'`, `'spec-overlay.md'` with `'spec-template.md'`
2. Update charter overlay content tests to check full template content (e.g., software charter-template contains "Business Intent", "Domain Model", "Interface Contracts")
3. Update spec overlay content tests similarly

Update `tests/domains/backward-compat.test.mjs`:
1. Replace `loadOverlay(domain, 'charter-overlay', ...)` with `loadOverlay(domain, 'charter-template', ...)`
2. Replace `loadOverlay(domain, 'spec-overlay', ...)` with `loadOverlay(domain, 'spec-template', ...)`
3. Keep assertions — templates should produce identical structure

Update `tests/lib/domains/integration.test.mjs`:
1. Replace any references to `charter-overlay` / `spec-overlay` with `charter-template` / `spec-template`

Update `tests/lib/domains/overlay.test.mjs`:
1. Replace any overlay type references

- [x] **Verify test fails**

Run: `npm test`
Expected: Some tests FAIL due to import of deleted `merge-template-overlay.mjs` or references to old type names

- [x] **Implement**

1. Delete `lib/domains/merge-template-overlay.mjs`
2. Delete `tests/lib/domains/merge-template-overlay.test.mjs`
3. Apply all test file updates from the "Write failing test" step
4. Verify no remaining imports of `merge-template-overlay` anywhere: `grep -r "merge-template-overlay" lib/ tests/`

- [x] **Verify test passes**

Run: `npm test`
Expected: PASS (all tests pass, no references to deleted module)

- [x] **Commit**

```bash
git add lib/domains/ tests/
git commit -m "refactor(domain-profiles): delete mergeTemplateOverlay and update tests

Remove lib/domains/merge-template-overlay.mjs and its test file. Update
bundled-profiles, backward-compat, integration, and overlay tests to use
charter-template/spec-template type names and verify full template content.

Spec: .context-index/specs/features/domain-profiles/template-replacement.spec.md
Plan-task: 4"
```

---

### Task 5: Update Sibling Specs and Charter [specialist: none]

**Charter capability:** Template Replacement
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `.context-index/specs/features/domain-profiles/charter.md`
- Modify: `.context-index/specs/features/domain-profiles/domain-resolution-and-overlay-structure.spec.md`
- Modify: `.context-index/specs/features/domain-profiles/domain-aware-skill-integration.spec.md`
- Modify: `.context-index/specs/features/domain-profiles/bundled-domain-profiles.spec.md`

**Tests:** No code tests — these are documentation/spec updates.

**Context to load:**
- `.context-index/specs/features/domain-profiles/template-replacement.spec.md` (Cross-Spec Impact section)
- All 3 sibling specs (to locate exact lines to update)
- Charter (entity model, capability map, relationships)

- [x] **Implement**

1. **Charter updates:**
   - Rename entity `TemplateOverlay` to `DomainTemplate` in Domain Model → Entities table
   - Update description: "Complete markdown template for a domain's charter or spec structure"
   - Update attributes: `type` (charter/spec), `domain` (remove `sections[]`)
   - Update Relationships section: "A DomainProfile contains exactly one DomainTemplate (charter), one DomainTemplate (spec)..."
   - Update Capability Map descriptions for "Charter Template Overlay" and "Spec Template Overlay" rows
   - Update Interface Contracts: `loadOverlay` description — "For template types (charter-template/spec-template): returns a complete template string"
   - Bump charter revision to 5

2. **domain-resolution-and-overlay-structure.spec.md:**
   - Update Overlay Type-to-Filename Mapping table: `charter-overlay → charter-template`, `spec-overlay → spec-template`
   - Update Behavior 10: reference "template" types
   - Update Behavior 6: note that deprecated type names trigger `OVERLAY_TYPE_DEPRECATED` warning
   - Bump revision to 6, update charter-revision to 5

3. **domain-aware-skill-integration.spec.md:**
   - Update Behavior 2: `loadOverlay(domain, "charter-template", ...)`
   - Update Behavior 4: `loadOverlay(domain, "spec-template", ...)`
   - Remove references to `mergeTemplateOverlay()` in Behaviors 2 and 4
   - Mark charter/spec merge function tasks as obsolete in Actionable Task Map
   - Bump revision to 6, update charter-revision to 5

4. **bundled-domain-profiles.spec.md:**
   - Update Overlay File Inventory table: `charter-overlay.md → charter-template.md`, `spec-overlay.md → spec-template.md`
   - Update Behaviors 1-2, 8-9, 15-16: "loads the charter template" instead of "loads the charter overlay"
   - Update Behavior 22 file list
   - Update Acceptance Criteria file references
   - Bump revision to 6, update charter-revision to 5

- [x] **Commit**

```bash
git add .context-index/specs/features/domain-profiles/
git commit -m "docs(domain-profiles): update charter and sibling specs for template replacement

Rename TemplateOverlay entity to DomainTemplate in charter. Update all 3
sibling specs to reference charter-template/spec-template type names and
filenames. Bump charter to rev 5, sibling specs to rev 6.

Spec: .context-index/specs/features/domain-profiles/template-replacement.spec.md
Plan-task: 5"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied
- No constitutional violations introduced
- YAML overlay loading unchanged (regression check)
- Software domain template backward compatible with base templates
