---
partial_schema: spec@1
charter: task-management
kind: behavioral
status: review-pending
risk_level: high
milestone: 6
revision: 1
charter-revision: 10
created: 2026-11-25
updated: 2026-11-25
tracker-ref: agentic-development/adev-plugin#441
infra_requirements:
  systems:
    - name: "GitHub GraphQL API (Issues + Projects v2)"
      env_vars: [GH_TOKEN]
      cli_tools:
        - gh
      probe: "gh auth status"
      check_level: presence-only
      notes: "Unit and conformance tests replay recorded GraphQL fixtures and need neither gh nor a token. Only the optional live fixture recorder and smoke test need a throwaway Projects v2 board; token scopes repo + project, nothing broader. GH_TOKEN is optional when gh is already authenticated."
  ci_tag: "integration"
---

# Live Spec: GitHub Board Backend

<!-- Live Spec within the task-management charter (revision 10).
     Parent Charter: .context-index/specs/features/task-management/charter.md
     Bridge coexistence (inbound no-op, label gate, home-repo-only selection,
     relaxed "never changes GitHub state" invariant) is specified separately as
     an amendment of autonomous-bugfix-loop/tracker-provider-bridge.spec.md. -->

## Behavioral Contract

This spec defines `tasks.backend: github`: a `GithubAdapter` that implements the unchanged `IssueManager` contract (`lib/issues/interface.mjs`) against GitHub Issues plus a Projects v2 board, so the GitHub project *is* the adev issue board. It covers configuration and fail-fast preflight, GitHub canonical IDs, field placement with maintainer-only write authority, batched reads, the write path, write + re-read claim leases, the `adev issues github setup` verb with its recommended default board, migration to GitHub via `adev issues migrate --to github`, and a conformance suite that runs against recorded GraphQL fixtures. Transport is the `gh` CLI invoked with an argv array (never a shell string), the same posture as the beads adapter's use of `br` and the existing `lib/provider/tracker-providers/github-tracker-adapter.mjs`. Plan-task state stays in the lifecycle log; nothing about the json, file, or beads backends changes except that a board migrated to GitHub refuses further writes.

## System Constitution Reference

- **Principle 1 — "Minimize external dependencies — prefer Node.js built-ins."** Applies because the adapter talks to GitHub only through the optional `gh` CLI via `node:child_process.execFileSync` with an injectable exec; no npm package (no Octokit, no GraphQL client) is added. `gh` is already a runtime dependency of the bugfix-loop bridge, so no new-dependency ADR is needed.
- **Principle 3 — "Pure ESM."** Applies because every new module (`lib/issues/github-adapter.mjs`, `lib/issues/github/*.mjs`, `lib/cli/issues-github.mjs`) is `.mjs` ESM.
- **Principle 2 — "Skills are primarily markdown."** Applies because no skill gains logic: skills keep calling `adev issues …` verbs and `getIssueManager()`; only reference prose that hard-codes dotted ID examples is reworded to be backend-neutral.
- **Architecture Boundary — "Adding external dependencies" requires human approval.** Applies as a check, not an exception: `gh` is an optional external CLI already in use, required only when `tasks.backend: github` is configured.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|---------------------|
| 1. Canonical ID recognition | `parseId()` classifies `gh-` IDs before the legacy grammar; encode/decode helpers; widen the retro (`lib/retro/issue-id-validation.mjs`) and session-capture (`lib/session-capture.mjs`) validators for the gh charset and length; display-form normalization | small |
| 2. GitHub transport | `lib/issues/github/transport.mjs`: `gh api graphql` via injectable `execFileSync`, cursor pagination, aliased multi-mutation requests, error mapping (auth, scopes, permission, rate limit, unreachable) | medium |
| 3. Config + preflight | `tasks.github.*` validation (sync, construct time) and lazy network preflight (CLI, auth, scopes, project, repo, fields, options), cached per process | medium |
| 4. Read path | `get`, `list`, `listEpics`, `walkTree` from paged project-item queries; status read mapping; field decoding; legacy-ID resolution | large |
| 5. Write path | `create`, `update`, `close`, `addDependency`, `createEpic`, `updateEpic`; closure guards; type/priority/module labels; Epic milestone; partial-create reporting | large |
| 6. Claim lease | `claim`/`release` with write order, settle re-read, rollback-by-abstention, TTL via `requireClaimable` | medium |
| 7. Registry wiring | Add `github` to `SUPPORTED_BACKENDS`; no JSON fallback; adapter exposes `name` and `claimTtlMinutes` | small |
| 8. Setup verb | `adev issues github setup [--check] [--dry-run] [--yes]`; recommended default board; drift report | medium |
| 9. Migration to GitHub | `adev issues migrate --to github`: ordered copy, `legacy_id`, sub-issue and dependency replay, rate-limit pacing, read-only marker on the source (format agreed with `agent-reliable-state-artifacts`) | large |
| 10. Untrusted-text rendering | `adev issues show/board/next/list` fence github bodies (`fenceBlock` from `lib/governance/context-pack.mjs`) and neutralize titles | small |
| 11. Conformance suite + fixtures | Shared contract cases run against json and github (replay transport), github-difference cases, manual fixture recorder script | large |
| 12. Docs | `docs/configuration.md` (`tasks.github.*`), `docs/troubleshooting.md` (every error code + remedy), `docs/concepts.md` (backends), backend-neutral ID wording in skill references | small |

## Visual Expectations

Not a UI feature. The only operator-facing output with a fixed shape is the `adev issues github setup` report: one line per required field or option (`ok` / `missing` / `wrong type`), followed by a drift section (one line per item, canonical ID first), followed by the planned changes when run without `--check`. Every `--json` variant emits the same information as a single JSON object.

## Acceptance Criteria

- [ ] `tasks.backend: github` returns a `GithubAdapter`; no code path returns a `JsonAdapter` when github is configured (BEH-1, BEH-3).
- [ ] Invalid `tasks.github.*` config throws `GITHUB_INVALID_CONFIG` at construction without any network call (BEH-2).
- [ ] Each preflight failure surfaces its named code with a remedy line, and the token never appears in any message or log (BEH-3, BEH-4).
- [ ] `parseId()` classifies home and cross-repo gh IDs before the legacy grammar; encode → decode round-trips for owner/repo names containing `-`, `.`, `_` and mixed case; the retro and session-capture validators accept canonical gh IDs and reject display forms (BEH-5, BEH-6, BEH-7).
- [ ] Field decoding matches the placement table, and a body containing a forged metadata block or `spec_ref:` text changes no decoded field (BEH-8, BEH-20).
- [ ] `list()` and `walkTree()` over a recorded 250-item board issue exactly `ceil(250/100)` item-page requests (plus sub-issue continuation pages only for items with more children than one page holds) (BEH-10, BEH-11).
- [ ] Status read mapping: closed issue → `closed`; empty Status → `open`; alias option → its status; `closed`-mapped option on an open issue → `open`; unmapped option → `GITHUB_UNMAPPED_STATUS` naming every offending ID, with no partial result (BEH-12).
- [ ] `create`/`update`/`close`/`addDependency` produce the recorded mutation sequence; closure guards raise `BLOCKED_BY_DEPENDENCIES` / `CASCADE_BLOCKED`; `planTask` raises `BOARD_GRANULARITY_VIOLATION`; no mutation ever touches assignees (BEH-13 – BEH-19).
- [ ] Claim race fixtures: (a) sequential competing claims → second gets `ISSUE_ALREADY_CLAIMED`; (b) interleaved writes where the other claimant's owner lands before our re-read → we throw `ISSUE_ALREADY_CLAIMED` and write nothing further; (c) the other claimant's owner lands after our first re-read but within the settle interval → we back off; (d) owner write fails after `claimed_at` write → item reads unclaimed and `claim` throws `GITHUB_WRITE_FAILED`; (e) stale lease → takeover succeeds (BEH-21 – BEH-25).
- [ ] `setup --check` never issues a mutation; `setup --dry-run` never issues a mutation; `setup` without `--yes` in a non-interactive context exits 1 with `SETUP_CONFIRMATION_REQUIRED`; `setup --yes` on an empty project creates exactly the recommended default board and fields; on a project with existing options it adds only missing ones and never deletes, renames, or clears (BEH-26 – BEH-28).
- [ ] Migration json → github and beads → github: hierarchy and dependencies recreated; `legacy_id` set on every migrated item; re-run after an interruption at any item creates no duplicates; `--dry-run` issues no mutation; source board refuses writes afterwards with `BOARD_READ_ONLY_MIGRATED`; `get(<old id>)` on github resolves to the migrated item (BEH-29 – BEH-34).
- [ ] Rate-limit and network fixtures map to `GITHUB_RATE_LIMITED` / `GITHUB_UNREACHABLE` with no partial result and no local fallback; migration pauses for resets up to 5 minutes and otherwise stops resumably (BEH-35, BEH-36).
- [ ] The conformance suite runs the same contract cases against json and github (replay), fails on any github request without a recorded response, and needs no network or token in CI (BEH-37).
- [ ] `adev issues show/board/next/list` fence github bodies and neutralize titles (BEH-20).
- [ ] Docs list every `tasks.github.*` key and every error code in the Error Cases table with its remedy (BEH-38).
- [ ] All quality gates pass (`npm test`); no constitutional violations; no new npm dependency.

## Preconditions

- `tasks.backend: github` and a `tasks.github` block are present in `.context-index/manifest.yaml`.
- The `gh` CLI is installed and authenticated (or `GH_TOKEN` is set) with the `repo` and `project` scopes, or an equivalent fine-grained / GitHub App token with issue read/write on `repo` and project read/write.
- The configured Projects v2 board exists and the home `repo` exists. Changing `tasks.github.repo` on a board that already has adev-managed items is unsupported: it would re-point every `gh-<n>` ID at a different repository's issues.
- For migration: the source board is readable, the target project passes `adev issues github setup --check` (including the `Legacy ID` field), and the operator has confirmed the run (or passed `--auto` where the existing verb allows it).
- The read-only marker format for the source board has been agreed with `agent-reliable-state-artifacts` (owner of `tasks.json`) before task 9 is implemented.

## Behaviors

<!-- retired-behavior-ids: (none) -->

### Configuration, registry, and preflight

- **BEH-1** — **When** `manifest.tasks.backend` is `"github"` **then** `getIssueManager()` returns a `GithubAdapter` whose `name` is `"github"`, and no failure on this backend — at construction or at first use — ever returns or delegates to a `JsonAdapter`; every failure surfaces as a thrown error with a named `code`.
- **BEH-2** — **When** the adapter is constructed **then** it validates `tasks.github` synchronously, without any network call, and throws `GITHUB_INVALID_CONFIG` naming the offending key if: `project` is not a Projects v2 URL of the form `https://github.com/orgs/<org>/projects/<n>` or `https://github.com/users/<user>/projects/<n>`; `repo` is not `<owner>/<repo>`; `status_map` (when present) does not cover all four adev statuses, or lists one option under two statuses; a `fields` override maps two adev fields to the same project field name. `status_map` values are a string or a non-empty list: the first entry is the option adev **writes** for that status, every entry is **read** as that status. When `status_map` is absent the recommended default board mapping applies: `open: [Backlog, Ready]`, `in_progress: [In Progress, In Review]`, `deferred: [Deferred]`, `closed: [Done]`.
- **BEH-3** — **When** the first board operation of a process runs **then** the adapter performs network preflight once and caches the result for the process: `gh` on `PATH` (`GITHUB_CLI_MISSING`), authenticated (`GITHUB_AUTH_REQUIRED`), token scopes include `repo` and `project` when `gh` reports scopes (`GITHUB_SCOPE_MISSING` naming each missing scope; tokens that report no scopes, such as fine-grained or App tokens, skip this check and permission failures surface later as `GITHUB_PERMISSION_DENIED`), the project resolves (`GITHUB_PROJECT_NOT_FOUND`), the home repo resolves (`GITHUB_REPO_NOT_FOUND`), every required field exists with the expected type (`GITHUB_FIELD_MISSING` naming the field and expected type), and every option named in `status_map` exists on the Status field (`GITHUB_STATUS_OPTION_MISSING`). Every preflight error message ends with the remedy, pointing at `adev issues github setup` where it applies.
- **BEH-4** — **When** the adapter authenticates **then** it relies solely on `gh`'s own credential resolution (including `GH_TOKEN`), never reads, stores, logs, or echoes a token, and records as `owner` only the identity the caller passes to `claim()` — never the authenticated `gh` login.

### Canonical IDs

- **BEH-5** — **When** an issue in the home `repo` is surfaced **then** its canonical ID is `gh-<n>`; **when** an issue from any other repository on the project is surfaced **then** its canonical ID is `gh-<owner>.<repo>.<n>`, with owner and repo lowercased (GitHub names are case-insensitive, so lowercasing loses no identity). The encoding is lossless because owner names cannot contain `.` and the number cannot either: decoding takes the owner before the first `.`, the number after the last `.`, and the repo as everything between (repo names may contain `.`, `-`, `_`). `parseId()` classifies any ID beginning `gh-` before consulting the legacy or tiered grammar, so a repo named `issue`, `epic`, or `bd` cannot produce a legacy-shaped ID, and `org1/api#3` and `org2/api#3` get distinct IDs. Adding a repository to the project never changes an existing ID.
- **BEH-6** — **When** an `IssueManager` method or `adev issues` verb receives `#<n>`, `<n>`, `<owner>/<repo>#<n>`, or a GitHub issue URL **then** it normalizes the input to the canonical ID before use; every ID the adapter **returns** is canonical, and `#<n>` / `<owner>/<repo>#<n>` appear only in human-facing rendering.
- **BEH-7** — **When** `lib/retro/issue-id-validation.mjs` or `lib/session-capture.mjs` validates an ID **then** canonical gh IDs (charset `[a-z0-9._-]`, up to 160 characters, `gh-` prefix) are accepted and display forms containing `#` or `/` are rejected, so session frontmatter and file names never carry a YAML comment marker or a path separator.

### Field placement and the read path

- **BEH-8** — **When** an item is read **then** fields decode from maintainer-only storage exactly as follows, and from nowhere else:

  | `Issue` field | GitHub source |
  |---|---|
  | `id` | canonical ID (BEH-5) |
  | `title`, `notes` | issue title and body (untrusted text, BEH-20) |
  | `status` | issue state + Status field (BEH-12) |
  | `priority` | Priority single-select (`P0`–`P4`) or a number field named by `tasks.github.priority_field`; else a `priority:<0-4>` label; else `2` |
  | `type` | issue type name, lowercased, where the owner has issue types; else a `type:<x>` label; else `"task"` |
  | Epic membership | issue type `Epic`, or the `epic` label where issue types are unavailable |
  | `parent_id` | canonical ID of the sub-issue parent |
  | `dependencies` | canonical IDs of blocked-by issues |
  | `owner`, `claimed_at`, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, `legacy_id` | Project text fields, default names `Owner`, `Claimed At`, `Next Action`, `Spec`, `Plan`, `Branch`, `PR`, `Legacy ID`, overridable per field via `tasks.github.fields` |
  | `affected_modules` | `module:<slug>` labels, including the reserved safety tags |
  | Epic `milestone` | the issue's repository milestone title |
  | `created`, `updated` | issue `createdAt`, `updatedAt` |

- **BEH-9** — **When** `listEpics()` is called **then** it returns the items whose Epic membership (BEH-8) holds, and `list()` excludes them exactly as the json adapter separates epics from issues.
- **BEH-10** — **When** `list(filters)` is called **then** the adapter reads the project's items with one paginated GraphQL query (100 items per page) that returns every field BEH-8 needs, so the number of requests grows with pages, not items; sub-issue and blocked-by connections longer than the first page are continued only for the items that need it. Draft issues and pull requests on the project are ignored. Filters are applied to the decoded items with the same semantics as the json adapter.
- **BEH-11** — **When** `walkTree(parentId)` is called with any github ID **then** it returns every transitive sub-issue of that item that is on the project, sorted by canonical ID, computed from the paged item data of BEH-10 rather than per-item requests. Sub-issues that are not on the project are not returned; `setup --check` reports them as drift (BEH-26).
- **BEH-12** — **When** an item's status is decoded **then**: a closed GitHub issue is `closed` regardless of its Status option; an open issue with no Status option is `open`; an open issue whose option is listed in `status_map` reads as that status, except that an option mapped to `closed` reads as `open` (issue state wins in both directions) and is reported as drift; an open issue whose option is not in `status_map` makes `get()` throw `GITHUB_UNMAPPED_STATUS` naming the ID and option, and makes `list()` / `walkTree()` throw the same code naming every offending ID — never a partial result.

### Write path

- **BEH-13** — **When** `create(item)` is called **then** the adapter creates the issue in the home `repo` (title, body = `notes`), adds it to the project, and sets Status to the write option for the requested status (default `open`), Priority, `next_action`, `spec_ref`, `planRef`, `branch`, `pr`, type (issue type or `type:` label), `module:` labels for `affected_modules`, the sub-issue parent for `parent_id`, blocked-by links for `dependencies`, and the milestone for an Epic's `milestone`; it returns the item as read back after the writes. A `parent_id` or dependency that does not resolve to an item on the project throws `PARENT_NOT_FOUND` / `NOT_FOUND` before the issue is created.
- **BEH-14** — **When** any step of `create()` fails after the GitHub issue exists **then** the adapter does not delete or close the issue; it throws `GITHUB_PARTIAL_CREATE` carrying the new canonical ID and the list of fields not yet written, so the caller can finish with `update()`.
- **BEH-15** — **When** `create()` or `update()` receives `planTask` **then** it throws `BOARD_GRANULARITY_VIOLATION` (the same code as the json adapter): plan-task state belongs to the lifecycle log, and the github backend has no field for it.
- **BEH-16** — **When** `update(id, changes)` is called **then** only the changed fields are written, one Project field mutation per changed field, batched as aliased mutations in a single request where possible; a change to `status: "closed"` follows `close()` semantics (BEH-17), and a change from `closed` to any other status reopens the GitHub issue and then writes the Status option.
- **BEH-17** — **When** `close(id, reason)` is called **then** the adapter refuses with `BLOCKED_BY_DEPENDENCIES` if any blocked-by issue is open, and with `CASCADE_BLOCKED` if any sub-issue on the project is open (the cascade guard applies to every github ID, unlike legacy flat IDs); otherwise it writes the `closed` Status option, closes the issue with state reason `COMPLETED`, and posts `reason`, when non-empty, as an issue comment. A person closing the issue in the GitHub UI bypasses these guards; the adapter reports the state it reads.
- **BEH-18** — **When** `addDependency(issueId, dependsOnId)` is called **then** it adds a GitHub blocked-by link (`issueId` blocked by `dependsOnId`); adding an existing link is a no-op, and a link GitHub rejects surfaces as `GITHUB_WRITE_FAILED` with GitHub's reason.
- **BEH-19** — **When** any adapter or verb writes to GitHub **then** it never reads or writes assignees, never edits the issue body unless the caller changed `notes`, and writes labels only in the adapter-owned families `type:`, `priority:` (fallback mode only), `epic` (fallback mode only), and `module:`; labels outside those families are never added or removed.
- **BEH-20** — **When** an item's title or body is read **then** no adev field is ever derived from either (a body containing a fenced metadata block or `spec_ref:` text changes nothing in BEH-8's decoding); **and when** `adev issues show`, `board`, `next`, or `list` renders a github item **then** the body is wrapped with `fenceBlock` from `lib/governance/context-pack.mjs` and the title is rendered on one line with control characters stripped and capped at 200 characters, because both are editable by whoever filed the issue.

### Claims

- **BEH-21** — **When** `claim(id, owner, opts)` is called **then** the adapter re-reads the item, applies `requireClaimable()` with the adapter's `claimTtlMinutes` (refusing with `ISSUE_CLOSED` / `ISSUE_ALREADY_CLAIMED` exactly as the json adapter does), then writes `claimed_at` (a fresh timestamp, or the existing one on an idempotent re-claim inside a live lease) and then `owner`, as two aliased mutations in that order in one request.
- **BEH-22** — **When** the claim writes complete **then** the adapter re-reads `owner`; if it is not the claimant, the adapter writes nothing further and throws `ISSUE_ALREADY_CLAIMED` carrying the winner's `owner` and `claimed_at`. If it is the claimant, the adapter waits the settle interval (`tasks.github.claim_settle_ms`, default 1500) and re-reads once more, backing off the same way if `owner` changed. Only after the second re-read confirms the claim does it write `branch` / `pr` from `opts`. The residual window — two claimants both confirmed — requires one claimant's precondition read to land before the other's write and its write to land after the other's settle re-read; this is documented in `docs/concepts.md`, and callers that need a strict lock are told to use one.
- **BEH-23** — **When** the `owner` write fails after the `claimed_at` write succeeded **then** the item reads as unclaimed (a `claimed_at` without `owner` grants nothing) and `claim()` throws `GITHUB_WRITE_FAILED`; by construction adev never leaves an `owner` without a `claimed_at`, which `isClaimUnexpirable()` would treat as a lease that never expires.
- **BEH-24** — **When** `release(id, owner, opts)` is called **then** it applies `requireReleasable()` (honouring `opts.force`) and clears `owner` first, then `claimed_at`, so an interruption leaves the item unclaimed; `branch` and `pr` are left in place, as on the json backend.
- **BEH-25** — **When** a claim or release completes **then** the Status field is unchanged — the github backend follows the json adapter, where callers move status explicitly via `update()` — and the stale-claim lease rules (`tasks.claim_ttl_minutes`, `adev issues stale`) apply unchanged on top of `claimed_at`.

### Project setup

- **BEH-26** — **When** `adev issues github setup --check` runs **then** it issues no mutation, prints each required field and option as `ok` / `missing` / `wrong type`, and prints drift: open issues in a `closed`-mapped column, open issues in unmapped columns, sub-issues of board items that are not on the project, and items with `owner` but no `claimed_at`. It exits 0 when every required field and option is present with the right type (drift alone is a warning) and 1 otherwise; `--json` emits the same report as one object.
- **BEH-27** — **When** `adev issues github setup` runs without `--check` **then** it prints the changes it would make — missing text fields, the Status options and Priority options `P0`–`P4` of the recommended default board — and applies them only after interactive confirmation or `--yes`; with `--dry-run` it prints the plan and exits 0 without writing; in a non-interactive context without `--yes` it exits 1 with `SETUP_CONFIRMATION_REQUIRED`. It never deletes or renames a field or option and never clears an item's value; where adding an option to an existing single-select field cannot be done without replacing that field's option set in a way that could clear item values, it skips that change and prints the manual step instead. Suggested views are printed as documentation, not created.
- **BEH-28** — **When** setup cannot reach the project or lacks permission **then** it fails with the same preflight codes as BEH-3 and writes nothing.

### Migration to GitHub

- **BEH-29** — **When** `adev issues migrate --to github` runs from a `json`, `beads`, or read-only `file` source **then** it first requires preflight and `setup --check` to pass on the target (exit 1 with `GITHUB_FIELD_MISSING` naming `Legacy ID` or any other missing field), then creates in-scope items in the home repo parents-before-children, writing every field BEH-13 writes plus `Legacy ID` = the source ID, then replays sub-issue parents and dependencies by mapping source IDs to new canonical IDs through `legacy_id`. With `--include-closed`, closed items are created and then closed (`closed` Status option, state reason `COMPLETED`) without posting a close comment.
- **BEH-30** — **When** the verb is re-run, including after an interruption at any item **then** it reads `legacy_id` from the target board first and skips every source item already present, and skips every parent or dependency link already present, so no item or link is ever duplicated; the target board is the idempotency source of truth, and title matching is never used for a github target.
- **BEH-31** — **When** `--dry-run` is passed **then** the verb prints the items it would create, the items already migrated, the links it would replay, and an estimate of API requests, and issues no mutation.
- **BEH-32** — **When** a migration completes without errors **then** the verb marks the source board read-only (marker location and format as agreed with `agent-reliable-state-artifacts`, naming the target project and the time), prints the old-ID → new-ID summary, and prompts before flipping `tasks.backend` in `manifest.yaml`, exactly as the existing verb does — it never writes the manifest without confirmation.
- **BEH-33** — **When** a write is attempted through the json or beads adapter on a board carrying the read-only marker **then** it throws `BOARD_READ_ONLY_MIGRATED` naming the target project; reads are unaffected, and re-running `migrate --to github` against the same source is still allowed because it only reads the source.
- **BEH-34** — **When** a github-backend method receives an ID that is not a gh ID (a legacy flat, tiered, or beads ID) **then** the adapter resolves it through the `legacy_id` values of the paged board read (cached for the process) and operates on the matching item, returning it with its canonical ID and `legacy_id`; an unmatched old ID throws `NOT_FOUND`.

### Rate limits and network

- **BEH-35** — **When** GitHub answers with a primary or secondary rate limit **then** `get`, `list`, `walkTree`, and every write throw `GITHUB_RATE_LIMITED` carrying the reset time, with no partial result and no automatic retry; the migration verb alone waits for the reset when it is at most 5 minutes away and otherwise stops, leaving a state the next run resumes via BEH-30.
- **BEH-36** — **When** `gh` times out or GitHub is unreachable **then** the operation throws `GITHUB_UNREACHABLE`; nothing falls back to a local board and nothing is queued for later.

### Conformance and docs

- **BEH-37** — **When** the test suite runs **then** a shared conformance suite under `tests/issues/conformance/` runs the same `IssueManager` contract cases against the json adapter and the github adapter, the latter through a replay transport injected in place of `execFileSync` that serves recorded GraphQL responses keyed by query and variables; any github request without a recorded response fails the test, so CI needs no network or token. github-only differences (ID shape, sub-issue `walkTree`, status read mapping, UI-bypassable closure guards, non-linearizable claims) are asserted in a separate case set. Fixtures are recorded by a manual script under `scripts/` against a throwaway project and committed with tokens and personal identifiers scrubbed.
- **BEH-38** — **When** the feature ships **then** `docs/configuration.md` documents every `tasks.github.*` key with its default, `docs/troubleshooting.md` documents every error code in the Error Cases table with its remedy, and `docs/concepts.md` documents the backend differences and the claim window; skill reference prose that uses dotted IDs as the only example is reworded to be backend-neutral.

## Postconditions

- On `tasks.backend: github`, every `IssueManager` read reflects the GitHub project's current state and every write is visible to every clone, worktree, and CI job without a git operation.
- adev has written no assignee, no label outside its own families, and no body text the caller did not supply.
- After a confirmed claim, the item carries `owner` and `claimed_at`; after release, it carries neither; no adev operation leaves `owner` without `claimed_at`.
- After a successful migration, every in-scope source item exists exactly once on the project with `legacy_id` set, hierarchy and dependencies are recreated, the source board is read-only, and the manifest is unchanged unless the operator confirmed the flip.
- The json, file, and beads backends behave exactly as before, apart from refusing writes to a board migrated to GitHub.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `tasks.github` missing a key, malformed URL or repo, incomplete or overlapping `status_map`, colliding `fields` overrides | Throw at construction, naming the key; no network call | `GITHUB_INVALID_CONFIG` |
| `gh` not on `PATH` | Throw on first operation; remedy names the install page | `GITHUB_CLI_MISSING` |
| `gh` not authenticated and no `GH_TOKEN` | Throw; remedy `gh auth login` / set `GH_TOKEN` | `GITHUB_AUTH_REQUIRED` |
| Token reports scopes and lacks `repo` or `project` | Throw naming each missing scope; remedy `gh auth refresh -s project` | `GITHUB_SCOPE_MISSING` |
| GitHub refuses an operation for lack of permission | Throw with the operation and GitHub's message, token redacted | `GITHUB_PERMISSION_DENIED` |
| Project URL does not resolve | Throw naming the URL | `GITHUB_PROJECT_NOT_FOUND` |
| Home repo does not resolve | Throw naming `owner/repo` | `GITHUB_REPO_NOT_FOUND` |
| Required project field absent or of the wrong type | Throw naming field and expected type; remedy `adev issues github setup` | `GITHUB_FIELD_MISSING` |
| `status_map` names an option the Status field lacks | Throw naming the option; remedy `adev issues github setup` | `GITHUB_STATUS_OPTION_MISSING` |
| Open issue on a Status option not in `status_map` | `get` throws naming ID and option; `list`/`walkTree` throw naming every offending ID; no partial result | `GITHUB_UNMAPPED_STATUS` |
| ID input that is neither canonical, display form, nor a resolvable old ID | Throw naming the input | `GITHUB_INVALID_ID` |
| ID or old ID not found on the project | Throw | `NOT_FOUND` |
| `parent_id` not on the project | Throw before creating anything | `PARENT_NOT_FOUND` |
| `planTask` passed to `create`/`update` | Throw | `BOARD_GRANULARITY_VIOLATION` |
| Write step fails after the issue was created | Keep the issue; throw with the new ID and unwritten fields | `GITHUB_PARTIAL_CREATE` |
| Any other GitHub mutation rejected (including the `owner` write of a claim) | Throw with GitHub's reason | `GITHUB_WRITE_FAILED` |
| `close` with an open blocked-by issue | Refuse; no write | `BLOCKED_BY_DEPENDENCIES` |
| `close` with an open sub-issue on the project | Refuse; no write | `CASCADE_BLOCKED` |
| `claim` on a closed issue | Refuse; no write | `ISSUE_CLOSED` |
| `claim` on a live lease held by another owner, or a lost claim race | Refuse; carry winner's `owner` and `claimed_at`; nothing further written | `ISSUE_ALREADY_CLAIMED` |
| `release` by a non-holder without `force` | Refuse; no write | `CLAIM_OWNER_MISMATCH` |
| Primary or secondary rate limit | Throw with reset time; no partial result (migration: wait ≤ 5 min, else stop resumably) | `GITHUB_RATE_LIMITED` |
| `gh` timeout or network failure | Throw; no local fallback, nothing queued | `GITHUB_UNREACHABLE` |
| `setup` applying changes non-interactively without `--yes` | Exit 1 before any write | `SETUP_CONFIRMATION_REQUIRED` |
| Write to a json/beads board carrying the migration read-only marker | Throw naming the target project; reads unaffected | `BOARD_READ_ONLY_MIGRATED` |
