# Live Spec: Milestone Ship and Ship Criteria Evaluation

---
charter: milestone-lifecycle
status: review-passed
risk_level: medium
milestone: v1
revision: 1
charter-revision: 2
created: 2026-05-09
updated: 2026-05-09
---

## Behavioral Contract

### Preconditions

- `.context-index/milestones.yaml` exists with at least one milestone entry
- `manifest.yaml` exists with `tasks.backend` and `gates.test` entries
- The milestone's `epic_id` may reference an existing epic, or may be `null` / reference a deleted epic (handled via BROKEN_EPIC error)
- `lib/milestones.mjs` provides `loadMilestones()`, `saveMilestones()`, `findMilestone()`, `validateMilestoneName()` (from milestone-crud spec)

### Behaviors

1. **When** `evaluateShipCriteria(milestone, issueManager, manifest)` is called with a milestone that has `ship_criteria` containing `{ check: "all_issues_closed" }` **then** it queries all issues under the milestone's linked epic and returns `{ check: "all_issues_closed", passed: true }` if every issue has status `closed`, or `{ check: "all_issues_closed", passed: false, detail: "3 issues still open" }` otherwise.

2. **When** `evaluateShipCriteria()` is called with a milestone that has `ship_criteria` containing `{ check: "gates_pass" }` **then** it reads `manifest.gates.test` (e.g., `"npm test"`), executes the command via `child_process.execSync`, and returns `{ check: "gates_pass", passed: true }` if exit code is 0, or `{ check: "gates_pass", passed: false, detail: "<stderr excerpt>" }` otherwise.

3. **When** `evaluateShipCriteria()` is called with a milestone that has `ship_criteria` containing `{ confirm: "<text>" }` **then** it skips those entries (manual confirms are not auto-evaluable) and returns them as `{ confirm: "<text>", passed: null }` to signal the caller must prompt interactively.

4. **When** `evaluateShipCriteria()` is called with a milestone that has no `ship_criteria` **then** it returns an empty array (no criteria to evaluate).

5. **When** `milestone ship <name>` is invoked **then** it validates the name, loads the milestone, runs `evaluateShipCriteria()`, reports results, and blocks if any auto-check failed. Returns a result object with `{ shipped: boolean, results: [...], tag: string|null }`.

6. **When** `milestone ship <name>` is invoked and all auto-checks pass **then** the skill prompts the user for each manual `confirm` criterion ("CHANGELOG updated? (yes/no)"). If any confirm is rejected, shipping is blocked.

7. **When** `milestone ship <name>` succeeds (all checks pass, all confirms accepted) **then** the milestone status is updated to `shipped` in `milestones.yaml`, the linked epic is closed via `issueManager.close(epicId, "Milestone shipped")`, and a success message is returned.

8. **When** `milestone ship <name>` succeeds and the milestone name matches semver (with or without `v` prefix, regex `/^v?\d+\.\d+\.\d+/`) **then** a git tag is created. If the name already starts with `v`, the tag uses the name as-is (e.g., name `v1.0.0` → tag `v1.0.0`). If not, the tag is `v<name>` (e.g., name `1.0.0` → tag `v1.0.0`). If `gh` CLI is available, a GitHub release draft is created with `gh release create <tag> --generate-notes --draft`. Implementation note: use `execFileSync('git', ['tag', tagName])` — never shell interpolation.

9. **When** `milestone ship <name>` is invoked and the milestone already has `status: shipped` **then** it is a no-op: returns `{ shipped: true, skipped: true }` with message "Milestone '<name>' is already shipped."

10. **When** `milestone ship <name>` succeeds and `gh` CLI is not available **then** the git tag is still created but the GitHub release is skipped with a warning: "GitHub release skipped — `gh` CLI not found."

### Postconditions

- After successful ship: git tag is created first, then `milestones.yaml` entry is updated to `status: shipped`, then the linked epic is closed. If epic close fails, tag and status are already committed — the epic remains open with a warning (partial success).
- After failed ship (criteria not met): no state is mutated — `milestones.yaml` and the issue board are unchanged.
- `evaluateShipCriteria` is a pure query — it never mutates state. It validates `epic_id` and throws BROKEN_EPIC if the epic does not exist or `epic_id` is null.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `milestone ship` with no name argument | Print usage hint and exit | MISSING_NAME |
| `milestone ship` with invalid name | Reject with "Invalid milestone name" | INVALID_NAME |
| `milestone ship <name>` where name not found in `milestones.yaml` | "Milestone '<name>' not found" | MILESTONE_NOT_FOUND |
| Milestone has `epic_id: null` or references non-existent epic | "Milestone '<name>' has no valid linked epic — cannot evaluate ship criteria" | BROKEN_EPIC |
| `all_issues_closed` check fails | Report open issue count, block ship | CRITERIA_FAILED |
| `gates_pass` check fails (test command exits non-zero) | Report failure detail, block ship | CRITERIA_FAILED |
| Manual confirm rejected by user | "Ship cancelled — '<confirm text>' not confirmed" | CONFIRM_REJECTED |
| Git tag `v<name>` already exists | "Tag v<name> already exists — cannot ship" | TAG_EXISTS |
| `issueManager.close()` throws during epic close | Warn but do not roll back — tag is created, milestone is shipped, epic close failed | EPIC_CLOSE_FAILED |
| `manifest.gates.test` not configured when `gates_pass` criterion exists | Treat as failed: "No test command configured in manifest.gates.test" | NO_TEST_COMMAND |

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — `evaluateShipCriteria` uses `child_process.execSync` for test command execution and `child_process.execSync` for git tag. `gh` CLI is optional with graceful degradation.
- **Principle:** "Skills are primarily markdown" — `milestone ship` subcommand is documented in SKILL.md; `evaluateShipCriteria` and `milestoneShip` are companion code in `lib/milestones.mjs`.
- **Principle:** "Pure ESM" — all new code uses `.mjs` extension.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. `evaluateShipCriteria` function | Implement `evaluateShipCriteria(milestone, issueManager, manifest)` in `lib/milestones.mjs`. Handles `all_issues_closed` (query issues), `gates_pass` (exec test command), and `confirm` (passthrough). | medium |
| 2. `milestoneShip` command logic | Implement `milestoneShip(projectRoot, name, options)` in `lib/milestones.mjs`. Orchestrates: validate → load → evaluate criteria → prompt confirms → update status → close epic → git tag → optional GH release. | large |
| 3. SKILL.md `milestone ship` documentation | Add `milestone ship` subcommand section to `skills/issues/SKILL.md`. | small |
| 4. Tests for ship criteria and milestone ship | Unit tests for `evaluateShipCriteria` with mock issue manager. Integration tests for `milestoneShip` covering success, criteria failure, idempotency, tag conflict, and graceful degradation. | medium |

## Acceptance Criteria

- [ ] `evaluateShipCriteria` returns correct pass/fail for `all_issues_closed` check
- [ ] `evaluateShipCriteria` executes `manifest.gates.test` for `gates_pass` check
- [ ] `evaluateShipCriteria` passes through `confirm` entries as `passed: null`
- [ ] `evaluateShipCriteria` returns empty array when no ship criteria defined
- [ ] `milestone ship v1.0.0` blocks when any auto-check fails
- [ ] `milestone ship v1.0.0` prompts for each manual confirm
- [ ] `milestone ship v1.0.0` updates status to `shipped` and closes epic on success
- [ ] `milestone ship v1.0.0` creates git tag `v1.0.0` for semver names
- [ ] `milestone ship v1.0.0` on already-shipped milestone is a no-op
- [ ] `milestone ship v1.0.0` skips GitHub release when `gh` CLI unavailable
- [ ] `milestone ship v1.0.0` blocks when tag already exists
- [ ] All error cases return expected error codes
- [ ] `evaluateShipCriteria` is exported and independently testable
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
