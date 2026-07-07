---
charter: lifecycle-artifacts
kind: artifact
status: implemented
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-14
updated: 2026-05-15

plan-ref: .context-index/specs/features/lifecycle-artifacts/spec-templates.plan.md

source-manifest:
  sha: "323269a"
  files:
    - .context-index/specs/features/.spec-template.action.md
    - .context-index/specs/features/.spec-template.artifact.md
    - .context-index/specs/features/.spec-template.integration.md
    - .context-index/specs/features/.spec-template.skill.md
    - templates/spec-template.action.md
    - templates/spec-template.artifact.md
    - templates/spec-template.integration.md
    - templates/spec-template.skill.md
    - tests/lib/template-resolution.test.mjs
  computed-at: "2026-07-03T22:27:11.348Z"
---

# Live Spec: Spec Templates

<!-- Defines the four new spec templates (action, skill, integration, artifact) as a
     content package. After Layer 1, six spec templates exist (the two renamed
     behavioral+refactor plus these four new ones), all following the same naming
     convention and frontmatter shape. -->

## Structural Shape

Each template is a Markdown file with YAML frontmatter following this baseline shape (kind-specific frontmatter additions noted per template):

```yaml
---
charter: {{ module_name }}
kind: <kind>                    # required, set to the template's kind
status: draft
risk_level: medium
milestone:
revision: 1
charter-revision: <inherited>
created: {{ date }}
updated: {{ date }}
---
```

The H2 section structure varies by kind. Each new template defines its own section set, summarized below:

### `templates/spec-template.action.md` (kind: action)

Devin-style postcondition-first framing.

H2 sections (in order):
- `## Postconditions` — state-of-world after the action runs; defines DONE
- `## Procedure` — ordered steps to reach postconditions
- `## Idempotency` — what happens if run twice
- `## Rollback` — how to undo
- `## System Constitution Reference`
- `## Acceptance Criteria`

### `templates/spec-template.skill.md` (kind: skill)

For specs that define `/adev:*` CLI surface changes.

H2 sections (in order):
- `## Invocation Modes` — how the skill is called (flags, args)
- `## Arguments` — argument table with required/optional, types, defaults
- `## Output Contract` — what the skill produces (files, frontmatter, log entries)
- `## Failure Modes` — what goes wrong and how the skill handles it
- `## System Constitution Reference`
- `## Acceptance Criteria`

### `templates/spec-template.integration.md` (kind: integration)

For specs that define wiring between two or more existing modules.

H2 sections (in order):
- `## Participants` — modules/skills involved, with their roles
- `## Interaction Contract` — who calls what, in what order
- `## State Machine` — observable states and transitions
- `## Error Propagation` — how failures cascade across participants
- `## System Constitution Reference`
- `## Acceptance Criteria`

### `templates/spec-template.artifact.md` (kind: artifact)

For specs that define a static deliverable (template, fixture, schema, content package).

H2 sections (in order):
- `## Structural Shape` — file or section layout the artifact must have
- `## Required Files` — concrete file paths that must exist
- `## Consumers` — what reads the artifact and how
- `## System Constitution Reference`
- `## Acceptance Criteria`

(Note: artifact specs intentionally omit Preconditions/Behaviors/Postconditions — static deliverables don't *do* anything, they *are* something.)

## Required Files

Both bundled (plugin) and user-editable (project) copies are required:

| Path | Layer | Created by |
|---|---|---|
| `templates/spec-template.action.md` | Bundled | This spec |
| `templates/spec-template.skill.md` | Bundled | This spec |
| `templates/spec-template.integration.md` | Bundled | This spec |
| `templates/spec-template.artifact.md` | Bundled | This spec |
| `.context-index/specs/features/.spec-template.action.md` | User-editable dotfile | `/adev:init` copies from bundled |
| `.context-index/specs/features/.spec-template.skill.md` | User-editable dotfile | `/adev:init` copies from bundled |
| `.context-index/specs/features/.spec-template.integration.md` | User-editable dotfile | `/adev:init` copies from bundled |
| `.context-index/specs/features/.spec-template.artifact.md` | User-editable dotfile | `/adev:init` copies from bundled |

Each template file contains:
- The frontmatter baseline above (with `kind:` set)
- The H2 section structure for its kind
- HTML comments inside each section guiding the author
- No placeholder content that would parse as a valid spec by accident (e.g., no real "When... then..." examples in behavioral fields)

## Consumers

- **`/adev:specify`** — selects the matching template via `resolveTemplate('spec', kind, domain)` and copies its body into the new spec file, replacing `{{ }}` placeholders.
- **`/adev:init`** — copies the bundled templates into a new project's `.context-index/specs/features/` as the user-editable dotfile set.
- **`/adev:hygiene`** — uses the H2 section names as the expected structure when validating specs of each kind.
- **Future (Layer 3) domain extensions** — may override individual templates via `extensions/<domain>/domain/spec-template.<kind>.md`.

## System Constitution Reference

- **Architecture Boundaries: Autonomous — "Updating templates"** — Applies; adding templates is autonomous.
- **Principle 2: "Skills are primarily markdown — Companion code (helpers, validators) is allowed but must not be required for the skill to function"** — Applies; templates are markdown, skills function without them but with degraded UX.

## Acceptance Criteria

- [ ] All four bundled templates exist under `templates/` with the documented H2 section structure
- [ ] All four user-editable dotfile copies exist under `.context-index/specs/features/`
- [ ] Each template's frontmatter contains `kind:` set to the template's kind value
- [ ] `/adev:init` correctly copies the bundled templates into a fresh project
- [ ] `resolveTemplate('spec', kind, null)` resolves to the bundled template for each new kind
- [ ] No constitutional violations introduced
