---
charter: lifecycle-artifacts
kind: refactor
status: validated
risk_level: low
milestone: spec-and-charter-taxonomy
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/template-renames.plan.md

source-manifest:
  sha: "0fefc10"
  files:
    - .context-index/specs/features/.spec-template.behavioral.md
    - .context-index/specs/features/.spec-template.refactor.md
    - cli/index.mjs
    - providers/codex/skills/specify/SKILL.md
    - providers/opencode/skills/specify/SKILL.md
    - skills/specify/SKILL.md
    - templates/spec-template.behavioral.md
    - templates/spec-template.refactor.md
    - tests/cli.test.mjs
    - tests/lib/infra-preflight.test.mjs
    - tests/templates/spec-template.behavioral.test.mjs
    - tests/visual-verification.test.mjs
  computed-at: "2026-05-15T15:14:03.286Z"
drift_detected: true
drift_source: templates/spec-template.refactor.md
drift_at: 2026-05-15T17:40:33.005Z
---

# Refactoring Spec: Template Renames

<!-- Renames the existing live-spec and refactoring-spec templates to match the new
     .{charter,spec}-template.<kind>.md naming convention. Mechanical rename with
     grep-based reference update across skills and lib. -->

## Scope Boundary

**This spec covers spec templates only.** The rename of `templates/charter-template.md → templates/charter-template.feature.md` (and its dotfile counterpart) is owned by `charter-templates.spec.md`. The "Zero references to old filenames" grep in this spec's acceptance criteria is scoped to the four spec-template files listed below; the charter template is excluded from this spec's grep verification.

## Current State

### Structure

| File | Role | References |
|---|---|---|
| `.context-index/specs/features/.live-spec-template.md` | User-editable behavioral spec template (dotfile, project-local) | `skills/specify/SKILL.md` |
| `.context-index/specs/features/.refactoring-spec-template.md` | User-editable refactor spec template (dotfile) | `skills/specify/SKILL.md` |
| `templates/live-spec-template.md` | Bundled behavioral template; copied by `/adev:init` | `cli/index.mjs`, multiple SKILL.md files |
| `templates/refactoring-spec-template.md` | Bundled refactor template; copied by `/adev:init` | `skills/specify/SKILL.md` |

### Problems

1. Filenames do not encode the `kind:` value, so template-resolution cannot map `(layer, kind) → path` mechanically. Resolution would require a hardcoded translation (`behavioral → live-spec`, `refactor → refactoring-spec`) — fragile and inconsistent with the new convention.
2. Asymmetry: behavioral uses `live-spec`; refactor uses `refactoring-spec`. The new templates being added all follow `<artifact>-template.<kind>.md`; keeping the two existing names breaks the pattern from day one.
3. Adding four new spec templates without renaming the existing two creates three different naming conventions living forever in the same directory.

### Dependencies

- `skills/specify/SKILL.md` references both bundled templates by path
- `skills/brainstorm/SKILL.md` references the bundled charter template (separate concern, but adjacent)
- `skills/init/SKILL.md` and `cli/index.mjs` copy bundled templates during scaffolding
- `lib/domains/domain-config.mjs` resolves domain template overrides (path lookups)
- Bundled extensions (`extensions/data-engineering/`, `extensions/process-automation/`) reference domain spec templates

## Target State

### Structure

| File | Role |
|---|---|
| `.context-index/specs/features/.spec-template.behavioral.md` | (renamed from `.live-spec-template.md`) |
| `.context-index/specs/features/.spec-template.refactor.md` | (renamed from `.refactoring-spec-template.md`) |
| `templates/spec-template.behavioral.md` | (renamed from `templates/live-spec-template.md`) |
| `templates/spec-template.refactor.md` | (renamed from `templates/refactoring-spec-template.md`) |

### Improvements

1. Filenames now encode `kind:` directly. `resolveTemplate('spec', 'behavioral', null)` maps mechanically to `templates/spec-template.behavioral.md`. No translation table.
2. Symmetry restored: all spec templates follow `spec-template.<kind>.md`; all charter templates follow `charter-template.<kind>.md`.
3. The four new spec templates land into a coherent directory shape.

## Migration Path

### Step 1: Rename the four files

- **What:** `git mv` four files to preserve history.
- **Why first:** Atomic move with rename preservation; subsequent steps update references.
- **Risk:** Low — content unchanged.
- **Verification:** `git log --follow` shows preserved history; old paths no longer exist.

### Step 2: Update references in skills/

- **What:** Grep all `skills/**/SKILL.md` files for `live-spec-template` and `refactoring-spec-template`; replace with new names.
- **Why next:** Skills consume templates at runtime — references must match before any skill is exercised.
- **Risk:** Medium — must catch all references.
- **Verification:** `grep -r "live-spec-template\|refactoring-spec-template" skills/` returns zero matches.

### Step 3: Update references in lib/ and cli/

- **What:** Same grep across `lib/` and `cli/index.mjs`; replace.
- **Risk:** Medium.
- **Verification:** `grep -r "live-spec-template\|refactoring-spec-template" lib/ cli/` returns zero matches.

### Step 4: Update extension references

- **What:** Check `extensions/**/domain/spec-template.md` and any `adev-extension.yaml` for references; update if found.
- **Risk:** Low — extensions use the domain-specific template name `spec-template.md`, not the live/refactoring names.
- **Verification:** `grep -r "live-spec-template\|refactoring-spec-template" extensions/` returns zero matches.

### Step 5: Run tests

- **What:** `npm test`.
- **Risk:** Low.
- **Verification:** All tests pass; no path-not-found errors.

## Changes Catalog

### ADDED Requirements

- (none in this refactor — new templates are added by `spec-templates.spec.md` and `charter-templates.spec.md` separately)

### MODIFIED Requirements

- `skills/specify/SKILL.md` — every reference to `live-spec-template.md` and `refactoring-spec-template.md` updated to new names
- `skills/brainstorm/SKILL.md` — references updated where the brainstorm skill mentions adjacent spec template names
- `skills/init/SKILL.md` and `cli/index.mjs` — bundled-template copy paths updated
- Any `lib/*.mjs` modules that hardcode template paths — updated

### REMOVED Requirements

- (none — content is preserved by the rename)

### RENAMED Requirements

| Old Path | New Path |
|---|---|
| `.context-index/specs/features/.live-spec-template.md` | `.context-index/specs/features/.spec-template.behavioral.md` |
| `.context-index/specs/features/.refactoring-spec-template.md` | `.context-index/specs/features/.spec-template.refactor.md` |
| `templates/live-spec-template.md` | `templates/spec-template.behavioral.md` |
| `templates/refactoring-spec-template.md` | `templates/spec-template.refactor.md` |

## Invariants

- [ ] All existing tests continue to pass at every step
- [ ] Content of the four renamed files is unchanged (verify with `git diff --stat` showing only renames, no content delta)
- [ ] Every reference to the old filenames is updated; `grep -r "live-spec-template\|refactoring-spec-template"` returns zero matches in tracked code after the refactor
- [ ] `/adev:init` continues to scaffold a working `.context-index/` (templates are correctly copied under new names)

## Behavioral Contract

### Behaviors

1. **When** the rename PR lands **then** the four files exist at their new paths and no longer at their old paths.
2. **When** `/adev:specify` is invoked after the rename **then** it loads templates from the new paths without modification.
3. **When** `/adev:init` is invoked after the rename **then** it copies bundled templates from the new paths into `.context-index/specs/features/` under their new dotfile names.

### Error Cases

| Condition | Expected Behavior | Error Code |
|---|---|---|
| A reference to an old template path remains anywhere in the codebase | Test or skill invocation fails with `ENOENT` | `ENOENT` |
| `git mv` fails partway through | Roll back; no partial rename | — |

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Updating templates"** — Applies; template renames are autonomous changes by definition.
- **Principle 3: "Pure ESM"** — Renamed files retain their existing format; no extension change.

## Acceptance Criteria

- [ ] Four files renamed via `git mv`; history preserved
- [ ] Zero references to old filenames remain anywhere in tracked code
- [ ] All existing tests pass
- [ ] `/adev:init` scaffolds a working project with the renamed templates
- [ ] No content changes to the renamed files (rename-only diff)
- [ ] No constitutional violations introduced
