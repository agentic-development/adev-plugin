# Refactoring Spec: Template Replacement for Domain Profiles

<!-- Refactoring spec within the domain-profiles charter.
     Replaces markdown overlay merging with full template replacement so LLM agents
     reliably use domain-specific section names and vocabulary.
     Parent Charter: .context-index/specs/features/domain-profiles/charter.md -->

---
charter: domain-profiles
status: implemented
mode: refactor
risk_level: medium
milestone: v1
revision: 2
charter-revision: 4
created: 2026-05-10
updated: 2026-05-10
---

## Current State

### Structure

| File | Role | Lines | Notes |
|------|------|-------|-------|
| `templates/domains/software/charter-overlay.md` | H2-section overlay for charter template | 49 | Overlay fragment, not a complete template |
| `templates/domains/software/spec-overlay.md` | H2-section overlay for spec template | 29 | Overlay fragment, not a complete template |
| `templates/domains/data-engineering/charter-overlay.md` | H2-section overlay for charter template | 57 | Data-domain vocabulary |
| `templates/domains/data-engineering/spec-overlay.md` | H2-section overlay for spec template | 33 | Data-domain vocabulary |
| `templates/domains/process-automation/charter-overlay.md` | H2-section overlay for charter template | 62 | Workflow-domain vocabulary |
| `templates/domains/process-automation/spec-overlay.md` | H2-section overlay for spec template | 38 | Workflow-domain vocabulary |
| `lib/domains/merge-template-overlay.mjs` | H2 section-matching merge function | 100 | Parses both base and overlay, replaces matching H2s, appends unmatched |
| `lib/domains/overlay.mjs` | Overlay loader | ~200 | Returns raw string for markdown overlays |
| `lib/domains/constants.mjs` | Overlay type registry | 56 | Registers `charter-overlay` and `spec-overlay` as overlay types |
| `templates/charter-template.md` | Base charter template | 119 | Software-centric section names (Domain Model, Interface Contracts) |
| `templates/live-spec-template.md` | Base spec template | 108 | Software-centric columns (HTTP Status / Error Code, Visual Expectations) |
| `skills/brainstorm/SKILL.md` | Charter authoring skill | ~300 | Hardcoded section names at lines 138-143 and 223-228 |
| `skills/specify/SKILL.md` | Spec authoring skill | ~250 | Hardcoded section names in Step 4 |

### Problems

1. **LLM agents ignore dynamically merged templates.** The brainstorm SKILL.md runs `mergeTemplateOverlay(base, overlay)` in a JS code block, producing a merged string in a variable. But lines 138-143 and 223-228 then list explicit section names ("Domain Model", "Interface Contracts", "Quality Attributes"). The agent follows the prose instructions (stronger signal) and ignores the merged variable (weaker signal). A data-engineering project still gets "Domain Model" instead of "Data Model".

2. **Two competing sources of truth.** The overlay produces one set of section names; the SKILL.md prose prescribes another. The agent must choose, and it always chooses the explicit instructions.

3. **Overlay merging is an unnecessary abstraction for this use case.** H2 section matching (parse both documents, replace matching headings, append unmatched) is a deterministic pattern designed for config systems. When the consumer is an LLM reading a template, a complete template is simpler and more reliable.

### Dependencies

| Consumer | How It Uses Overlays | Impact of Change |
|----------|---------------------|-----------------|
| `skills/brainstorm/SKILL.md` | Calls `loadOverlay(domain, 'charter-overlay')` + `mergeTemplateOverlay()` | Must load full template instead |
| `skills/specify/SKILL.md` | Calls `loadOverlay(domain, 'spec-overlay')` + `mergeTemplateOverlay()` | Must load full template instead |
| `lib/domains/overlay.mjs` | Returns raw markdown string for overlay types | Must return full template string for template types |
| `tests/lib/domains/merge-template-overlay.test.mjs` | Unit tests for H2 merge function | Tests updated or removed |
| `tests/domains/bundled-profiles.test.mjs` | Validates overlay files exist | Updated to validate template files |
| `tests/domains/backward-compat.test.mjs` | Validates software overlay loads | Updated to validate software template loads |

**Not affected:** YAML overlays (reviewers, gates, verification, gate-config, test-config) — these are consumed by deterministic JS merge functions and work correctly. Custom domain `extends` chain for YAML overlays is unchanged.

## Cross-Spec Impact

This refactoring supersedes specific sections of three validated sibling specs. These specs must be updated to revision 6 as part of Migration Step 2:

| Spec | Affected Sections | Required Update |
|------|-------------------|-----------------|
| `domain-resolution-and-overlay-structure.spec.md` | Overlay Type-to-Filename Mapping table (lines 53-61); Behavior 10 (markdown overlay read semantics) | Rename `charter-overlay` → `charter-template`, `spec-overlay` → `spec-template` in mapping table. Update Behavior 10 to reference "template" types instead of "overlay" types. |
| `domain-aware-skill-integration.spec.md` | Behavior 2 (`loadOverlay(domain, "charter-overlay")`); Behavior 4 (`loadOverlay(domain, "spec-overlay")`); Actionable Task Map (charter/spec merge function tasks) | Update Behaviors 2 and 4 to use `charter-template` and `spec-template` type names. Remove references to `mergeTemplateOverlay()`. Mark merge function tasks as obsolete. |
| `bundled-domain-profiles.spec.md` | Overlay File Inventory table (lines 33-41); Behaviors 1-2, 8-9, 15-16 (overlay loading); Behavior 22 (file inventory); Acceptance Criteria (lines 149-151) | Rename `charter-overlay.md` → `charter-template.md`, `spec-overlay.md` → `spec-template.md` throughout. Update file inventory and ACs. |

**Charter entity update:** The charter's Domain Model entity `TemplateOverlay` ("Markdown file that replaces or renames sections in a base template", attributes: `type`, `domain`, `sections[]`) must be renamed to `DomainTemplate` with updated description: "Complete markdown template for a domain's charter or spec structure" and attributes: `type` (charter/spec), `domain`.

## Target State

### Structure

| File | Role | Notes |
|------|------|-------|
| `templates/domains/software/charter-template.md` | Complete charter template for software domain | Renamed from `charter-overlay.md`; content is a full template (same content as `templates/charter-template.md`) |
| `templates/domains/software/spec-template.md` | Complete spec template for software domain | Renamed from `spec-overlay.md`; content is a full template (same content as `templates/live-spec-template.md`) |
| `templates/domains/data-engineering/charter-template.md` | Complete charter template for data-engineering domain | Full template with Data Model, Data Contract, Pipeline Stages, Data Lineage |
| `templates/domains/data-engineering/spec-template.md` | Complete spec template for data-engineering domain | Full template with Failure Mode / Recovery Action, Data Quality Expectations, Output Schema |
| `templates/domains/process-automation/charter-template.md` | Complete charter template for process-automation domain | Full template with Integration Points, Workflow Steps, Recovery & Compensation |
| `templates/domains/process-automation/spec-template.md` | Complete spec template for process-automation domain | Full template with Trigger / Outcome, Integration Points, Recovery Actions |
| `lib/domains/constants.mjs` | Updated overlay type registry | `charter-overlay` -> `charter-template`, `spec-overlay` -> `spec-template` |
| `lib/domains/overlay.mjs` | Template loader | Returns full template string for template types (same read path, different filename) |
| `skills/brainstorm/SKILL.md` | Charter authoring skill | Loads domain template, references it as "the template" — no hardcoded section names in prose |
| `skills/specify/SKILL.md` | Spec authoring skill | Loads domain template, references it as "the template" — no hardcoded section names in prose |
| `templates/charter-template.md` | Kept as fallback | Unchanged — used when no domain is resolved (defensive only) |
| `templates/live-spec-template.md` | Kept as fallback | Unchanged — used when no domain is resolved (defensive only) |

### Improvements

1. **Single source of truth.** Each domain ships a complete template. The skill loads it and says "use this template's section structure." No competing prose instructions.

2. **LLM-reliable.** The agent sees one template with domain-specific sections. No merging, no dynamic variables to track — just "fill this template." This matches how LLMs process instructions.

3. **Simpler code path.** `loadOverlay()` reads a file and returns it. No H2 parsing, no section matching, no merge logic. The `mergeTemplateOverlay()` function is removed.

## Migration Path

### Step 1: Create full templates from overlays + base

- **What:** For each domain, produce a complete `charter-template.md` by applying the current overlay to the base template using `mergeTemplateOverlay()`. Do the same for `spec-template.md`. Verify the output matches the domain's intended sections. Then replace the overlay files with the full templates.
- **Why first:** The content must exist before anything can reference it.
- **Risk:** Low — deterministic transformation of existing content.
- **Verification:** Write a one-time migration test that generates templates via `mergeTemplateOverlay(base, overlay)` for each domain and asserts the output matches the committed `charter-template.md` / `spec-template.md` files. Each template is a valid markdown file with all expected H2 sections for its domain.

### Step 2: Update constants and overlay loader

- **What:** In `lib/domains/constants.mjs`, rename `charter-overlay` -> `charter-template` and `spec-overlay` -> `spec-template` in `OVERLAY_TYPES`, `OVERLAY_FILENAMES`, and `STRUCTURED_OVERLAY_TYPES` (remove template types from structured set since they return strings). Update `loadOverlay()` to use the new filenames.
- **Why next:** The loader must resolve the new filenames before skills can use them.
- **Risk:** Low — filename change in a registry constant.
- **Verification:** `loadOverlay(domain, 'charter-template', ...)` returns the full template string. Existing YAML overlay loading unchanged.

### Step 3: Update brainstorm and specify skills

- **What:** In `skills/brainstorm/SKILL.md`: replace the `mergeTemplateOverlay()` call with a direct `loadOverlay(domain, 'charter-template')` call. Remove hardcoded section names from Steps 2, 4, and the Step 5 write instruction (`${CLAUDE_PLUGIN_ROOT}/templates/charter-template.md` reference at line 234 must use the loaded domain template instead). Replace with instructions to "use the loaded template's section structure." In `skills/specify/SKILL.md`: same pattern for `loadOverlay(domain, 'spec-template')`, including the Step 5 write instruction (`${CLAUDE_PLUGIN_ROOT}/templates/live-spec-template.md` reference at line 300).
- **Why next:** Skills must reference the new overlay type names.
- **Risk:** Medium — changes LLM-facing instructions. Must verify the agent still produces correct charters/specs.
- **Verification:** Run brainstorm with each domain and verify the output uses the domain's section names.

### Step 4: Remove mergeTemplateOverlay and update tests

- **What:** Delete `lib/domains/merge-template-overlay.mjs`. Update `tests/domains/bundled-profiles.test.mjs` to check for `charter-template.md` and `spec-template.md` instead of overlay files. Update `tests/domains/backward-compat.test.mjs` to verify templates load correctly. Remove `tests/lib/domains/merge-template-overlay.test.mjs`.
- **Why last:** Clean up only after all consumers are migrated.
- **Risk:** Low — removing dead code.
- **Verification:** All tests pass. No imports of `merge-template-overlay.mjs` remain.

## Invariants

- [ ] All existing tests continue to pass at every step (after test file updates in Step 4)
- [ ] YAML overlay loading (reviewers, gates, verification, gate-config, test-config) is completely unchanged
- [ ] Custom domain `extends` chain works for template types: a custom domain can override `charter-template.md` and missing files fall back to the parent
- [ ] `loadOverlay()` return type for template types remains `string|null` (same as overlay types)
- [ ] The software domain template produces identical charter/spec structure to the current base templates (backward compatibility)
- [ ] Each bundled domain profile directory still contains exactly 7 files (2 templates + 5 YAML configs)
- [ ] No hardcoded section names remain in brainstorm or specify SKILL.md prose

## Behavioral Contract

### Behaviors

1. **When** `loadOverlay(domain, 'charter-template', repoRoot, pluginRoot)` is called **then** it returns the full charter template markdown string for the resolved domain (not an overlay fragment).

2. **When** `loadOverlay(domain, 'spec-template', repoRoot, pluginRoot)` is called **then** it returns the full spec template markdown string for the resolved domain.

3. **When** `/adev:brainstorm` starts and resolves `domain: data-engineering` **then** it loads the data-engineering `charter-template.md` which contains "Data Model", "Data Contract", "Data Lineage", "Pipeline Stages" as section names — and the agent uses these names in the charter it produces, not software-centric names.

4. **When** `/adev:specify` starts and resolves `domain: data-engineering` **then** it loads the data-engineering `spec-template.md` which contains "Failure Mode / Recovery Action" error columns and "Data Quality Expectations" — and the agent uses these in the spec it produces.

5. **When** `/adev:brainstorm` starts and resolves `domain: software` (or no domain declared) **then** it loads the software `charter-template.md` which contains the current section names (Business Intent, Domain Model, Interface Contracts, Quality Attributes) — identical behavior to today.

6. **When** a custom domain has `extends: software` and provides only `charter-template.md` **then** `loadOverlay()` returns the custom charter template for `charter-template` type and falls back to the software profile's `spec-template.md` for the spec template type.

7. **When** `loadOverlay()` is called with the old overlay type names (`charter-overlay`, `spec-overlay`) **then** it emits a deprecation warning (`OVERLAY_TYPE_DEPRECATED: "charter-overlay" has been renamed to "charter-template". Update your domain profile files.`) and returns `null`.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Domain template file is missing (e.g., deleted from plugin installation) | `loadOverlay()` returns `null`; skill warns and falls back to `templates/charter-template.md` or `templates/live-spec-template.md` | DOMAIN_NOT_FOUND |
| Template file exceeds MAX_OVERLAY_SIZE | `loadOverlay()` throws with error code `OVERLAY_TOO_LARGE` (matching resolution spec Behavior 13) | OVERLAY_TOO_LARGE |
| Caller uses deprecated overlay type name (`charter-overlay`, `spec-overlay`) | `loadOverlay()` emits deprecation warning and returns `null` | OVERLAY_TYPE_DEPRECATED |
| Custom domain has `charter-template.md` but not `spec-template.md` | `loadOverlay()` returns custom charter template; falls back to parent for spec template via `extends` chain | — |

## System Constitution Reference

- **"Skills are primarily markdown"** — Domain templates are pure markdown files. No executable logic. The refactoring removes code (`mergeTemplateOverlay`) and replaces it with static files.
- **"Minimize external dependencies"** — No dependencies added. One module removed.

## Acceptance Criteria

- [ ] `templates/domains/software/charter-template.md` exists and contains all current charter sections
- [ ] `templates/domains/software/spec-template.md` exists and contains all current spec sections
- [ ] `templates/domains/data-engineering/charter-template.md` is a complete template with data-domain vocabulary
- [ ] `templates/domains/data-engineering/spec-template.md` is a complete template with data-domain vocabulary
- [ ] `templates/domains/process-automation/charter-template.md` is a complete template with workflow-domain vocabulary
- [ ] `templates/domains/process-automation/spec-template.md` is a complete template with workflow-domain vocabulary
- [ ] `lib/domains/constants.mjs` registers `charter-template` and `spec-template` instead of `charter-overlay` and `spec-overlay`
- [ ] `loadOverlay()` returns full template strings for template types
- [ ] `lib/domains/merge-template-overlay.mjs` is deleted
- [ ] `skills/brainstorm/SKILL.md` has zero hardcoded charter section names — references the loaded template
- [ ] `skills/specify/SKILL.md` has zero hardcoded spec section names — references the loaded template
- [ ] Software domain template produces identical charter/spec structure to current base templates
- [ ] Custom domain `extends` chain works for template types (missing files inherit from parent)
- [ ] Each domain profile directory still contains exactly 7 files
- [ ] Sibling specs (domain-resolution, skill-integration, bundled-profiles) updated to revision 6 with renamed type/file references
- [ ] Charter entity `TemplateOverlay` renamed to `DomainTemplate` with updated description
- [ ] Old overlay type names (`charter-overlay`, `spec-overlay`) emit deprecation warning via `loadOverlay()`
- [ ] Brainstorm Step 5 and specify Step 5 reference the loaded domain template, not hardcoded base template paths
- [ ] All quality gates pass (tests)
- [ ] No constitutional violations introduced
