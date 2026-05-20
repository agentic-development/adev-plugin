---
kind: initiative
status: approved
revision: 3
updated: 2026-05-19
---

# Feature Charter: lifecycle-artifacts

## Business Intent

The `lifecycle-artifacts` module defines the structural taxonomy for adev's lifecycle artifacts — the specs and charters that authors and skills produce. It introduces a single `kind:` discriminator in frontmatter (six values for specs, four for charters), a per-kind template matrix, and a strict-for-new + soft-for-legacy validation posture that lets the taxonomy land without invalidating the 178 existing specs and 41 existing charters. `/adev:specify` and `/adev:brainstorm` learn to route by `kind:` so authoring conversations use the right vocabulary from the first prompt.

This charter is Layer 1 of epic-73 (*Spec and charter taxonomy: modes and kinds*). The audits and cross-framework research that produced the design are captured in `.context-index/research/spec-taxonomy-audit.md`, `.context-index/research/charter-format-audit.md`, `.context-index/research/cross-framework-artifact-kinds.md`, and `.context-index/research/sdd-frameworks-comparison.md`.

## Scope and Boundaries

### In Scope

- `kind:` frontmatter field on `.spec.md` and `charter.md`
- Six spec kinds: `behavioral` (default for legacy), `refactor`, `action`, `skill`, `integration`, `artifact`
- Four charter kinds: `module`, `feature` (default for legacy), `cross-cutting`, `initiative`
- Ten new templates following `.{charter,spec}-template.<kind>.md`
- Rename of two existing templates to fit the new convention:
  - `.live-spec-template.md` → `.spec-template.behavioral.md`
  - `.refactoring-spec-template.md` → `.spec-template.refactor.md`
- Template-resolution helper: `(artifact_layer, kind, domain) → template_path`
- `/adev:specify` ask-first kind prompt and routing
- `/adev:brainstorm` ask-first kind prompt and routing
- Reconciliation of `/adev:specify`'s existing workflow modes (`extraction`, `diff-driven`, etc.) as orthogonal to `kind:` — workflow and artifact-shape on separate axes
- Mild kind-awareness in `/adev:hygiene`: validate `kind:` values; warn on `kind: module` without manifest entry
- ADR-0009 covering both taxonomies, the unified `kind:` field, posture, and resolution mechanics
- Action template using Devin-style postcondition-first framing (Postconditions / Procedure / Idempotency / Rollback)
- Refactor template adds a Changes Catalog section (`### ADDED / ### MODIFIED / ### REMOVED / ### RENAMED`) additive to existing Migration Path
- Smoke validation: at least one new spec authored in each new kind and one new charter in each new kind before declaring Layer 1 done

### Out of Scope

Deferred to `issue-463` (Layer 2 — adev-plugin self-cleanup):
- Backfilling `kind:` on the 178 existing specs and 41 existing charters
- Splitting fragmented charters (`test-strategies` 19→3, `agent-reliable-state-artifacts` 9→4, `heuristics` 11→3)
- Moving misplaced cross-cutting charters to `specs/cross-cutting/` (`cicd`, `context-viz`, `tiered-test-gates`, `unified-gates`, possibly `multi-repo-workspace`)
- Consolidating duplicates (`assess`/`assessment` rename; `extensions` ← `domain-extensions`; `tree-sitter-repomap` + `repomap-eval` → `repomap`)
- Marking `agent-reliable-state-artifacts` as `kind: initiative`
- Relocating `user-docs` to `docs/`
- Superseding the stale `CONSISTENCY-REVIEW.md`

Deferred to `issue-464` (Layer 3 — domain extension matrix):
- Per-domain template overrides under `extensions/<domain>/domain/spec-template.<kind>.md` and `charter-template.<kind>.md`
- Updating `data-engineering` and `process-automation` extensions for the matrix
- Documenting the (kind × domain) pattern for future extension authors

### Dependencies

| Module | Direction | Why |
|---|---|---|
| `spec-lifecycle` | Adjacent | `kind:` is a sibling of `status:`/`revision:` in spec frontmatter — orthogonal axes; no conflict |
| `domain-profiles` | Consumes | Template resolution extends `loadDomainConfig()` to accept a kind argument |
| `cross-cutting/spec-file-suffixes` | Consumes | New template filenames follow the existing dotted-suffix convention |
| `design` (brainstorm + specify skills) | Modifies | Both skills gain kind-aware prompting and routing |
| `maintenance` (hygiene) | Modifies | New audit pass for kind validity |
| Domain Extensions | Future consumer | Layer 3 builds the kind × domain matrix on this primitive |

## Domain Model

### Entities

| Entity | Description | Key Attributes |
|---|---|---|
| Kind | A discriminator value identifying the structural shape of a lifecycle artifact | `name` (e.g., `behavioral`, `module`), `layer` (`spec` \| `charter`), `is_default_for_layer` (bool), `template_path`, `vocabulary` (section headings + frontmatter fields it expects) |
| Spec | A `.spec.md` file with one `kind:` from the spec-layer enumeration | `path`, `kind`, `charter`, `status`, `revision` (kind orthogonal to status/revision) |
| Charter | A `charter.md` file with one `kind:` from the charter-layer enumeration | `path`, `kind`, `status`, `revision`, `module_slug` (only when `kind: module`) |
| Template | A `.{charter,spec}-template.<kind>.md` file providing the section skeleton for one kind | `path`, `kind`, `artifact_layer`, `domain` |
| TemplateResolution | A function `(artifact_layer, kind, domain) → template_path` falling through domain → bundled defaults | inputs: `artifact_layer`, `kind`, `domain` |

### Relationships

- A Kind belongs to exactly one artifact layer (spec or charter); the enumerations do not overlap
- A Spec has exactly one Kind from the spec-layer enumeration
- A Charter has exactly one Kind from the charter-layer enumeration
- A Template implements exactly one (artifact_layer, kind) combination per domain
- TemplateResolution returns the most-specific template available; falls back to the bundled `software` default when no domain override exists

### Invariants

- **New artifacts (authored after Layer 1 lands) MUST carry an explicit `kind:` in frontmatter.** `/adev:specify` and `/adev:brainstorm` write the resolved kind value verbatim; missing or invalid values are rejected at authoring time. No defaulting on write.
- **Legacy artifacts (the 178 existing specs and 41 existing charters)** are treated as the layer default at read time when `kind:` is absent; not modified on disk by Layer 1.
- `kind:` value must be from the closed enumeration for that artifact layer. Invalid values on new artifacts are rejected; invalid values on legacy artifacts are reported by `/adev:hygiene` (non-blocking).
- A `kind: module` charter must correspond to a `manifest.yaml:modules[]` entry (soft validation; hygiene warns).
- A `kind: cross-cutting` charter must live under `specs/cross-cutting/`, not `specs/features/` (Layer 2 enforces; Layer 1 advisory).
- The spec kind enumeration is closed and disjoint from the charter kind enumeration. Adding a kind requires an ADR amendment.

## Capability Map

| Capability | Description | Priority | Milestone | Status |
|---|---|---|---|---|
| Kind enumeration | Closed set: 6 spec kinds + 4 charter kinds in `lib/kinds.mjs` with `isValidKind(layer, kind)` validator | must-have | spec-and-charter-taxonomy | validated |
| Frontmatter discriminator | `kind:` field on specs and charters; required-on-write for new artifacts; default-at-read for legacy | must-have | spec-and-charter-taxonomy | validated |
| Template matrix | 10 new dotfile templates following the `.{charter,spec}-template.<kind>.md` convention | must-have | spec-and-charter-taxonomy | implemented |
| Template renames | `.live-spec-template.md` → `.spec-template.behavioral.md`; `.refactoring-spec-template.md` → `.spec-template.refactor.md` | must-have | spec-and-charter-taxonomy | implemented |
| Template-resolution helper | `resolveTemplate(layer, kind, domain)` API resolving through domain → bundled fallback | must-have | spec-and-charter-taxonomy | validated |
| `/adev:specify` kind routing | Ask-first menu with one-line per kind; route to matching template; reject invalid values | must-have | spec-and-charter-taxonomy | validated |
| `/adev:brainstorm` kind routing | Same pattern at the charter layer | must-have | spec-and-charter-taxonomy | validated |
| Workflow/kind orthogonality | `/adev:specify`'s existing `--mode {extraction,diff-driven,...}` flags reconciled as orthogonal axis to `--kind` | must-have | spec-and-charter-taxonomy | validated |
| Kind-aware hygiene | Validate `kind:` values across the spec/charter library; warn on `kind: module` without manifest entry | should-have | spec-and-charter-taxonomy | implemented |
| Action template (Devin-style) | Postconditions / Procedure / Idempotency / Rollback | must-have | spec-and-charter-taxonomy | implemented |
| Refactor template Changes Catalog | OpenSpec-style `ADDED/MODIFIED/REMOVED/RENAMED` subsections additive to Migration Path | must-have | spec-and-charter-taxonomy | implemented |
| Skill / integration / artifact templates | Three remaining new spec templates; sections sized to each kind's shape | must-have | spec-and-charter-taxonomy | implemented |
| Module / cross-cutting / initiative templates | Three new charter templates; existing `.charter-template.md` becomes the `feature` template | must-have | spec-and-charter-taxonomy | validated |
| ADR-0009 | Single ADR covering unified `kind:`, both enumerations, posture, resolution mechanics, public-API surface | must-have | spec-and-charter-taxonomy | validated |
| Smoke validation suite | At least one new spec authored in each new kind + one new charter in each new kind | must-have | spec-and-charter-taxonomy | validated |

### Deferred Capabilities

| Capability | Reason | Target Milestone | Depends On |
|---|---|---|---|
| Backfill `kind:` on 178 specs and 41 charters | Layer 2 self-cleanup | next | Layer 1 ships first |
| Domain extension template matrix | Layer 3 | future | Layer 1 + Layer 2 |
| New kind: additions beyond v1 | Closed enumeration by design; requires ADR amendment | n/a | — |

## Interface Contracts

### Exposed APIs

| Interface | Type | Description |
|---|---|---|
| `kind:` frontmatter field | data contract | Declared by every spec and charter; consumed by skills, hygiene, downstream tooling |
| `.{charter,spec}-template.<kind>.md` | file convention | Template filenames following the dotted-suffix pattern. Live in two locations: `templates/` (plugin-bundled defaults, copied into new projects by `/adev:init`) and `.context-index/specs/features/` (user-editable dotfile copies in initialized projects). Layer 1 updates both. |
| `lib/kinds.mjs` exports | function | `SPEC_KINDS`, `CHARTER_KINDS`, `isValidKind(layer, kind)`, `defaultKindFor(layer)`. New module sited as a peer of `lib/domains/domain-config.mjs`. |
| `resolveTemplate(layer, kind, domain)` | function | Template-path resolver consumed by `/adev:specify`, `/adev:brainstorm`, `/adev:init` |

### Consumed APIs

| Interface | Source Module | Description |
|---|---|---|
| `loadDomainConfig()` | `domain-profiles` (`lib/domains/domain-config.mjs`) | Extended in Layer 3 to take a kind argument; Layer 1 uses bundled `software` defaults only |
| Spec/charter frontmatter parser | `spec-lifecycle` (existing utilities) | Adds `kind:` to recognized frontmatter fields |
| Hygiene audit framework | `maintenance` (`/adev:hygiene`) | New audit pass for kind validity |
| `manifest.yaml:modules[]` | `setup` | Hygiene cross-references `kind: module` charters against manifest entries |

## Quality Attributes

| Attribute | Requirement |
|---|---|
| Backward compatibility | Zero changes required to the 178 existing specs and 41 existing charters at v1 ship; defaults applied at read time only **for legacy artifacts**. New artifacts get strict validation on write (see next row). No flag-day migration. |
| Strict validation for new artifacts | New specs/charters authored after Layer 1 via `/adev:specify` or `/adev:brainstorm` must have an explicit, valid `kind:` written to frontmatter at authoring time. Invalid values are rejected; the skill re-prompts. No defaulting on write. |
| Soft validation for legacy | Missing `kind:` on pre-Layer-1 artifacts is treated as the layer default at read time (`behavioral` for specs, `feature` for charters); invalid values are reported by `/adev:hygiene` as non-blocking warnings. Disk content is not modified by Layer 1. |
| Performance | Template resolution adds zero observable latency (one filesystem stat per resolve). |
| Discoverability | Authors learn the taxonomy by being prompted; no separate documentation campaign required. |
| Extensibility | New kinds require an ADR amendment + a new template file; the closed enumeration is intentional. |
| Constitution compliance | Templates are public-API surface; ADR-0009 documents the change. Node built-ins only (no new dependencies). ESM with `.mjs` extension. |
