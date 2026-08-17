---
charter: milestone-lifecycle
status: review-passed
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

# Live Spec: Name Validation in Lifecycle Skills

## Behavioral Contract

### Preconditions

- `.context-index/milestones.yaml` may or may not exist
- `lib/milestones.mjs` provides `loadMilestones()` and `findMilestone()`
- Lifecycle skills (`/adev:specify`, `/adev:plan`) reference milestone names in frontmatter or arguments

### Behaviors

1. **When** `/adev:specify` inherits or overrides a `milestone:` frontmatter value **and** `milestones.yaml` exists **and** the milestone name is not found in `milestones.yaml` **then** an advisory warning is printed: "Warning: milestone '<name>' is not defined in milestones.yaml. Run `milestone create <name>` to define it." The operation is **never blocked**.

2. **When** `/adev:specify` inherits or overrides a `milestone:` value **and** `milestones.yaml` does not exist **then** no warning is printed (milestones are optional).

3. **When** `/adev:plan --milestone <name>` is invoked **and** `milestones.yaml` exists **and** the name is not found **then** an advisory warning is printed: "Warning: milestone '<name>' is not defined in milestones.yaml." The operation continues (never blocked).

4. **When** `warnIfMilestoneUndefined(projectRoot, name)` is called with a name that exists in `milestones.yaml` **then** it returns `null` (no warning).

5. **When** `warnIfMilestoneUndefined(projectRoot, name)` is called with a name not found in `milestones.yaml` **then** it returns the warning string.

6. **When** `warnIfMilestoneUndefined(projectRoot, name)` is called and `milestones.yaml` does not exist **then** it returns `null` (no warning — milestones are optional).

### Postconditions

- No state is mutated by validation — it is purely advisory.
- The calling skill's operation always proceeds regardless of validation result.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestones.yaml` is malformed | Suppress parse error, return `null` (fail-open — validation must never block) | — |

## System Constitution Reference

- **Principle:** "Milestone name validation in all integrated skills is advisory — a warning is printed but the operation is never blocked" (charter Quality Attributes: Backward Compatibility)
- **Principle:** "Skills are primarily markdown" — validation instructions added to SKILL.md files; `warnIfMilestoneUndefined` is a small companion helper

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. `warnIfMilestoneUndefined` helper | Add to `lib/milestones.mjs`. Loads milestones, checks name, returns warning string or null. | small |
| 2. SKILL.md advisory instructions | Add validation instructions to `skills/specify/SKILL.md` and `skills/plan/SKILL.md` (or `milestone-mode.md`) referencing the helper. | small |
| 3. Tests | Unit tests for `warnIfMilestoneUndefined` covering found, not-found, no-file, malformed-file cases. | small |

## Acceptance Criteria

- [ ] `warnIfMilestoneUndefined` returns null when milestone exists
- [ ] `warnIfMilestoneUndefined` returns warning string when milestone not found
- [ ] `warnIfMilestoneUndefined` returns null when milestones.yaml doesn't exist
- [ ] `warnIfMilestoneUndefined` returns null when milestones.yaml is malformed (fail-open)
- [ ] `/adev:specify` SKILL.md includes advisory validation instruction
- [ ] Validation never blocks the calling operation
- [ ] All quality gates pass
