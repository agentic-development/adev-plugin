# Live Spec: adev:vision Skill

<!-- Live Spec within the strategic-planning charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/strategic-planning/charter.md -->

---
charter: strategic-planning
status: superseded
risk_level: medium
milestone:
revision: 1
charter-revision: 1
created: 2026-04-05
updated: 2026-05-04
source-manifest:
  sha: "dba4c9f"
  files:
    - skills/assess/SKILL.md
    - skills/vision/SKILL.md
    - tests/skills/assess.test.mjs
  computed-at: "2026-04-12T11:48:02.756Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/` exists with `constitution.md` and `manifest.yaml`
- `specs/product.md` may or may not exist (bootstrapped from constitution Identity if absent)
- If `--refresh`, an existing `product.md` with a `## Milestones` section must exist

### Behaviors

1. **When** invoked without arguments **then** the skill enters interview mode: reads constitution, product.md, and all existing charters, then asks the user one question at a time about business objectives, target audience, success metrics, feature priorities, and timeline
2. **When** interview is complete **then** the skill proposes a structured Milestones section with milestone names, target dates, feature inventory per milestone, and priority ordering
3. **When** the user approves the milestones **then** `product.md` is updated with the `## Milestones` section (delimited by the `## Milestones` heading, extending to the next `##` heading or EOF). If the section exists, it is replaced in-place; if not, it is appended. All other sections are preserved unchanged
4. **When** milestones are written **then** the skill creates one epic per milestone on the issue board, each with the `milestone` field set to the milestone name
5. **When** epics already exist for a milestone name **then** existing epics are updated (not duplicated) — match by milestone name
6. **When** `--refresh` is specified **then** the skill skips the interview and instead reviews the current milestones against the latest charters, proposing additions, removals, or reorderings
7. **When** `--milestone <name>` is specified **then** the skill focuses on defining or refining a single milestone rather than the full vision
8. **When** the vision implies new architectural constraints not in the constitution **then** the skill proposes amendments as a clearly marked section in the output and warns: "These amendments require human approval per Architecture Boundaries"
9. **When** the vision references charters that don't exist yet **then** the skill lists them as "Charters to Create" and suggests invoking `/adev:brainstorm` for each

### Postconditions

- `product.md` contains a Milestones section with at least one milestone
- Each milestone has: name, target date (optional), status (planned/active/completed), and feature list
- One epic per milestone exists on the issue board (if tasks.backend configured)
- Any proposed constitution amendments are clearly labeled and not applied directly

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.context-index/` missing | Print "Run `/adev:init` first" and stop | N/A |
| `product.md` missing | Create a minimal product.md from constitution Identity section, then proceed | N/A |
| `--refresh` but no Milestones section | Print warning, fall back to full interview mode | N/A |
| `--milestone <name>` but milestone doesn't exist | Create it as a new milestone | N/A |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — The skill is a SKILL.md; output is markdown in product.md
- **Architecture Boundary:** "Adding new skills to the lifecycle order" — Vision sits before brainstorm but does not change the existing lifecycle gates; this is a new upstream phase

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| Create SKILL.md | Write the skill with interview pattern, context loading, milestone writing, epic creation | large |
| Define product.md Milestones format | Specify the markdown structure for the Milestones section | small |

## Issue Board Integration

- **End**: Creates one epic per milestone via `createEpic({ title, milestone })`. If epics with matching milestone already exist, updates them via `updateEpic()`. Reports: "Created/updated N epics on issue board."
- Guard pattern: check `tasks.backend` in manifest; skip if unconfigured

## Acceptance Criteria

- [ ] Interview pattern asks one question at a time
- [ ] Reads constitution, product.md, and all existing charters before proposing
- [ ] Writes Milestones section to product.md with correct structure
- [ ] Creates epics with milestone field on issue board
- [ ] Does not duplicate epics on re-run (idempotent)
- [ ] `--refresh` mode updates existing milestones without full interview
- [ ] `--milestone <name>` focuses on single milestone
- [ ] Constitution amendments are proposed, not applied directly
- [ ] Missing charters are identified and suggested for brainstorm
- [ ] All quality gates pass (tests, lint, typecheck)
- [ ] No constitutional violations introduced
