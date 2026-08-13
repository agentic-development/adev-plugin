---
charter: {{ module_name }}
kind: artifact
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
milestone:        <!-- optional — milestone from charter capability map, or explicit override -->
revision: 1
charter-revision: {{ charter_revision }}
created: {{ date }}
updated: {{ date }}
---

# Artifact Spec: {{ spec_title }}

<!-- Artifact Spec within the {{ module_name }} charter.
     An artifact spec describes a static deliverable — a template package, a fixture
     set, a schema, a content bundle, a configuration matrix. Artifact specs
     intentionally OMIT Preconditions / Behaviors / Postconditions: static
     deliverables don't *do* anything, they *are* something. The contract is the
     structural shape, the files that must exist, and the consumers that read them.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md
     Exemplar: .context-index/specs/features/lifecycle-artifacts/spec-templates.spec.md -->

<!-- # tracker-ref: -->

## Structural Shape

<!-- The shape the artifact must take: file layout, section structure, schema, naming
     convention, frontmatter requirements. If the artifact is a content bundle of
     several files (e.g., a template family), describe the per-file shape here.
     Be specific enough that a reviewer can verify the artifact without ambiguity. -->

...

## Required Files

<!-- The concrete file paths that must exist after this artifact lands. Include both
     bundled (plugin) and user-editable (project) copies if the artifact ships in both
     locations. Use a table when there are multiple files. -->

| Path | Layer | Created by |
|---|---|---|
| `{{ file_path }}` | {{ bundled_or_user }} | ... |
| `{{ file_path }}` | {{ bundled_or_user }} | ... |

## Consumers

<!-- What reads this artifact and how. Each row: consumer (skill, library, tool) and
     the specific way it consumes the artifact (e.g., "loads via resolveTemplate()",
     "globs the directory", "imports as a module"). The consumer list is the
     justification for the structural shape above. -->

- **`{{ consumer }}`** — ...
- **`{{ consumer }}`** — ...

## System Constitution Reference

<!-- Which constitutional principles or architecture boundaries govern this artifact.
     Cite by number or section heading; explain why each applies. -->

- **{{ principle_or_boundary }}** — Applies because ...
- ...

## Acceptance Criteria

<!-- Concrete, verifiable criteria for this artifact to be considered complete.
     Each row in Required Files should map to at least one acceptance criterion.
     /adev:validate checks these after implementation. -->

- [ ] All required files exist at the documented paths
- [ ] Each file matches the structural shape
- [ ] Consumers can read the artifact via their documented mechanism
- [ ] No constitutional violations introduced
