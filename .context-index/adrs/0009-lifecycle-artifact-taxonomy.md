# ADR 0009: Lifecycle Artifact Taxonomy — Spec Kinds and Charter Kinds

## Status

Accepted

> **Update 2026-06-02 (path correction)**: This ADR's decision was implemented. The single-template references below (`charter-template.md`, `live-spec-template.md` / `.live-spec-template.md`, `refactoring-spec-template.md`) were replaced by the kind-suffixed template set now on disk: `templates/charter-template.{feature,module,cross-cutting,initiative}.md` and `templates/spec-template.{behavioral,refactor,action,skill,integration,artifact}.md`. The taxonomy described here is current; only the template filenames changed.

## Date

2026-05-14

## Context

The `.context-index/specs/` library has grown to 178 `.spec.md` files across 41 charter folders. An audit (`.context-index/research/spec-taxonomy-audit.md`, `.context-index/research/charter-format-audit.md`) found that a **single template** (`.live-spec-template.md`) is being stretched over what are actually **six distinct kinds of intent**: behavioral contracts, refactor migrations, one-shot operational actions, skill/CLI surfaces, integrations between skills, and static artifact deliverables. At the charter layer, a parallel problem holds: one charter template covers ≥4 distinct kinds (manifest-registered modules, feature modules, cross-cutting concerns, time-bounded initiatives).

Observable consequences:

- **Charter junk drawers:** `domain-extensions/` holds 1 behavioral spec, 2 artifact-shaped specs, and 1 action spec — all using the same template.
- **Fragmentation:** Single capabilities split across many specs (`test-strategies` = 19; `agent-reliable-state-artifacts` = 9; `heuristics` = 11) because each phase or sub-component gets its own behavioral-shaped spec even when the work is one effort.
- **Post-hoc status labeling:** 0 specs in `draft`, ~150 in `validated`. Status is stamped after the fact rather than used as a prospective gate.
- **Skill specs and feature specs collapsed:** `adev-vision-skill.spec.md` lives next to `bundled-domain-profiles.spec.md` in the same folder, with the same template, despite specifying very different things.
- **Refactor mode underdeployed:** Only 3 of ~15 candidate refactor specs use `mode: refactor`.
- **Misplaced cross-cutting charters:** `cicd`, `context-viz`, `tiered-test-gates`, `unified-gates` live under `features/` despite being cross-cutting concerns.

Two cross-framework research artifacts (`.context-index/research/cross-framework-artifact-kinds.md`, `.context-index/research/sdd-frameworks-comparison.md`) validated three load-bearing patterns: (a) a named frontmatter discriminator is the dominant convention (Kubernetes `kind:`, PEP `Type:`, MADR `status:`, Agent OS, BMAD); (b) 3–6 kinds is the empirically validated sweet spot; (c) default-and-soft-validate beats forced migration (OpenAPI discriminator is documented as a tooling hint, not a hard gate). The SDD-peer comparison further showed that every peer framework that started with one template (Kiro, Spec-Kit) ended up retrofitting kind-specific variants — adev is doing in v1 what they retrofitted.

## Decision

Adopt a single discriminator field, **`kind:`**, on every `.spec.md` and `charter.md` frontmatter, with closed enumerations per artifact layer, per-kind templates, and a strict-on-write + soft-on-read validation posture.

### 1. Closed enumerations

**Spec kinds (6, closed):**

| Kind | Section shape | Use |
|---|---|---|
| `behavioral` (default) | Preconditions / Behaviors (When/Then) / Postconditions / Error Cases | Runtime behavior of a feature |
| `refactor` | Current State / Target State / Migration Path / Changes Catalog (`ADDED/MODIFIED/REMOVED/RENAMED`) / Invariants | Migration from current to target |
| `action` | Postconditions / Procedure / Idempotency / Rollback | One-shot operational task |
| `skill` | Invocation Modes / Arguments / Output Contract / Failure Modes | `/adev:*` CLI surface change |
| `integration` | Participants / Interaction Contract / State Machine / Error Propagation | Wiring two skills or modules together |
| `artifact` | Structural Shape / Required Files / Consumers | Static deliverable (package, template, fixture, schema) |

**Charter kinds (4, closed):**

| Kind | Section shape | Use |
|---|---|---|
| `module` | Purpose / Skills / Key Behaviors / Key Files | Lifecycle-slot module registered in `manifest.yaml:modules[]` |
| `feature` (default) | Business Intent / Scope / Domain Model / Capability Map / Interface Contracts / Quality Attributes | Discrete user-facing or framework capability |
| `cross-cutting` | Business Intent / Scope / Affected Modules / Interface Contracts / Quality Attributes | Concern spanning multiple modules; lives in `specs/cross-cutting/` |
| `initiative` | Business Intent / Scope / Current State / Target State / Migration Plan / Acceptance Criteria | Time-bounded effort; auto-archive after completion |

Adding, removing, or renaming a kind requires an ADR amendment.

### 2. Unified field name: `kind:`

Both layers (spec and charter) use the same frontmatter field name, `kind:`. The file path provides layer disambiguation (`*.spec.md` carries a spec kind; `charter.md` carries a charter kind). This matches K8s, PEP, MADR, Agent OS, BMAD, and every peer SDD framework surveyed. No `mode:` / `type:` parallel field; `kind:` is the sole discriminator.

### 3. Validation posture: strict on write, soft on read

- **New artifacts (authored after this ADR lands via `/adev:specify` or `/adev:brainstorm`)** MUST contain an explicit, valid `kind:` in frontmatter. Missing or invalid values are rejected at authoring time; the skill re-prompts. No defaulting on write.
- **Legacy artifacts (the 178 existing specs and 41 existing charters)** are treated as the layer default (`behavioral` for specs, `feature` for charters) at read time when `kind:` is absent. Disk content is not modified by Layer 1. Invalid values on legacy artifacts are reported by `/adev:hygiene` as non-blocking findings.
- The parser exposes three sentinel fields on every parsed result: `kind: string`, `kindValid: boolean`, `kindResolved: 'explicit' | 'default'`. `frontmatter-discriminator.spec.md` is the canonical owner of these field semantics.

### 4. Per-kind template matrix

Templates follow the naming convention `.{charter,spec}-template.<kind>.md` in two locations:

- `templates/<artifact>-template.<kind>.md` — bundled defaults shipped with the plugin (copied by `/adev:init`)
- `.context-index/specs/features/.<artifact>-template.<kind>.md` — user-editable dotfile copies in initialized projects

The existing two templates are renamed for symmetry:

- `templates/live-spec-template.md` → `templates/spec-template.behavioral.md`
- `templates/refactoring-spec-template.md` → `templates/spec-template.refactor.md`
- `templates/charter-template.md` → `templates/charter-template.feature.md`

A new `resolveTemplate(layer, kind, domain)` API in `lib/template-resolution.mjs` performs the lookup, with path-containment enforcement (`fs.realpathSync` containment check against allowed roots; rejects symlink/`..` escape with `UNSAFE_TEMPLATE_PATH`).

### 5. Error code namespacing

Several error codes are layered across modules. To avoid the overload pattern (where one code means different things in different contexts), codes are prefixed by their throw site when ambiguity matters:

- `INVALID_LAYER` — `lib/kinds.mjs` (layer not in `{'spec', 'charter'}`)
- `INVALID_KIND` — `lib/kinds.mjs`, `lib/template-resolution.mjs` (kind not in layer's enumeration)
- `TEMPLATE_NOT_FOUND` — `lib/template-resolution.mjs` (no template for `(layer, kind)`)
- `UNSAFE_TEMPLATE_PATH` — `lib/template-resolution.mjs` (path escapes allowed roots)
- `KIND_REQUIRED` — skill-write rejection (missing `kind:` on new artifact)
- `MISSING_KIND` — `/adev:hygiene` finding code (post-cutover legacy artifact)
- `MODULE_KIND_NO_MANIFEST` — `/adev:hygiene` finding (`kind: module` without manifest entry)
- `LEGACY_DEFAULTED` — `/adev:hygiene` info finding (pre-cutover legacy artifact)
- `PARSE_ERROR` — `/adev:hygiene` finding (frontmatter unparseable)

All codes use `SCREAMING_SNAKE_CASE`. Codes are namespaced by throw site when the same condition arises in multiple modules; the throw site is documented in the spec that owns the module.

### 6. Cutover timestamp source

The Layer 1 cutover date distinguishes `MISSING_KIND` (post-cutover, warn) from `LEGACY_DEFAULTED` (pre-cutover, info). Comparisons use **git's recorded creation timestamp** (`git log --follow --diff-filter=A --format=%aI`) rather than filesystem `mtime`. Rationale: `mtime` is trivially forgeable and resets on checkout in some workflows. Fallback to `mtime` when git is unavailable or the file is uncommitted, with a `WARNING` note attached to the finding.

### 7. Accepted deviations from the taxonomy

Two specific deviations are accepted within Layer 1 and documented per-spec:

- **`charter-templates.spec.md` (kind: artifact) includes a small rename operation.** Renaming the existing charter-template.md to charter-template.feature.md is intrinsically tied to introducing the three new artifact templates; splitting it into a separate `kind: refactor` spec for two files would be excessive decomposition. **Accepted exception class:** small renames that are prerequisites for artifact introduction may live inside the artifact spec, with the deviation documented in a quoted callout block.

- **Per-spec ownership of cross-cutting parser fields.** The parser output fields `kind`, `kindValid`, `kindResolved` are owned by `frontmatter-discriminator.spec.md` and consumed (not introduced) by `read-time-defaulting.spec.md`. Documented in both specs to prevent ownership drift.

## Consequences

- **Public-API surface change:** Templates are part of the plugin's public API. Renaming `live-spec-template.md` and adding seven new templates is a constitutional surface change captured by this ADR.
- **Backward compatibility preserved:** The 178 existing specs and 41 existing charters require zero changes at v1 ship; defaults are applied at read time only. No flag-day migration.
- **`/adev:specify` and `/adev:brainstorm` gain a kind prompt.** Authoring conversations now use the right vocabulary from the first prompt — preconditions/behaviors for `behavioral`, postconditions/procedure for `action`, etc. The kind axis is orthogonal to existing workflow flags (`--extract`, `--refactor`, `--from-diff`, `--cross-cutting`) which remain direct boolean flags.
- **`/adev:hygiene` gains a kind-validity audit pass.** Non-blocking in Layer 1; may upgrade to gate-blocking in Layer 2 (`issue-463`) after legacy backfill.
- **Layer 2 follow-up (`issue-463`):** backfill `kind:` on existing 178+41 artifacts; split fragmented charters (`test-strategies` 19→3, `agent-reliable-state-artifacts` 9→4, `heuristics` 11→3); move misplaced cross-cutting charters; consolidate duplicates (`assess`/`assessment`, `extensions`/`domain-extensions`); supersede stale `CONSISTENCY-REVIEW.md`.
- **Layer 3 follow-up (`issue-464`):** per-domain template overrides under `extensions/<domain>/domain/spec-template.<kind>.md` and `charter-template.<kind>.md`. The `(kind × domain)` matrix completes the design.
- **No new external dependencies.** All work is Node.js built-ins per constitution Principle 1.
- **Future kind additions** require an ADR amendment to this ADR-0009 (or a successor ADR) plus a new template file. The closed enumeration is intentional.

## References

- `.context-index/specs/features/lifecycle-artifacts/charter.md` — Feature Charter (Layer 1)
- `.context-index/research/spec-taxonomy-audit.md` — 178-spec audit
- `.context-index/research/charter-format-audit.md` — 41-charter audit
- `.context-index/research/cross-framework-artifact-kinds.md` — K8s, PEP, MADR, OpenAPI, C4, etc.
- `.context-index/research/sdd-frameworks-comparison.md` — Kiro, Spec-Kit, OpenSpec, Agent OS, BMAD, Devin, Tessl
- Epic `epic-73` (milestone `spec-and-charter-taxonomy`); Layer 1 tracker `issue-465`; Layer 2 `issue-463`; Layer 3 `issue-464`
