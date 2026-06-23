# Live Spec: Workflow Guides

---
charter: user-docs
status: validated
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
source-manifest:
  files:
    - docs/design-phase.md
    - docs/build-phase.md
    - docs/validate-debug.md
    - docs/maintain.md
  computed-at: "2026-05-10T23:51:35.315Z"
---

## Behavioral Contract

### Preconditions

- Foundation & Onboarding spec is complete (docs/README.md exists as navigation root)
- SKILL.md files exist for all skills referenced in the guides
- Constitution and manifest are available as content sources

### Behaviors

1. **When** a user reads `docs/design-phase.md` **then** they understand how to use `/adev:brainstorm` to create charters, `/adev:specify` to write specs, `/adev:review-specs` to run architecture reviews, and optionally `/adev:prototype` to sketch UI — including when to use each and how they connect.

2. **When** a user reads `docs/build-phase.md` **then** they understand how to use `/adev:plan` to decompose specs into tasks, `/adev:route` to decide agent vs human execution, `/adev:implement` to execute with TDD, `/adev:write-test` for standalone test authoring, and `/adev:build` for end-to-end orchestration.

3. **When** a user reads `docs/validate-debug.md` **then** they understand how to use `/adev:validate` for post-implementation checks, `/adev:debug` for context-aware debugging, `/adev:eval` for quality scoring, and `/adev:recover` for unsticking agents.

4. **When** a user reads `docs/maintain.md` **then** they understand how to use `/adev:issues` for tracking work, `/adev:status` for dashboards, `/adev:hygiene` for context health audits, `/adev:retro` for retrospectives, `/adev:codehealth` for dead code detection, `/adev:repomap` for symbol indexing, `/adev:reconcile` for lifecycle repairs, and `/adev:sample` for curating reference code.

5. **When** a workflow guide describes a skill **then** it includes: what the skill does, when to use it, what prerequisites are needed, an example invocation, and what output to expect — without duplicating the full reference entry.

6. **When** a workflow guide mentions a skill **then** it links to the corresponding entry in the Skill Reference for full details.

7. **When** a user reads the four guides in order (design → build → validate → maintain) **then** they understand the complete development lifecycle and how each phase feeds into the next.

8. **When** a guide describes a phase transition (e.g., design to build) **then** it explains what gates or prerequisites must be satisfied before moving forward.

### Postconditions

- `docs/design-phase.md` exists covering brainstorm, specify, review-specs, prototype
- `docs/build-phase.md` exists covering plan, route, implement, write-test, build
- `docs/validate-debug.md` exists covering validate, debug, eval, recover
- `docs/maintain.md` exists covering issues, status, hygiene, retro, codehealth, repomap, reconcile, sample
- All four guides are linked from the Table of Contents under "Workflow Guides"
- Each guide links to relevant Skill Reference entries

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| A skill referenced in a guide has been renamed or removed | Guide references match current skill names; no stale skill references | STALE_SKILL_REF |
| A guide describes behavior that doesn't match the current SKILL.md | All descriptions are sourced from current SKILL.md files, not assumptions | INACCURATE_DESCRIPTION |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — Guides describe skills as user-facing instructions, consistent with their markdown nature.
- **Principle:** "Hook protocol compliance" — Guides reference hook behaviors (lifecycle gates, context preflight) where relevant to phase transitions.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Write docs/design-phase.md | Cover brainstorm, specify, review-specs, prototype with examples and transitions | large |
| Write docs/build-phase.md | Cover plan, route, implement, write-test, build with examples and transitions | large |
| Write docs/validate-debug.md | Cover validate, debug, eval, recover with examples | medium |
| Write docs/maintain.md | Cover issues, status, hygiene, retro, codehealth, repomap, reconcile, sample | large |
| Add phase transition sections | Document gates between phases (review-before-plan, etc.) | small |
| Cross-link to skill reference | Add links from each skill mention to its reference entry | small |
| Link from TOC | Add all four guides to docs/README.md under Workflow Guides | small |

## Acceptance Criteria

- [ ] `docs/design-phase.md` covers design skills (brainstorm, specify, review-specs, prototype) with examples
- [ ] `docs/build-phase.md` covers build skills (plan, route, implement, write-test, build) with examples
- [ ] `docs/validate-debug.md` covers validation skills (validate, debug, eval, recover) with examples
- [ ] `docs/maintain.md` covers maintenance skills (issues, status, hygiene, retro, codehealth, repomap, reconcile, sample) with examples
- [ ] Each skill mention includes what it does, when to use it, and a link to reference
- [ ] Phase transitions and gates are documented
- [ ] All four guides are reachable from docs/README.md
- [ ] Skill descriptions match current SKILL.md content
- [ ] No constitutional violations introduced
