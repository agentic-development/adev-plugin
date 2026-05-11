# Live Spec: Milestone Name Validation in Lifecycle Skills

---
charter: milestone-lifecycle
status: review-pending
risk_level: low
milestone:
revision: 1
charter-revision: 2
created: 2026-05-08
updated: 2026-05-08
tracker-ref: issue-355
---

## Behavioral Contract

### Preconditions

- `milestones.yaml` may or may not exist
- The skill being invoked (brainstorm, specify, plan, hygiene) is running in its normal flow
- Validation is advisory only — it never blocks the skill's primary operation

### Behaviors

#### Shared Validation Helper

1. **When** `validateMilestoneName(projectRoot, name)` is called and `milestones.yaml` exists **then** it checks whether `name` matches an entry in the file. Returns `{ valid: true }` if found, `{ valid: false, suggestion: <closest match> }` if not found (using case-insensitive comparison and Levenshtein distance for typo detection).

2. **When** `validateMilestoneName()` is called and `milestones.yaml` does not exist **then** it returns `{ valid: true, noFile: true }` — validation is skipped silently (no milestones defined yet, nothing to validate against).

#### `/adev:brainstorm` Integration

3. **When** writing a charter Capability Map and the Milestone column contains a value **then** `validateMilestoneName()` is called. If invalid, a warning is printed: "Advisory: milestone '<name>' is not defined in milestones.yaml. Did you mean '<suggestion>'?" The charter is still written.

#### `/adev:specify` Integration

4. **When** setting the `milestone:` frontmatter field on a spec **then** `validateMilestoneName()` is called. If invalid, a warning is printed. The spec is still written with the user's value.

#### `/adev:plan --milestone` Integration

5. **When** `--milestone <name>` is provided to `/adev:plan` **then** `validateMilestoneName()` is called. If invalid, a warning is printed with the suggestion. Planning proceeds — the warning is advisory.

#### `/adev:hygiene` Integration

6. **When** `/adev:hygiene` runs its audit passes **then** it scans all charter Capability Map Milestone values and spec `milestone:` frontmatter values. Each value is checked against `milestones.yaml`. Orphan references (values not matching any milestone) are collected and reported in the hygiene report under a "Milestone Orphans" section.

7. **When** `/adev:hygiene` finds orphan milestone references and `milestones.yaml` does not exist **then** it reports: "No milestones.yaml found. <N> milestone references in charters/specs are unvalidated. Run `milestone create` to define milestones."

### Postconditions

- No state is mutated by validation — it is purely advisory output.
- The primary operation of each integrated skill always completes regardless of validation result.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `validateMilestoneName()` called with null or empty name | Return `{ valid: true }` — skip validation for empty values | — |
| `milestones.yaml` is malformed | Log warning "milestones.yaml could not be parsed — skipping validation" and return `{ valid: true }` | PARSE_ERROR |
| Levenshtein suggestion has distance > 3 | Do not suggest — just report "not found in milestones.yaml" without a suggestion | — |

## System Constitution Reference

- **Principle:** "Skills are primarily markdown" — validation integration is documented in SKILL.md files as advisory instructions. The `validateMilestoneName()` helper is companion code.
- **Principle:** "Minimize external dependencies" — Levenshtein distance is implemented inline (simple algorithm, ~15 lines), no external library needed.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Validation helper | Implement `validateMilestoneName(projectRoot, name)` in `lib/milestones.mjs`. Include case-insensitive matching and Levenshtein-based typo suggestion. | small |
| 2. Brainstorm SKILL.md integration | Add advisory validation instruction to `/adev:brainstorm` Step 4d (Capability Map) for Milestone column values. | small |
| 3. Specify SKILL.md integration | Add advisory validation instruction to `/adev:specify` Step 4 (milestone frontmatter). | small |
| 4. Plan SKILL.md integration | Add advisory validation instruction to `/adev:plan` milestone mode entry. | small |
| 5. Hygiene audit pass | Add "Milestone Orphans" pass to `/adev:hygiene`. Scan charter Milestone columns and spec frontmatter. Report orphans. | medium |
| 6. Tests | Unit tests for `validateMilestoneName` (match, no match, suggestion, no file, malformed, empty). Integration test for hygiene orphan detection. | medium |

## Acceptance Criteria

- [ ] `validateMilestoneName()` returns valid for exact match (case-insensitive)
- [ ] `validateMilestoneName()` returns invalid with suggestion for close typos (distance <= 3)
- [ ] `validateMilestoneName()` returns invalid without suggestion for distant mismatches
- [ ] `validateMilestoneName()` skips silently when `milestones.yaml` does not exist
- [ ] `validateMilestoneName()` skips silently when name is null or empty
- [ ] `/adev:brainstorm` prints advisory warning on invalid Milestone column values
- [ ] `/adev:specify` prints advisory warning on invalid milestone frontmatter
- [ ] `/adev:plan --milestone` prints advisory warning on invalid milestone name
- [ ] `/adev:hygiene` reports orphan milestone references in a dedicated section
- [ ] `/adev:hygiene` handles missing `milestones.yaml` gracefully
- [ ] No skill is blocked by milestone validation — all operations complete regardless
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
