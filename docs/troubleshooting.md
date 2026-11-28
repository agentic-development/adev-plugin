[adev docs](README.md) > Advanced

# Troubleshooting & FAQ

This page covers common issues you may encounter when using adev, organized by symptom. Each entry describes what you see, why it happens, and how to fix it. The FAQ section at the end answers frequently asked questions.

## Troubleshooting

### Hook Warnings

#### "merge-guard blocked my push"

**What you see:** The merge-guard hook exits with code 2 and blocks your `git push` or `git merge` command.

**Why it happens:** You are trying to push or merge directly to a protected branch (typically `main` or `master`). The merge-guard hook enforces the project's merge policy by preventing direct pushes to protected branches.

**How to fix it:** Create a feature branch and open a pull request instead. Protected branches are configured in `manifest.yaml` under `completion.protected_branches`. If you need to change which branches are protected, edit that list — but never bypass the hook by force-pushing.

#### "constitution-linter warning"

**What you see:** A warning appears after editing the constitution file, indicating the constitution is too large or has structural problems.

**Why it happens:** The constitution linter hook runs after every edit to `constitution.md`. It checks that the file follows the expected structure (Identity, Non-Negotiable Principles, Coding Standards, etc.) and stays within a reasonable size. A malformed or oversized constitution can degrade agent performance because every skill reads it.

**How to fix it:** Review your constitution for sections that grew too long. Move detailed guidelines into ADRs (`.context-index/adrs/`) or feature charters/specs under `.context-index/specs/`. Keep the constitution under ~200 lines. Run `/adev:sync` after making changes to propagate updates to agent files.

#### "context-preflight warning"

**What you see:** A warning appears before source file edits, saying you have not read project context yet.

**Why it happens:** The context-preflight hook fires before `Edit` tool calls and checks whether the agent has read the constitution, manifest, or relevant specs in the current session. It is a safety net to prevent code changes that ignore project principles.

**How to fix it:** Read the relevant context files first. At minimum, the agent should read `.context-index/constitution.md` and `.context-index/manifest.yaml` before making code changes. Using `/adev:work` or any lifecycle skill handles this automatically. The warning is advisory and does not block the edit.

### Lifecycle Gate Blocks

#### "No charter found"

**What you see:** A lifecycle gate blocks you from running `/adev:specify` or `/adev:plan` because no Feature Charter exists for the module.

**Why it happens:** adev enforces a design-first workflow. You cannot write specs or plans without first defining the feature's scope in a charter. The gate checks for a charter file in `.context-index/specs/features/<module>/charter.md`.

**How to fix it:** Run `/adev:brainstorm` to explore the feature idea and produce a charter. The brainstorm skill creates the charter file, which unlocks the downstream skills. For existing code, you can create a charter manually or use `/adev:brainstorm` to formalize what already exists.

#### "Spec not reviewed"

**What you see:** A lifecycle gate blocks `/adev:plan` because the spec has not passed architecture review.

**Why it happens:** adev requires specs to be reviewed by specialist agents (structural, security, consistency) before planning begins. This catches design issues before any code is written. The gate checks for a `.review.md` file adjacent to the spec with a PASS status.

**How to fix it:** Run `/adev:review-specs` on the spec. The review produces a `.review.md` file. If the review finds issues, address them in the spec and re-run the review until it passes.

#### "No plan found"

**What you see:** A lifecycle gate blocks `/adev:implement` because no implementation plan exists for the spec.

**Why it happens:** Implementation requires a structured plan that decomposes the spec into ordered tasks with test expectations. The gate checks for a `.plan.md` file adjacent to the spec.

**How to fix it:** Run `/adev:plan` on the spec. The plan skill reads the reviewed spec and produces a task-by-task implementation plan. Each task includes file lists, test strategies, and dependency information.

### Skill Errors

#### "Skill prerequisites not met"

**What you see:** A skill refuses to run, reporting that required context files are missing.

**Why it happens:** Each skill has prerequisites — files or conditions that must exist before it can operate. For example, `/adev:implement` requires a plan, `/adev:plan` requires a reviewed spec, and `/adev:validate` requires completed implementation. Missing prerequisites usually mean an earlier lifecycle step was skipped.

**How to fix it:** Run `/adev:init` if the `.context-index/` directory is missing entirely. Otherwise, follow the lifecycle order: brainstorm, specify, review, plan, implement, validate. Use `/adev:work` to automatically determine which step to run next.

#### "Subagent failed or got stuck"

**What you see:** An implementation or review subagent stops making progress, produces incorrect output, or enters a retry loop.

**Why it happens:** Subagents can get stuck when they lack sufficient context, encounter an unexpected codebase state, or hit an ambiguous requirement. The `/adev:implement` skill caps retry loops to prevent infinite cycling.

**How to fix it:** Run `/adev:recover` to diagnose the root cause. The recover skill classifies the failure (missing context, spec ambiguity, tooling issue, etc.), injects corrective context, and re-dispatches with an enriched prompt. If recovery fails, check `.context-index/hygiene/blockers/` for structured blocker files that describe what went wrong.

### Configuration Mistakes

#### "manifest.yaml not found"

**What you see:** Skills report that `manifest.yaml` is missing or cannot be read.

**Why it happens:** The manifest file at `.context-index/manifest.yaml` is the central configuration for adev. It defines modules, specialists, quality gates, and other settings. Without it, most skills cannot determine project structure.

**How to fix it:** Run `/adev:init` to create or regenerate the manifest. If you have a `.context-index/` directory but the manifest was accidentally deleted, the init wizard can recreate it while preserving other context files.

#### "Version mismatch between package.json and plugin.json"

**What you see:** A warning about version numbers not matching between `package.json` and `.claude-plugin/plugin.json`.

**Why it happens:** adev enforces version parity as a non-negotiable principle. Both files must declare the same version string. This can happen when one file is updated manually without updating the other.

**How to fix it:** Update both files to the same version. Check the current versions with `cat package.json | grep version` and `cat .claude-plugin/plugin.json | grep version`, then edit whichever is behind. Always update both in the same commit.

## GitHub issue backend

These are the error codes for `tasks.backend: github` (see [concepts](concepts.md#issue-board-backends) and [`tasks.github`](configuration.md#tasksgithub)), the `adev issues github setup` verb, and `adev issues migrate --to github`. Every error is thrown with its `code`. The github backend never falls back to a local board, and a token in a message from `gh` or GitHub is redacted before it is printed.

### Configuration and preflight

| Code | When | Remedy |
|---|---|---|
| `GITHUB_INVALID_CONFIG` | A `tasks.github` key is missing, malformed or unknown. The adapter checks this when it is constructed, before any network call, and the message names the key | Fix the named key; the full key list and its defaults are in [configuration](configuration.md#tasksgithub) |
| `GITHUB_CLI_MISSING` | `gh` is not on `PATH` | Install the GitHub CLI from https://cli.github.com and retry |
| `GITHUB_AUTH_REQUIRED` | `gh` is not authenticated and no `GH_TOKEN` is set | Run `gh auth login`, or set `GH_TOKEN` |
| `GITHUB_SCOPE_MISSING` | The token reports scopes and lacks `repo` or `project`; the message names each missing scope | Run `gh auth refresh -s project` (or the scopes the message names). Fine-grained and App tokens report no scopes and surface as `GITHUB_PERMISSION_DENIED` instead |
| `GITHUB_PERMISSION_DENIED` | GitHub refused an operation for lack of permission; the message names the operation and carries GitHub's reason | Grant the token issue read/write on the repo and read/write on the project (or triage, for labels and issue types) |
| `GITHUB_PROJECT_NOT_FOUND` | `tasks.github.project` does not resolve, or the authenticated user cannot see it | Check the URL in `tasks.github.project`, then run `adev issues github setup` |
| `GITHUB_REPO_NOT_FOUND` | `tasks.github.repo` does not resolve, or the authenticated user cannot see it | Check `owner/repo` in `tasks.github.repo`, then run `adev issues github setup` |
| `GITHUB_FIELD_MISSING` | A required project field is absent or has the wrong type; the message names the field and its expected type | Create or fix the field, then run `adev issues github setup` (it can create the missing fields) |
| `GITHUB_STATUS_OPTION_MISSING` | `tasks.github.status_map` names an option the status field lacks | Add the option on the board or fix `status_map`, then run `adev issues github setup` |
| `SETUP_CONFIRMATION_REQUIRED` | `adev issues github setup` has changes to apply but stdin is not an interactive terminal and `--yes` was not passed. Nothing was written | Re-run with `--yes` to apply the printed write set, or `--dry-run` to only print it |
| `SETUP_CANCELLED` | An interactive `adev issues github setup` was answered with anything but yes. Nothing was written | Re-run and answer `y`, or pass `--yes` |

### Reading the board

| Code | When | Remedy |
|---|---|---|
| `GITHUB_UNMAPPED_STATUS` | An open issue sits on a status option that is not in `status_map`. `get` names the item; `list` and `walkTree` name every offending item and return nothing | Add the option to `tasks.github.status_map`, or move the item to a mapped option on the board |
| `GITHUB_INVALID_FIELD_VALUE` | A field value read from the board (or about to be written) fails its check, for example a `Branch` that is not a valid ref name or a `Spec` path containing `..`. Values are never repaired on read | Fix the named field of the named item on the board |
| `GITHUB_PAGINATION_INVALID` | GitHub repeated a pagination cursor or returned more pages than its own `totalCount` allows. No partial result is returned | Retry; if it persists, the board changed mid-read in a way adev refuses to guess about, so report it |
| `GITHUB_SUBISSUE_CYCLE` | `walkTree` reached an item it had already visited: the sub-issue parent links form a cycle | Fix the parent links of the named items on GitHub |
| `GITHUB_INVALID_ID` | An ID is neither a canonical `gh-` ID, `#<n>`, `<owner>/<repo>#<n>`, an `https://github.com/<owner>/<repo>/issues/<n>` URL, nor a resolvable old ID | Pass one of the accepted forms |
| `GITHUB_AMBIGUOUS_LEGACY_ID` | An old (pre-migration) ID matches the `Legacy ID` of more than one item. Nothing is chosen or written; a migration stops before any write | Use the `gh-` ID instead, or keep that `Legacy ID` on one item by hand |
| `NOT_FOUND` | The ID, old ID, epic or dependency is not on the project. `get` returns `null`; mutating methods throw | Check the ID with `adev issues list`; add the issue to the project if it lives elsewhere |
| `GITHUB_RATE_LIMITED` | GitHub answered with a primary or secondary rate limit; the error carries the reset time. Nothing is retried automatically | Wait for the reset time and retry. A migration waits by itself within its bounds and otherwise stops resumably |
| `GITHUB_UNREACHABLE` | `gh` timed out or hit a network failure. Nothing was written locally or queued | Check the network and retry |
| `GITHUB_REQUEST_FAILED` | Any other GitHub or `gh` failure with no more specific code (a non-JSON response, a response without data, an oversized response, a non-zero `gh` exit) | Read the redacted detail in the message and retry; report it if it repeats |
| `GITHUB_TRANSPORT_INTERNAL` | The transport refused a request whose argv is not the fixed `gh api graphql --input -`. No caller can reach this | This is an adev bug; report it with the command you ran |

**A just-created or just-updated item is missing from `list` or shows old values.** GitHub's project items listing is eventually consistent and can lag a write by a few seconds. `get`, `update`, `close`, `claim`, `release` and `dep` read a `gh-<n>` item directly and are not affected, and `list` in the process that made the write shows it at once; a `list`, `board` or `next` in another command can lag. Re-run it after a few seconds. See [how `github` differs](concepts.md#how-github-differs).

**A Status adev wrote changes back a second later.** A built-in project workflow overwrote it: with "Item added to project" or "Auto-add sub-issues to project" on, `github-project-automation` resets a new item's Status (for example `In Progress` back to `Backlog`). Disable every workflow that sets Status on the project's **Workflows** page, then set the status again with `adev issues update <id> --status <status>`.

### Writing to the board

| Code | When | Remedy |
|---|---|---|
| `PARENT_NOT_FOUND` | The `parent_id` given to `create` is not on the project. Nothing was created | Create or add the parent first, or pass the right ID |
| `VALIDATION` | A write carries a field or value the github backend does not write, for example `--id` on create (GitHub assigns the number), an invalid status, or an unsupported update key | Drop the named field; the message says what the backend accepts |
| `MISSING_REQUIRED_FIELD` | `create` without a title, or `update --title ""` | Pass a non-empty title |
| `BOARD_GRANULARITY_VIOLATION` | A `planTask` was passed to `create` or `update`. Plan tasks are not board items | Record plan-task state in the lifecycle log instead |
| `ISSUE_CLOSED` | `update` or `claim` on a closed issue. Nothing was written | Reopen the issue on GitHub first, or work on another issue |
| `USE_CLOSE_METHOD` | `update` tried to set `status: "closed"`. Nothing was written | Use `adev issues close <id> --reason <text>` |
| `GITHUB_PARTIAL_CREATE` | A write failed after the GitHub issue was created. The issue is kept; the error carries its new ID and the unwritten fields, and `adev issues create` / `epic` print both and exit 1 | Finish that issue instead of creating it again. If the message says it is not on the project, add it to the project first |
| `GITHUB_WRITE_FAILED` | GitHub rejected a mutation, or a write needs a label, issue type, milestone or Priority option the repo or project lacks (adev never creates those). Also a claim write that GitHub rejected | Create the missing label, issue type, milestone or option on GitHub, or fix what GitHub's reason names, then retry |
| `BLOCKED_BY_DEPENDENCIES` | `close` while a blocked-by issue is still open. Nothing was written | Close the blocking issues first |
| `CASCADE_BLOCKED` | `close` while a sub-issue on the project is still open. Nothing was written | Close the child issues first |
| `CIRCULAR_DEPENDENCY` | `adev issues dep` would create a direct or transitive dependency cycle | Drop the dependency that closes the cycle |
| `ISSUE_ALREADY_CLAIMED` | `claim` on a live lease held by another owner, or the claim lost a race on a re-read. The error carries the winner's `owner` and `claimed_at`; nothing further was written | Pick another issue, or wait for the lease to expire |
| `CLAIM_OWNER_MISMATCH` | `release` by someone who is not the holder, without `--force` | Release as the holder, or pass `--force` deliberately |

### Read-only boards and migration

| Code | When | Remedy |
|---|---|---|
| `BOARD_READ_ONLY_MIGRATED` | A write to a json or beads board whose storage root holds the read-only sentinel (`.context-index/tasks/board-read-only.json`, or `.beads/adev-read-only.json` for beads). Reads still work. An unreadable sentinel blocks as well | Make the change on the GitHub board the sentinel names. To un-retire the board, see [Unlocking a migrated board](#unlocking-a-migrated-board) |
| `BACKEND_READ_ONLY_DEPRECATED` | Any write through the markdown `file` backend, sentinel or not | Migrate with `adev issues migrate --to json` (or `--to github`) |
| `SENTINEL_PATH_UNSAFE` | The sentinel path, or the unanchored-item record, is a symlink, or its real path (or its directory's) lies outside the storage root. Nothing was written or trusted | Replace the symlink with a regular file or directory inside the storage root, then re-run |
| `MIGRATE_ARG_PARSE` | `adev issues migrate` got an unknown flag, or a flag without its value | Fix the arguments; see `adev issues migrate --help` |
| `MIGRATE_MISSING_TARGET` | `adev issues migrate` without `--to` | Pass `--to <backend>` |
| `MIGRATE_UNKNOWN_BACKEND` | `--to` or `--from` is not one of `SUPPORTED_BACKENDS` (json, file, beads, github) | Pass a supported backend |
| `MIGRATE_TARGET_READONLY` | `--to file`: the markdown backend is read-only-deprecated | Use `--to json`, `--to beads` or `--to github` |
| `MIGRATE_NOOP` | The source and target backends are the same | Nothing to migrate; pick a different `--to` |
| `MIGRATE_GITHUB_UNAVAILABLE` | The resolved source is `github` (`--from github`, or `tasks.backend: github` with no `--from`): github as a migration source is not supported. Nothing was constructed, read or written | Migration out of a GitHub board is not supported; only `--to github` is |
| `MIGRATE_SOURCE_INVALID` | The source board could not be opened or read (for example a malformed `tasks.json`) | Fix the source board the message names, then re-run |
| `BEADS_NOT_AVAILABLE` | `--to beads` without the `br` CLI on `PATH` | Install `br` (>= 0.2.19), or pick another target |
| `BEADS_PROBE_FAILED` | Probing `br` failed for an unexpected reason while checking a `--to beads` target | Run `br --version` to see the failure, fix it, then re-run |
| `MIGRATE_RESUME_INVALID` | `.context-index/tasks/.migrate-state.json` cannot be parsed, is not a JSON object, or (for `--to github`) has no boolean `scope_args.includeClosed` | Delete the state file and re-run; on `--to github` the target board decides what is skipped, so nothing is duplicated |
| `MIGRATE_RESUME_MISMATCH` | The state file records a different source or target. For `--to github`, also when its `includeClosed` differs from whether this run passes `--include-closed` (json and beads targets only warn) | Re-run with the recorded scope, or delete the state file to start over with this one |
| `MIGRATE_CONFIRMATION_REQUIRED` | A `--to github` run has a write to make (GitHub items or the sentinel), is not interactive, and `--yes` was not passed, or an interactive prompt was not answered `y`/`yes`. Nothing was written | Review the printed write set, then re-run with `--yes` or answer `y` |
| `MIGRATE_TARGET_FOREIGN_LEGACY_ID` | The target project holds `Legacy ID` values that are not IDs on this source board; the message names up to 10 and the count. adev never merges two boards into one project | Migrate each source board into its own project, or clear the foreign values by hand |
| `MIGRATE_SENTINEL_PROJECT_MISMATCH` | The source board already holds a sentinel for another project, or an unreadable one | The board is already retired; remove the sentinel by hand only as described in [Unlocking a migrated board](#unlocking-a-migrated-board) |
| `MIGRATE_UNANCHORED_ITEM` | A re-run found the issue recorded in `.context-index/tasks/.migrate-unanchored.json` gone, closed, in another repository, carrying a different `Legacy ID`, or out of this run's scope; or another item already holds that source `Legacy ID`; or the record itself is unreadable. It exits 1 before any write, on every re-run | Either set `Legacy ID` to the source ID on the recorded issue by hand, or close that issue and then delete `.context-index/tasks/.migrate-unanchored.json`; then re-run. If another item already holds the `Legacy ID`, do not set it again: close the recorded issue and delete the record, or clear the `Legacy ID` on the other item. If the record is unreadable, find the issue on GitHub, set its `Legacy ID` by hand or close it, then delete the record and re-run |
| `MIGRATE_PARTIAL_FAILURE` | A migration failed on an item after it started writing. The JSON report's `errors[]` holds the failure (see [`issues migrate`](cli-reference.md#issues-migrate)) and `.migrate-state.json` is kept | Fix the cause the entry's `code` names, then re-run: a `--to github` re-run skips every item the target already holds |
| `MIGRATE_WRITE_FAILED` | The `code` of a `--to github` `errors[]` entry whose underlying error carried no code of its own | Read the entry's `message`, fix the cause, then re-run |
| `MIGRATE_SENTINEL_COMMIT_FAILED` | Beads source: committing the sentinel on `beads-board` failed, including `.beads/` not being a linked worktree on `beads-board`. The message names the sentinel's absolute path, the branch and the topology found. The sentinel is kept | Commit that one file on `beads-board` by hand, or fix the worktree; a re-run retries the commit without asking again |

#### The unanchored-item record

A `--to github` migration can fail after it created an issue but before that issue's `Legacy ID` was written. The board then cannot tell which source item the issue belongs to, so the migration writes `{ source_id, target_id }` to `.context-index/tasks/.migrate-unanchored.json` before it stops, and the next run completes that exact issue instead of creating a second one. Never delete `.context-index/tasks/.migrate-unanchored.json` while the issue it names is still unanchored: without it a re-run creates a duplicate. The migration removes it itself once the issue is complete. If a re-run stops with `MIGRATE_UNANCHORED_ITEM`, use one of the two remedies in its row above.

#### Unlocking a migrated board

A successful migration retires the source board by writing a read-only sentinel, and json and beads writes then fail with `BOARD_READ_ONLY_MIGRATED`. The sanctioned unlock is to delete the sentinel by hand, and only after you have confirmed the migration is abandoned and the GitHub board will not be used. A malformed sentinel still blocks writes, so editing it is not an unlock: delete it. For a json source, commit the deletion on the branch that carries the board. For a beads source, delete `.beads/adev-read-only.json` and commit the deletion on `beads-board`, where the migration committed it.

## Test fixtures

This section is for contributors working on the GitHub backend's tests. These codes are non-runtime: they are raised only by the replay helper (`tests/issues/github/replay-transport.mjs`) and the fixture recorder (`scripts/record-github-fixtures.mjs`), never by `adev` itself, so an operator never sees them.

### Recording the GitHub conformance fixtures

A maintainer records the fixtures by hand against a throwaway board. CI and agents never do.

1. Create the fixture organization `adev-fixtures` (a free plan is enough). The recorder refuses a board or repo owned by anyone else before it sends a request. In it, create a throwaway repository, for example `adev-fixtures/adev-fixture-board`, and a Projects v2 board whose title starts with `adev-fixture:`. The board must hold only recorder-created items, and every milestone title must also start with `adev-fixture:`. Organizations have issue types by default, so add an issue type named `Epic` under the organization's **Settings → Planning → Issue types**: the epic and migration cases fail without it. No labels or milestones are needed. On the board's **Workflows** page, turn off every built-in workflow, in particular "Item added to project" and "Auto-add sub-issues to project", which are on by default: they rewrite Status seconds after the recorder writes it, so a recording would capture GitHub's automation instead of adev's writes.
2. Create a fine-grained personal access token with **Resource owner** set to `adev-fixtures`, **Only select repositories** set to the fixture repository, the repository permission `Issues` set to read and write, and the organization permission `Projects` set to read and write. Projects write also lets the setup and migration cases create a scratch project and delete it when they finish; the token cannot link a project to a repository, and adev does not need it to. `Metadata` read-only is added automatically. Fine-grained tokens cannot reach a board owned by a user account, which is why the board belongs to an organization: the token then reaches nothing outside the fixture organization. Never use your own `gh` login or a classic token, and never paste the token value into a file or commit.
3. Read the token into `GH_TOKEN` without echoing it: `read -s GH_TOKEN && export GH_TOKEN`. The recorder refuses to run without it.
4. Prepare the board from a scratch directory, so your project's own manifest is untouched. Create `.context-index/manifest.yaml` there containing:

   ```yaml
   tasks:
     backend: github
     github:
       project: https://github.com/orgs/adev-fixtures/projects/<n>
       repo: adev-fixtures/adev-fixture-board
   ```

   Then, in that directory, run `adev issues github setup --yes` and confirm with `adev issues github setup --check`. Until a release ships the GitHub backend, run the checkout's CLI instead of the installed `adev`: `node <checkout>/cli/index.mjs issues github setup --yes`, then `--check`.
5. Record from the checkout root: `node scripts/record-github-fixtures.mjs --project <url> --repo adev-fixtures/adev-fixture-board`. Every mutation's non-empty `title` or `body` must start with `adev-fixture:`, or it is refused before it reaches GitHub. One fixture per passing case is written to `tests/issues/conformance/fixtures/`. The issues it creates stay on the board. Besides the shared contract cases, the recorder runs the github-only live cases in `tests/issues/conformance/github-live-cases.mjs`, where several agents share one recording. A live case that writes old IDs draws them from a seed stored in its fixture, so a re-recording never collides with an earlier one on the board. The migration and setup cases each create a scratch project, because a migration never merges two boards into one project, and delete it when they finish. Pass `--only <text>` to record just the cases whose name contains that text.
6. Run the fixture lint, `node --test tests/issues/github/fixture-lint.test.mjs`, and commit the fixtures only if it passes. It checks for tokens, titles or bodies without the prefix, owners other than `adev-fixtures`, and logins other than `adev-fixtures` and the maintainer login `dpavancini`. Recorded responses name the token's user as the viewer and as the issue author, so that login is committed with the fixtures. A different maintainer adds their login to `FIXTURE_LOGINS` in `scripts/record-github-fixtures.mjs` and the fixture lint before recording.
7. Delete the token when you are done.

| Code | When | Remedy |
|---|---|---|
| `UNRECORDED_GITHUB_REQUEST` | A test sent a request the replay fixtures do not hold, or repeated one past the end of its recorded sequence. The transport passes it through unmapped | Record the case again, or fix the test so it sends only the recorded requests |
| `REPLAY_ANONYMOUS_DOCUMENT` | A replayed GraphQL document is anonymous; every document must be a named operation | Name the operation in the GraphQL document |
| `REPLAY_AMBIGUOUS_FIXTURE` | Two fixture entries record different outcomes for the same request | Keep one entry, or use a `sequence` for a request that must see the board change |
| `REPLAY_INVALID_FIXTURE` | A fixture entry's `sequence` is empty or not an array | Fix or re-record the fixture |
| `RECORDER_USAGE` | The recorder got bad arguments: `--project` or `--repo` missing or malformed, or owned by someone other than the fixture organization | Pass both, owned by `adev-fixtures` |
| `RECORDER_INVALID_CASE` | A contract case name yields an empty fixture file name | Rename the case in `tests/issues/conformance/contract-cases.mjs` |
| `RECORDER_PATH_ESCAPE` | A fixture file would land outside `tests/issues/conformance/fixtures/` (a path separator in the name, or a symlink) | Remove the symlink, or fix the case name |
| `RECORDER_UNMARKED_TEXT` | A mutation's `title` or `body` does not start with `adev-fixture:`. Nothing was sent | Make the contract case's text start with the prefix |

## FAQ

### Can I use adev with tools other than Claude Code?

Yes. adev supports Claude Code, Cursor, GitHub Copilot, OpenCode, and OpenAI Codex. The plugin architecture is provider-agnostic — skills are markdown files that any AI assistant can interpret. Install with `npx @adev-org/adev-cli install` and use `--provider claude-code|cursor|opencode|codex` to select an interactive-menu provider, or `--target copilot [--user] [--dry-run]` for the file-based GitHub Copilot adapter. The `.context-index/` directory works identically across all supported providers.

### Do I have to follow every lifecycle step?

No. The lifecycle (brainstorm, specify, review, plan, implement, validate) is the recommended flow for new features, but you can skip steps when appropriate. Use `/adev:work` to route your request — it will determine the right entry point. For small bug fixes, `/adev:debug` jumps straight to investigation. For quick changes, you can implement directly and run `/adev:validate` to verify. The gates exist to catch issues early, not to slow you down.

### How do I add a custom skill?

Create a markdown file at `skills/<name>/SKILL.md` following the existing skill format. Skills are structured instructions — they do not require companion code, though helper files are allowed. The skill name becomes the slash command (e.g., `skills/my-skill/SKILL.md` becomes `/adev:my-skill`). Register it by adding the skill to your manifest modules list if you want it tracked.

### What do I do when an agent gets stuck?

Run `/adev:recover`. It diagnoses the root cause by classifying the failure into one of six categories (missing context, spec ambiguity, tooling issue, scope creep, environment problem, or model limitation). It then injects corrective context and re-dispatches the stuck subagent. Check `.context-index/hygiene/blockers/` for structured records of what went wrong. If recovery does not resolve the issue, the blocker file provides enough detail to fix the problem manually.

### How do I customize quality gates?

Edit the `governance/` directory in your `.context-index/`. Quality gates are defined in `governance/gates.yaml` with tiers (fast, integration, e2e), commands, and severity levels. The constitution's Quality Gates section (`constitution.md`) defines the baseline gates that every skill checks. You can add project-specific gates, change severity from error to warning, or add custom validation commands. Run `/adev:sync` after changing constitution-level gates.

### Can I use adev on an existing codebase?

Yes. Run `/adev:init --brownfield` to auto-detect your existing project structure, tech stack, and conventions. The wizard scans your codebase and populates the constitution with your actual patterns rather than defaults. You can also run `/adev:assess` to score your codebase's readiness for agentic development across multiple structural dimensions, then address the gaps it identifies.
