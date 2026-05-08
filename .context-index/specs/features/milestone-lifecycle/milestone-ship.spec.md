# Live Spec: Milestone Ship, Criteria Evaluation, and Defer

---
charter: milestone-lifecycle
status: review-pending
risk_level: high
milestone: v1.0.0
revision: 1
charter-revision: 2
created: 2026-05-08
updated: 2026-05-08
tracker-ref: issue-355
---

## Behavioral Contract

### Preconditions

- `milestones.yaml` exists with at least one milestone entry
- The target milestone has a valid `epic_id` referencing an existing epic on the issue board
- `manifest.yaml` exists (for `gates.test` in `gates_pass` check)

### Behaviors

#### Ship Criteria Evaluation

1. **When** `evaluateShipCriteria()` is called with a milestone that has `check: all_issues_closed` **then** it queries the issue manager for all issues under the milestone's epic and returns `pass` if all are closed, `fail` with open issue count otherwise.

2. **When** `evaluateShipCriteria()` is called with a milestone that has `check: gates_pass` **then** it runs the command from `manifest.gates.test` (e.g., `npm test`) and returns `pass` if exit code is 0, `fail` with the error output otherwise.

3. **When** `evaluateShipCriteria()` is called with a milestone that has no `ship_criteria` **then** it returns an empty results array (all pass — no criteria to evaluate).

4. **When** `evaluateShipCriteria()` encounters an unknown `check` type **then** it returns `fail` for that criterion with message "Unknown check type: <type>".

#### Milestone Ship

5. **When** `milestone ship <name>` is invoked **then** auto-checks are evaluated first. If any fail, results are displayed and the command stops without prompting for manual confirms.

6. **When** all auto-checks pass and the milestone has `confirm:` criteria **then** each confirm prompt is presented one by one. If any is rejected, the command stops.

7. **When** all criteria pass and the milestone name matches a semver pattern **then** the user is prompted: "Version in package.json is <current>. Bump to <milestone-name>? (y/n)". If yes, `package.json` and `.claude-plugin/plugin.json` are both updated.

8. **When** all criteria pass and `release.tag` is set (or defaults to the milestone name) **then** a git tag is created. If `gh` CLI is available, a GitHub release is drafted with `--generate-notes`. If `gh` is unavailable, the tag is still created and a warning is printed.

9. **When** `milestone ship` completes successfully **then** the milestone status is updated to `shipped` in `milestones.yaml`, and the linked epic is closed via the issue manager.

10. **When** `milestone ship <name>` is invoked on an already-shipped milestone **then** it prints "Milestone '<name>' is already shipped" and exits (no-op, idempotent).

#### Milestone Defer

11. **When** `milestone defer <name> --reason "<text>"` is invoked **then** the milestone status is updated to `deferred` in `milestones.yaml` and the reason is stored in a `deferred_reason` field.

12. **When** `milestone defer` is invoked on an already-shipped milestone **then** it rejects with "Cannot defer a shipped milestone."

13. **When** `milestone defer` is invoked without `--reason` **then** the user is prompted interactively for a reason.

### Postconditions

- After successful `milestone ship`: milestone status is `shipped`, epic is closed, git tag exists, GitHub release exists (if `gh` available), version files updated (if user confirmed bump).
- After `milestone defer`: milestone status is `deferred`, `deferred_reason` is set. Epic status is unchanged (remains open for potential reactivation).

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestone ship` with no name argument | Print usage hint and exit | MISSING_NAME |
| `milestone ship <name>` where name not found in milestones.yaml | "Milestone '<name>' not found" | NOT_FOUND |
| `milestone ship` when `epic_id` references a non-existent epic | "Epic <id> not found. Recreate the epic or update the milestone before shipping." | BROKEN_EPIC |
| `milestone ship` when git tag already exists | "Tag '<tag>' already exists. Delete it or change the release.tag." | TAG_EXISTS |
| `milestone ship` when `gates_pass` check fails | Display test output and stop. Do not proceed to manual confirms. | GATES_FAILED |
| `milestone ship` when working directory has uncommitted changes | "Uncommitted changes detected. Commit or stash before shipping." | DIRTY_WORKTREE |
| `milestone defer` on a shipped milestone | "Cannot defer a shipped milestone." | ALREADY_SHIPPED |
| `milestone defer` with no name argument | Print usage hint and exit | MISSING_NAME |

## System Constitution Reference

- **Principle:** "Version parity — package.json and .claude-plugin/plugin.json versions must always match" — the version bump step updates both files atomically. If one write fails, neither is committed.
- **Principle:** "Minimize external dependencies" — `gh` CLI is invoked as an optional subprocess, not a code dependency. Git operations use `child_process.execSync`.
- **Principle:** "Hook protocol compliance" — ship does not modify the hook protocol. The version bump follows the same pattern as existing version parity enforcement.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Ship criteria evaluator | Implement `evaluateShipCriteria()` with `all_issues_closed` and `gates_pass` check handlers. Return structured results array. | medium |
| 2. `milestone ship` command | Parse args, load milestone, run criteria, prompt manual confirms, prompt version bump, create git tag, optionally create GitHub release, update milestone status, close epic. | large |
| 3. Version bump logic | Read package.json + plugin.json, update version field, write both. Atomic — if one fails, revert the other. | small |
| 4. Git tag and GitHub release | Create annotated git tag via `git tag -a`. Detect `gh` CLI availability. If present, run `gh release create --generate-notes`. | medium |
| 5. `milestone defer` command | Parse args, validate state, prompt for reason if missing, update milestones.yaml. | small |
| 6. SKILL.md updates | Add `milestone ship` and `milestone defer` documentation to `/adev:issues` SKILL.md. | small |
| 7. Tests | Unit tests for `evaluateShipCriteria`. Integration tests for ship flow (mock issue manager, mock git). Test idempotency, error cases, dirty worktree detection. | large |

## Acceptance Criteria

- [ ] `evaluateShipCriteria` returns pass/fail for `all_issues_closed` check
- [ ] `evaluateShipCriteria` returns pass/fail for `gates_pass` check (runs `npm test`)
- [ ] `evaluateShipCriteria` with no criteria returns empty (all pass)
- [ ] `milestone ship` stops on first failing auto-check without prompting confirms
- [ ] `milestone ship` prompts manual confirms one by one after auto-checks pass
- [ ] `milestone ship` prompts version bump when milestone name matches semver
- [ ] Version bump updates both `package.json` and `.claude-plugin/plugin.json`
- [ ] `milestone ship` creates a git tag
- [ ] `milestone ship` creates a GitHub release when `gh` is available, warns when not
- [ ] `milestone ship` updates status to `shipped` and closes the epic
- [ ] `milestone ship` on already-shipped milestone is a no-op
- [ ] `milestone ship` blocks on dirty worktree
- [ ] `milestone defer` sets status to `deferred` with reason
- [ ] `milestone defer` rejects on shipped milestone
- [ ] All error cases return expected messages
- [ ] All quality gates pass (tests, lint)
- [ ] No constitutional violations introduced
