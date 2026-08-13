---
charter: {{ module_name }}
kind: skill
status: draft  <!-- draft | review-pending | review-passed | review-blocked | implemented | validated -->
risk_level: medium  <!-- high | medium | low. Used by governance risk policies. -->
milestone:        <!-- optional — milestone from charter capability map, or explicit override -->
revision: 1
charter-revision: {{ charter_revision }}
created: {{ date }}
updated: {{ date }}
---

# Skill Spec: {{ spec_title }}

<!-- Skill Spec within the {{ module_name }} charter.
     A skill spec defines a change to a /adev:* CLI surface — invocation modes,
     arguments, the output contract (files produced, frontmatter written, lifecycle
     events emitted), and failure modes.
     Parent Charter: .context-index/specs/features/{{ module_name }}/charter.md
     Exemplar: .context-index/specs/features/lifecycle-artifacts/specify-kind-routing.spec.md -->

<!-- # tracker-ref: -->

## Invocation Modes

<!-- How the skill is called: flags, sub-commands, ask-first prompts.
     If the skill adds a new axis to existing flags, describe how the axes combine.
     Include an example matrix when the surface gains orthogonal axes. -->

...

## Arguments

<!-- Argument table: name, required/optional, type, default, and a one-line description.
     Document strict-on-write vs. ask-first prompting behavior per argument.
     If the skill exposes a new ask-first menu, include the prompt verbatim. -->

| Argument | Required | Description |
|---|---|---|
| `{{ arg_name }}` | {{ yes_or_no }} | ... |
| `{{ arg_name }}` | {{ yes_or_no }} | ... |

## Output Contract

<!-- What the skill produces:
     - Files written or modified (and their paths)
     - Frontmatter fields set on the resulting artifact
     - Charter/issue-board side effects (status flips, work items created, capability rows updated)
     - Lifecycle events emitted (which step, which status)
     The output contract is the public-facing observable behavior of the skill. -->

...

## Failure Modes

<!-- Each row: triggering condition, the skill's behavior, and how the user recovers.
     Include both new failure paths introduced by this spec and unchanged existing ones
     that are still relevant. -->

| Condition | Skill Behavior | User Recovery |
|---|---|---|
| ... | ... | ... |
| ... | ... | ... |

## System Constitution Reference

<!-- Which constitutional principles or architecture boundaries govern this skill change.
     Cite by number or section heading; explain why each applies. -->

- **{{ principle_or_boundary }}** — Applies because ...
- ...

## Acceptance Criteria

<!-- Concrete, verifiable criteria for this skill change to be considered complete.
     /adev:validate checks these after implementation. -->

- [ ] SKILL.md documents the new invocation modes and arguments
- [ ] Output contract holds on every invocation path
- [ ] Failure modes are handled per the table above
- [ ] Tests cover new invocation paths and failure modes
- [ ] No constitutional violations introduced
