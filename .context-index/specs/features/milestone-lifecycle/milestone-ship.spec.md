# Live Spec: Milestone Ship with Strategy-Based Release Execution

---
charter: milestone-lifecycle
status: validated
risk_level: medium
milestone:
revision: 2
charter-revision: 3
created: 2026-05-09
updated: 2026-05-11
source-manifest:
  sha: "8a43cf5"
  files:
    - lib/milestones.mjs
    - skills/issues/SKILL.md
    - tests/milestones.test.mjs
  computed-at: "2026-05-11T15:53:40.792Z"
---

## Behavioral Contract

### Preconditions

- `.context-index/milestones.yaml` exists with at least one milestone entry
- `manifest.yaml` exists with `tasks.backend` and `gates.test` entries
- The milestone's `epic_id` may reference an existing epic, or may be `null` / reference a deleted epic (handled via BROKEN_EPIC error)
- `lib/milestones.mjs` provides `loadMilestones()`, `saveMilestones()`, `findMilestone()`, `validateMilestoneName()` (from milestone-crud spec)

### Release Strategy Model

The `release` field on a milestone entry supports a `strategy` property that determines what `milestoneShip` does after ship criteria pass. The strategy controls **release mechanics only** — criteria evaluation, status transitions, and epic closing are identical across all strategies.

```yaml
# milestones.yaml
milestones:
  - name: 1.0.0
    status: planned
    epic_id: epic-57
    release:
      strategy: manual          # "manual" (default) | "tag-only" | "release-please"
    ship_criteria:
      - check: all_issues_closed
```

| Strategy | Release mechanics after criteria pass |
|----------|---------------------------------------|
| `manual` | No git operations. Marks shipped, closes epic, prints guidance: "Tag and publish manually." |
| `tag-only` | Creates git tag (`v<name>` for semver names). Optionally creates GitHub release draft via `gh` CLI if available. |
| `release-please` | Writes `release-as: <version>` to `release-please-config.json`. Detects open Release PR via `gh pr list` and prints its URL. No git tag (release-please creates the tag when the PR is merged). |

When `release` is `null`, absent, or has no `strategy` field, the effective strategy is `manual`.

### Behaviors

#### Ship Criteria Evaluation (unchanged, strategy-independent)

1. **When** `evaluateShipCriteria(milestone, issueManager, manifest)` is called with a milestone that has `ship_criteria` containing `{ check: "all_issues_closed" }` **then** it queries all issues under the milestone's linked epic and returns `{ check: "all_issues_closed", passed: true }` if every issue has status `closed`, or `{ check: "all_issues_closed", passed: false, detail: "3 issues still open" }` otherwise.

2. **When** `evaluateShipCriteria()` is called with a milestone that has `ship_criteria` containing `{ check: "gates_pass" }` **then** it reads `manifest.gates.test` (e.g., `"npm test"`), executes the command via `child_process.execFileSync` (array args, no shell), and returns `{ check: "gates_pass", passed: true }` if exit code is 0, or `{ check: "gates_pass", passed: false, detail: "<stderr excerpt>" }` otherwise.

3. **When** `evaluateShipCriteria()` is called with a milestone that has `ship_criteria` containing `{ confirm: "<text>" }` **then** it returns them as `{ confirm: "<text>", passed: null }` to signal the caller must prompt interactively.

4. **When** `evaluateShipCriteria()` is called with a milestone that has no `ship_criteria` **then** it returns an empty array (no criteria to evaluate).

#### Milestone Ship Orchestration (shared across strategies)

5. **When** `milestone ship <name>` is invoked **then** it validates the name, loads the milestone, runs `evaluateShipCriteria()`, reports results, and blocks if any auto-check failed.

6. **When** `milestone ship <name>` is invoked and all auto-checks pass **then** the skill prompts the user for each manual `confirm` criterion ("CHANGELOG updated? (yes/no)"). If any confirm is rejected, shipping is blocked.

7. **When** `milestone ship <name>` is invoked and the milestone already has `status: shipped` **then** it is a no-op: returns `{ shipped: true, skipped: true }` with message "Milestone '<name>' is already shipped."

#### Strategy: `manual` (default)

8. **When** `milestone ship <name>` succeeds with strategy `manual` (or no strategy configured) **then** the milestone status is updated to `shipped` in `milestones.yaml`, the linked epic is closed via `issueManager.close(epicId, "Milestone shipped")`, and the result includes `{ shipped: true, strategy: "manual" }`. If the milestone name matches semver, it prints: "Ready to release. Create tag and publish manually: `git tag v<name> && git push --tags`".

#### Strategy: `tag-only`

9. **When** `milestone ship <name>` succeeds with strategy `tag-only` and the milestone name matches semver (regex `/^v?\d+\.\d+\.\d+/`) **then** a git tag is created via `execFileSync('git', ['tag', tagName])`. If the name starts with `v`, the tag uses the name as-is; otherwise the tag is `v<name>`. The milestone status is updated to `shipped` and the linked epic is closed.

10. **When** `milestone ship <name>` succeeds with strategy `tag-only` and `gh` CLI is available **then** a GitHub release draft is created with `gh release create <tag> --generate-notes --draft`.

11. **When** `milestone ship <name>` succeeds with strategy `tag-only` and `gh` CLI is not available **then** the git tag is still created but the GitHub release is skipped with a warning: "GitHub release skipped — `gh` CLI not found."

12. **When** `milestone ship <name>` succeeds with strategy `tag-only` and the milestone name does not match semver **then** no git tag is created. The milestone status is updated to `shipped` and the epic is closed. Prints: "Non-semver milestone — no git tag created."

#### Strategy: `release-please`

13. **When** `milestone ship <name>` succeeds with strategy `release-please` and the milestone name matches semver **then** `milestoneShip` reads `release-please-config.json` from the project root, writes `"release-as": "<version>"` into the first package entry, and saves the file. The version written is the milestone name without the `v` prefix (e.g., name `v1.0.0` → `release-as: "1.0.0"`, name `1.0.0` → `release-as: "1.0.0"`). The milestone status is updated to `shipped` and the linked epic is closed.

14. **When** `milestone ship <name>` succeeds with strategy `release-please` **then** `milestoneShip` detects the open Release PR by running `gh pr list --head release-please--branches--main --json number,title,url --limit 1`. If found, it prints: "Merge Release PR #N to publish: <url>". If no PR is found or `gh` CLI is unavailable, it prints: "Push the release-as config change to main. Release-please will open a Release PR."

15. **When** `milestone ship <name>` is invoked with strategy `release-please` and `release-please-config.json` does not exist in the project root **then** it falls back to `manual` strategy with a warning: "release-please-config.json not found — falling back to manual strategy."

16. **When** `milestone ship <name>` succeeds with strategy `release-please` and the milestone name does not match semver **then** no `release-as` is written. The milestone is marked shipped and epic closed. Prints: "Non-semver milestone — release-please config not modified."

#### Execution Order (all strategies)

17. **When** `milestone ship <name>` succeeds with strategy `tag-only` **then** the execution order is: (1) create git tag, (2) update `milestones.yaml` status to `shipped`, (3) close linked epic. If tag creation fails, no state is mutated. If epic close fails after tag and status update, warn but do not roll back.

18. **When** `milestone ship <name>` succeeds with strategy `release-please` **then** the execution order is: (1) write `release-as` to config, (2) update `milestones.yaml` status to `shipped`, (3) close linked epic. If config write fails, no state is mutated. If epic close fails, warn but do not roll back.

19. **When** `milestone ship <name>` succeeds with strategy `manual` **then** the execution order is: (1) update `milestones.yaml` status to `shipped`, (2) close linked epic. If epic close fails, warn but do not roll back.

### Postconditions

- After successful ship (any strategy): `milestones.yaml` entry has `status: shipped`. Linked epic is closed (or warned on failure).
- After successful ship with `tag-only`: a git tag exists for semver milestones.
- After successful ship with `release-please`: `release-please-config.json` contains `release-as` for semver milestones.
- After successful ship with `manual`: no git or filesystem operations beyond `milestones.yaml`.
- After failed ship (criteria not met): no state is mutated — `milestones.yaml`, release-please config, git tags, and the issue board are unchanged.
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
| Git tag `v<name>` already exists (strategy: `tag-only`) | "Tag v<name> already exists — cannot ship" | TAG_EXISTS |
| `release-please-config.json` not found (strategy: `release-please`) | Fall back to `manual` with warning | RELEASE_CONFIG_MISSING |
| `release-please-config.json` is malformed JSON (strategy: `release-please`) | "release-please-config.json is not valid JSON — cannot write release-as" | RELEASE_CONFIG_INVALID |
| `issueManager.close()` throws during epic close | Warn but do not roll back — milestone is shipped | EPIC_CLOSE_FAILED |
| `manifest.gates.test` not configured when `gates_pass` criterion exists | Treat as failed: "No test command configured in manifest.gates.test" | NO_TEST_COMMAND |
| Unknown strategy value | "Unknown release strategy '<value>'. Expected: manual, tag-only, release-please" | UNKNOWN_STRATEGY |

### Implementation Notes

- **Strategy resolution:** Extract a `resolveStrategy(milestone)` helper that returns `"manual"`, `"tag-only"`, or `"release-please"`. Returns `"manual"` for `null`/missing/absent `release` or `release.strategy`.
- **release-please config write:** Read the JSON, navigate to `packages["."]` (or first package key), set `"release-as"`, write back with 2-space indent. Use `JSON.parse`/`JSON.stringify` — no external dependency.
- **PR detection:** The `gh pr list` call uses `--head release-please--branches--main` as a prefix match. The full branch name includes `--components--<name>` which varies per project. If `gh` is unavailable, skip PR detection gracefully.
- **Injectable executors:** `milestoneShip` accepts `options.execGit` (for `tag-only`), `options.execGh` (for `tag-only` GitHub release and `release-please` PR detection), and `options.writeReleasePleaseConfig` (for `release-please` config write) — all injectable for testing.
- **`execFileSync` for security:** All external command execution uses `execFileSync` with array args, never shell string interpolation. The milestone name regex (`[a-zA-Z0-9._-]+`) provides defense in depth.

## System Constitution Reference

- **Principle:** "Minimize external dependencies" — Strategy dispatch, JSON file I/O, and `execFileSync` are all Node.js built-ins. No dependency on release-please as a library. The `release-please` strategy is a JSON file write, not an API call.
- **Principle:** "Skills are primarily markdown" — `milestone ship` subcommand is documented in SKILL.md; `milestoneShip` and `evaluateShipCriteria` are companion code in `lib/milestones.mjs`.
- **Principle:** "Pure ESM" — all new code uses `.mjs` extension.
- **Principle:** "Version parity" — The `release-please` strategy delegates version bumping to release-please, which handles `package.json` ↔ `plugin.json` parity via its `extra-files` config. The `tag-only` and `manual` strategies do not modify version files (users handle parity manually or via existing hooks).

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. `resolveStrategy` helper | Extract strategy resolution from milestone's `release` field. Returns `"manual"` for null/missing. Validates against known strategy list. | small |
| 2. Refactor `milestoneShip` to strategy dispatch | Replace hardcoded tag/release logic with strategy switch. `manual` does nothing, `tag-only` preserves current behavior, `release-please` writes config + detects PR. Shared prefix: criteria eval, confirms, status update, epic close. | medium |
| 3. `release-please` config writer | Read `release-please-config.json`, set `release-as` on first package, write back. Handle missing file (fallback) and malformed JSON (error). | small |
| 4. PR detection for `release-please` strategy | Run `gh pr list --head release-please--branches--main` to find open Release PR. Graceful degradation when `gh` unavailable. | small |
| 5. Update `saveMilestones`/`loadMilestones` for release schema | Serialize/deserialize `release: { strategy: "..." }` (currently `release: null`). Backward compatible — existing `null` values remain valid. | small |
| 6. SKILL.md `milestone ship` documentation | Update `skills/issues/SKILL.md` to document strategy selection and per-strategy behavior. | small |
| 7. Tests | Unit tests for `resolveStrategy`, config writer, PR detection mock. Integration tests for each strategy path. Update existing ship tests to specify strategy. | medium |

## Acceptance Criteria

- [ ] `resolveStrategy` returns `"manual"` for null/missing/absent release config
- [ ] `resolveStrategy` returns the configured strategy for valid values
- [ ] `resolveStrategy` throws UNKNOWN_STRATEGY for unrecognized values
- [ ] `milestone ship` with strategy `manual` marks shipped and closes epic with no git ops
- [ ] `milestone ship` with strategy `manual` prints tag guidance for semver names
- [ ] `milestone ship` with strategy `tag-only` creates git tag for semver names
- [ ] `milestone ship` with strategy `tag-only` skips GitHub release when `gh` unavailable
- [ ] `milestone ship` with strategy `tag-only` blocks when tag already exists
- [ ] `milestone ship` with strategy `release-please` writes `release-as` to config JSON
- [ ] `milestone ship` with strategy `release-please` detects and prints open Release PR URL
- [ ] `milestone ship` with strategy `release-please` falls back to `manual` when config missing
- [ ] `milestone ship` with strategy `release-please` handles malformed config JSON gracefully
- [ ] `milestone ship` with strategy `release-please` does NOT create git tags
- [ ] Ship criteria evaluation is unchanged and strategy-independent
- [ ] `milestone ship` on already-shipped milestone is a no-op (all strategies)
- [ ] Non-semver milestones skip tag/config operations (all strategies)
- [ ] All error cases return expected error codes
- [ ] `evaluateShipCriteria` is exported and independently testable
- [ ] All quality gates pass
- [ ] No constitutional violations introduced
