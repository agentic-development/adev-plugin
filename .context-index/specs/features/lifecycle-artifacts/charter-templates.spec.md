---
charter: lifecycle-artifacts
kind: artifact
status: validated
risk_level: low
milestone:
revision: 2
charter-revision: 2
created: 2026-05-14

plan-ref: .context-index/specs/features/lifecycle-artifacts/charter-templates.plan.md

source-manifest:
  sha: "ee5f4fe"
  files:
    - .context-index/specs/features/.charter-template.cross-cutting.md
    - .context-index/specs/features/.charter-template.feature.md
    - .context-index/specs/features/.charter-template.initiative.md
    - .context-index/specs/features/.charter-template.module.md
    - templates/charter-template.cross-cutting.md
    - templates/charter-template.feature.md
    - templates/charter-template.initiative.md
    - templates/charter-template.module.md
    - tests/lib/template-resolution.test.mjs
  computed-at: "2026-05-15T14:34:13.860Z"
---

# Live Spec: Charter Templates

<!-- Defines the three new charter templates (module, cross-cutting, initiative) as a
     content package. After Layer 1, four charter templates exist (the renamed feature
     template plus these three new ones). -->

## Structural Shape

Each template is a Markdown file with YAML frontmatter following this baseline shape (kind-specific additions noted per template):

```yaml
---
status: draft
kind: <kind>                    # required
revision: 1
updated: {{ date }}
---
```

The H2 section structure varies by kind. The existing `.charter-template.md` becomes the `feature` template (renamed to `templates/charter-template.feature.md` and `.charter-template.feature.md` for the dotfile copy). Three new templates are introduced for the other kinds.

### `templates/charter-template.module.md` (kind: module)

For lifecycle-slot modules that correspond 1:1 with a `manifest.yaml:modules[]` entry. Empirically these charters function as **skill registries**, not full domain specs (the charter audit found 9 such charters using a minimal Purpose+Skills shape).

H2 sections (in order):
- `## Purpose` — what this module does in the lifecycle (1–2 sentences)
- `## Skills` — table of skills owned by this module (skill name, role)
- `## Key Behaviors` — bullet list of observable module-level behaviors
- `## Key Files` — table of paths owned by this module (file, role)
- `## Constitution Reference`
- `## Capability Map` — capabilities provided by this module

(Module charters intentionally omit Domain Model and Interface Contracts; lifecycle slots don't have rich domain models in adev's architecture.)

### `templates/charter-template.feature.md` (kind: feature; renamed from `.charter-template.md`)

The existing full six-section template, renamed for symmetry. H2 structure unchanged:
- `## Business Intent`
- `## Scope and Boundaries`
- `## Domain Model`
- `## Capability Map`
- `## Interface Contracts`
- `## Quality Attributes`

### `templates/charter-template.cross-cutting.md` (kind: cross-cutting)

For concerns affecting multiple modules; lives under `specs/cross-cutting/`, not `features/`.

H2 sections (in order):
- `## Business Intent`
- `## Scope`
- `## Affected Modules` — table: module slug, impact (high/medium/low), changes required
- `## Interface Contracts` — how this concern interacts with affected modules
- `## Quality Attributes`

(Omits Domain Model — entities live in the affected modules, not in the cross-cutting concern.)

### `templates/charter-template.initiative.md` (kind: initiative)

For time-bounded efforts (migrations, theme-based releases). Refactor-shaped at the charter level. Examples: `agent-reliable-state-artifacts` (markdown → JSON migration).

H2 sections (in order):
- `## Business Intent`
- `## Scope`
- `## Current State` — what exists today that the initiative is changing
- `## Target State` — what the initiative produces
- `## Migration Plan` — ordered phases or layers
- `## Acceptance Criteria` — concrete criteria for declaring the initiative complete and ready to archive

## Required Files

| Path | Layer | Created by |
|---|---|---|
| `templates/charter-template.module.md` | Bundled | This spec |
| `templates/charter-template.feature.md` | Bundled | Rename of `templates/charter-template.md` (see `template-renames.spec.md` follow-up) — but the feature-template rename is part of THIS spec since it's a charter template, not a spec template |
| `templates/charter-template.cross-cutting.md` | Bundled | This spec |
| `templates/charter-template.initiative.md` | Bundled | This spec |
| `.context-index/specs/features/.charter-template.module.md` | User-editable dotfile | `/adev:init` copies from bundled |
| `.context-index/specs/features/.charter-template.feature.md` | User-editable dotfile | Rename of `.charter-template.md` |
| `.context-index/specs/features/.charter-template.cross-cutting.md` | User-editable dotfile | `/adev:init` copies from bundled |
| `.context-index/specs/features/.charter-template.initiative.md` | User-editable dotfile | `/adev:init` copies from bundled |

**Charter template rename note:** The existing `templates/charter-template.md` and `.context-index/specs/features/.charter-template.md` must be renamed to `charter-template.feature.md` / `.charter-template.feature.md` as part of THIS spec's implementation (parallel to the spec template renames in `template-renames.spec.md`). The two-name asymmetry between charter-feature and the new charter kinds would otherwise replicate the very inconsistency `template-renames.spec.md` resolves at the spec layer.

> **Deviation from pure `kind: artifact` shape:** Including a rename operation inside an artifact-kind spec is technically a deviation — refactor operations belong in `kind: refactor` specs per the taxonomy this charter establishes. We accept the deviation here because: (a) the rename is small (2 files), (b) it is intrinsically tied to introducing the artifact (you cannot add charter-template.feature.md cleanly without renaming the existing charter-template.md), and (c) splitting it into a separate `kind: refactor` spec for two files would be excessive decomposition. ADR-0009 documents this as an accepted exception class: small renames that are prerequisites for artifact introduction may live inside the artifact spec.

> **Frontmatter baseline asymmetry note:** Charter frontmatter (status / kind / revision / updated) intentionally omits `charter-revision`, `risk_level`, and `milestone` — those fields are spec-only. Template authors copying this baseline should not add them by mistake; the asymmetry reflects that charters don't have a parent charter to reference.

## Consumers

- **`/adev:brainstorm`** — selects the matching charter template via `resolveTemplate('charter', kind, domain)` and copies its body into the new charter file.
- **`/adev:init`** — copies the bundled charter templates into a new project's `.context-index/specs/features/` as the user-editable dotfile set.
- **`/adev:hygiene`** — uses the H2 section names as the expected structure when validating charters of each kind; flags `kind: module` charters that omit a manifest.yaml entry.
- **Future (Layer 3) domain extensions** — may override individual charter templates per domain.

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Updating templates"** — Applies.
- **Principle 2: "Skills are primarily markdown"** — Applies; charter templates are markdown.

## Acceptance Criteria

- [ ] Three new bundled charter templates exist under `templates/`
- [ ] Existing `templates/charter-template.md` renamed to `templates/charter-template.feature.md` (git mv, history preserved)
- [ ] Existing `.context-index/specs/features/.charter-template.md` renamed to `.charter-template.feature.md`
- [ ] All four user-editable dotfile copies exist under `.context-index/specs/features/`
- [ ] Each charter template's frontmatter contains `kind:` set to the template's kind value
- [ ] `/adev:init` correctly copies the bundled charter templates into a fresh project
- [ ] `resolveTemplate('charter', kind, null)` resolves to the bundled template for each kind
- [ ] No constitutional violations introduced
