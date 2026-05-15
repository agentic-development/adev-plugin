# Charter Format Audit — Charter Kinds and Template Bifurcation

**Date:** 2026-05-14
**Scope:** 41 charter folders under `.context-index/specs/features/`, charter template (`features/.charter-template.md`), manifest module slugs, and cross-reference with actual code paths.
**Companion artifact:** `.context-index/research/spec-taxonomy-audit.md` (spec-mode taxonomy). This audit applies the same lens one level up.

## Problem

The charter layer has the same structural unhappiness as the spec layer, one level up: a **single template** (`.charter-template.md`) is being stretched over what are actually **four or more distinct kinds of artifact**. Authors quietly invent local conventions, the template is informally bifurcated in practice, and the manifest can't tell which charters are real modules versus features versus cross-cutting concerns versus time-bounded initiatives.

## The template is already bifurcated in practice

Two shapes exist in the wild, both labeled "charter":

| Shape | Used by | Sections actually filled |
|---|---|---|
| **Skill registry** | 9 lifecycle-slot modules (`cli`, `hooks`, `design`, `planning`, `implementation`, `validation`, `maintenance`, `setup`, `strategic-planning`) | Purpose / Skills / Key Behaviors / Key Files. No Domain Model. No Capability Map. No Interface Contracts. |
| **Specification doc** | 21 feature charters (`assess`, `domain-profiles`, `test-strategies`, `infra-preflight`, `output-personas`, `debug-playbooks`, `review`, etc.) | Full six-section template. Well-populated. |

Both shapes are valid documents — they're not the same kind of document. The template doesn't distinguish them, so the convention drifted into two informal dialects.

## Inventory by archetype

| Archetype | Count | Examples |
|---|---|---|
| **Lifecycle-slot module** (1:1 with manifest.yaml) | 9 | `cli`, `hooks`, `setup`, `design`, `planning`, `implementation`, `validation`, `maintenance`, `strategic-planning` |
| **Feature module** (real code, no manifest slot) | 21 | `domain-profiles`, `test-strategies`, `output-personas`, `infra-preflight`, `task-management`, `session-awareness`, `heuristics`, `spec-lifecycle`, etc. |
| **Cross-cutting concern misplaced under `features/`** | 5 | `cicd`, `context-viz`, `tiered-test-gates`, `unified-gates`, plus `multi-repo-workspace` (arguably) |
| **Refactor effort wearing a feature mask** | 1 | `agent-reliable-state-artifacts` (markdown → JSON storage migration) |
| **Pure spec, no code** | 5 | `debug-playbooks`, `eval-projects`, `repomap-eval`, `user-docs`, `context-viz` |
| **Naming collisions / overlap** | — | `assess` ↔ `assessment`; `extensions` ↔ `domain-extensions`; `tree-sitter-repomap` ↔ `repomap-eval`; `codehealth` listed standalone AND under `maintenance` |

## Manifest vs. charter folder mismatch

- `manifest.yaml` declares **11 modules**: `cli`, `hooks`, `setup`, `triage`, `design`, `assessment`, `planning`, `implementation`, `validation`, `strategic-planning`, `maintenance`.
- `specs/features/` contains **41 charter folders**.
- Only 9 charters have a corresponding manifest entry. **30+ charters are not registered as modules.**
- 1 manifest module (`triage`) has **no charter** at all.

This means the manifest is currently a list of *lifecycle slots*, while `features/` is a free-form scratchpad for anything-larger-than-a-spec. The two structures don't reconcile.

## Code alignment

Cross-referencing the 41 charter folder names against actual code paths (`cli/`, `hooks/`, `skills/`, `lib/`, `templates/`, `extensions/`):

- **Perfect alignment (9):** lifecycle-slot modules — charter exists, manifest entry exists, code path exists.
- **Good alignment (15):** feature modules with real code (`lib/domains/`, `lib/test-strategies/`, `lib/persona.mjs`, `lib/infra-preflight.mjs`, etc.) — charter reflects code, no manifest entry needed.
- **Pure spec, no code (5):** `debug-playbooks`, `eval-projects`, `repomap-eval`, `user-docs`, `context-viz` — aspirational or stalled.
- **Misplaced (5):** charters in `features/` that should live in `specs/cross-cutting/`.

## Naming and overlap collisions

| Collision | Diagnosis | Action |
|---|---|---|
| `assess` vs. `assessment` | Distinct concepts (codebase scoring vs. spec review/routing). Names actively mislead. | Rename one or both: e.g., `codebase-assess`, `spec-assess`. |
| `extensions` vs. `domain-extensions` | Overlap. `extensions` is the general framework (draft, broader); `domain-extensions` is content-only domain packages (approved, narrower). | Consolidate: `domain-extensions` becomes a capability of `extensions`. |
| `codehealth` standalone + under `maintenance` | Duplicate registration in product.md Module Map. | Pick one; remove the other. |
| `tree-sitter-repomap` (1 spec) + `repomap-eval` (1 spec) | Both single-capability charters; over-decomposed. | Merge under `maintenance` or a unified `repomap` charter. |
| `prototype-brainstorm` vs. `design` | `prototype-brainstorm` is a subfeature of `/adev:brainstorm` (Step 3b). | Demote to deferred capability under `design`. |
| `user-docs` | Documentation artifact, not a feature. | Move to `docs/` as a documentation project; remove from `features/`. |

## Diagnosis (same shape as the spec audit, one level up)

| Spec layer | Charter layer |
|---|---|
| One template for 6 spec intents | One template for ≥4 charter kinds |
| Junk-drawer charters (`domain-extensions/` mixing 3 modes) | Misplaced charters (`cicd`, `tiered-test-gates` under `features/` instead of `cross-cutting/`) |
| Fragmentation (`test-strategies` = 19 specs, `agent-reliable-state-artifacts` = 9 specs) | Same fragmentation visible (`spec-lifecycle` = 12 specs, `multi-repo-workspace` = 13, `session-awareness` = 9) |
| Action specs disguised as features | Refactor charters disguised as features (`agent-reliable-state-artifacts`) |
| Post-hoc status labeling | Charter status drift (`extensions`, `eval-projects` stuck in `draft`) |

## Proposed charter-kind taxonomy

Four kinds, parallel in structure to the six spec modes:

| Kind | Definition | Section shape that fits | Manifest membership |
|---|---|---|---|
| `module` | Lifecycle-slot module — owns a code path, registered in `manifest.yaml`, treated as constitutional. | Purpose / Skills / Key Behaviors / Key Files. Skill registry shape. | Required entry in `manifest.yaml:modules[]` |
| `feature` (default) | Feature module — discrete capability, may have code, not a lifecycle slot. | Full six-section: Business Intent, Scope, Domain Model, Capability Map, Interface Contracts, Quality Attributes. | Optional |
| `cross-cutting` | Concern affecting many modules. Lives in `specs/cross-cutting/`, not `features/`. | Five-section: Business Intent, Scope, Affected Modules, Interface Contracts, Quality Attributes. (No Domain Model — entities belong to the affected modules.) | Disallowed (it's not a module) |
| `initiative` | Time-bounded effort (migration, theme, release). Auto-archives after completion. | Business Intent, Scope, Current State, Target State, Migration Plan, Acceptance Criteria. (Closer to a refactor spec at the charter level.) | Disallowed; usually wraps work that crosses multiple modules |

## Concrete moves (informs Layer 2 expansion)

- **Move to `specs/cross-cutting/`:** `cicd`, `context-viz`, `tiered-test-gates`, `unified-gates`, and possibly `multi-repo-workspace`.
- **Mark as `kind: initiative`:** `agent-reliable-state-artifacts` (migration effort, time-bounded).
- **Consolidate:** `extensions` ← `domain-extensions`; `tree-sitter-repomap` + `repomap-eval` → `repomap` (under `maintenance`); `prototype-brainstorm` → deferred capability of `design`.
- **Rename to disambiguate:** `assess` / `assessment` → `codebase-assess` / `spec-assess` (or similar).
- **Remove from `features/`:** `user-docs` → `docs/`.
- **Mark dead / re-scope:** `eval-projects` (draft, no motion); `deploy` (clarify whether ready to approve).

## Implications for the framework primitive (Layer 1)

The framework primitive should add **both** discriminators in one cohesive pass:

- `mode:` for specs (six modes), per `spec-taxonomy-audit.md`
- `kind:` for charters (four kinds), per this audit

One ADR documenting both taxonomies. One template-resolution mechanism that handles both. `/adev:brainstorm` routes by `kind:`; `/adev:specify` routes by `mode:`. The shapes rhyme by design.

## Acceptance for Layer 1 (expanded)

Per `spec-taxonomy-audit.md`, plus:

- [ ] Charter `kind:` field defined (default `feature` for backward compatibility on 41 existing charters)
- [ ] Three new charter templates added: `.charter-template.module.md`, `.charter-template.cross-cutting.md`, `.charter-template.initiative.md`. Existing `.charter-template.md` becomes the `feature` template (or is renamed `.charter-template.feature.md`).
- [ ] `/adev:brainstorm` prompts for `kind:` and routes to the matching template
- [ ] Light kind-awareness in `/adev:hygiene` where useful (e.g., flag a `kind: module` charter that has no `manifest.yaml` entry)
