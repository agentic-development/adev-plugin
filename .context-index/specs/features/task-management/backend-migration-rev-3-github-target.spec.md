---
charter: task-management
kind: action
status: review-pending
risk_level: high
revision: 2
charter-revision: 10
amends: .context-index/specs/features/task-management/backend-migration.spec.md
target-revision: 3
created: 2026-11-26
updated: 2026-11-26
tracker-ref: agentic-development/adev-plugin#441
---

# Amendment: Live Spec: Backend Migration (targeting rev 3)

> This spec **amends** `.context-index/specs/features/task-management/backend-migration.spec.md` targeting revision 3.
> The base spec is immutable; this artifact carries the delta and is
> reviewed, planned, and validated on its own lifecycle.

## Amendment Rationale

Task-management charter revision 10 adds the github board backend. `github-board-backend.spec.md` (revision 2, review-passed) defines how a migration into a GitHub Projects v2 board behaves, in GitHub spec BEH-29 to BEH-35 and BEH-41. That spec's Actionable Task Map (task 14) and its plan's prerequisites table make an amendment of this spec a prerequisite of plan tasks 18 and 19. The verb's current contract still rules github out in four places:

- The base Error Cases and Procedure Step 1 limit `--to` to `{json, beads, file}`.
- `parseArgs()` rejects unknown flags, so `--yes` cannot be passed (review RI-5).
- Base Behaviors 11, 17 and 18 and the Idempotency section make `.migrate-state.json` the resume source of truth.
- The base never says whether a github abort keeps the `MIGRATE_PARTIAL_FAILURE` envelope, or how ADR 0014's verbatim stderr passthrough fits the github spec's "token redacted" promise (review CON-1).

The registry change has already landed (commit abf7bf52), so `github` is in `SUPPORTED_BACKENDS`. Until this amendment is implemented, `lib/cli/issues-migrate.mjs` refuses both directions with `MIGRATE_GITHUB_UNAVAILABLE`.

**This amendment is deliberately thin.** It changes only the migrate verb's own contract: the argument surface, dispatch, the confirmation gate, resume ownership, the abort envelope, dry-run and success output, and the manifest rule. Where the github spec defines what the github path does, this amendment cites it by number ("GitHub spec BEH-n") and does not restate it. Unprefixed `BEH-n` IDs below are this amendment's own, and "base Behavior n" means the base spec's numbered behaviors.

## Behavioral Delta

<!-- retired-behavior-ids: (none) -->

The json and beads migration paths are unchanged. Every run whose target is not `github` is still governed by:

- base Behaviors 1–27;
- the base Idempotency, Rollback, Dry-Run Output Shape and Live-Run Output Shape sections;
- ADR 0014.

For a github target, base Behaviors 1–4, 8, 12, 14 and 19 apply unchanged. Base Behaviors 9–11, 13 and 15–18 are replaced by the behaviors below and the GitHub spec behaviors they cite. Base Behavior 7 does not apply.

### Argument surface and dispatch

- **BEH-1** — **When** `adev issues migrate --to github` runs and the resolved source (base Behaviors 1–2) is `json`, `beads` or `file` **then** `github` is accepted and the verb dispatches to the github migration path.
  - **Validation:** `--to` is checked against `SUPPORTED_BACKENDS` from `lib/issues/registry.mjs`. The verb's validation code holds no literal list of backends, and the `MIGRATE_UNKNOWN_BACKEND` message lists every entry of `SUPPORTED_BACKENDS`, `github` included.
  - **The github path:** defined by GitHub spec BEH-29. In order: the pre-write checks (BEH-5 lists them in order), confirmation (BEH-3 below), an ordered sequential copy that writes `Legacy ID`, then replay of parents and dependencies after every item exists. It stops on the first per-item failure.
  - **Removed refusal:** `MIGRATE_GITHUB_UNAVAILABLE` no longer fires for a github target.
  - **Base wording updated:** the base Error Cases row "`--to` value not in `{json, beads, file}`" now reads "`--to` value not in `SUPPORTED_BACKENDS`". The validation bullet in base Procedure Step 1 now reads "Validate `--to` ∈ `SUPPORTED_BACKENDS`".
- **BEH-2** — **When** the resolved source is `github` (`--from github`, or `tasks.backend: github` with no `--from`) and the target is not `github` **then** the verb exits 1 with `MIGRATE_GITHUB_UNAVAILABLE`. It does so before it constructs an adapter or reads or writes any state. Migration out of a GitHub board is out of scope. **When** both source and target are `github` **then** base Behavior 3 applies (`MIGRATE_NOOP`), and that check runs before this refusal.
- **BEH-3** — **When** the verb parses its arguments **then** it accepts `--yes` as a boolean flag that takes no value, and `help()` lists it as "Confirm a github migration's write set without prompting." `--yes` has no effect on json or beads targets, which have no confirmation step. For a github target, confirmation follows GitHub spec BEH-41, with these verb-level rules:
  - **What counts as interactive:** a run is interactive only when stdin is a TTY and `--auto` is absent. Every other run is non-interactive.
  - **What counts as a write:** every GitHub mutation, and creating the read-only sentinel (BEH-8). Creating the sentinel retires the source board, so it needs the same consent as a GitHub mutation even though it is a local file. Writing or removing `.migrate-state.json` is bookkeeping and is never asked about on its own.
  - **When the write set is printed:** once, to stderr, after every pre-write check in BEH-5 passes and before the first write. Its content is defined by GitHub spec BEH-41, plus one verb-level line about the sentinel: the path it will create and, for a beads source, that the verb will commit that one file on `beads-board` (BEH-8). When the sentinel already exists for this project (BEH-12), the line says it is present and will be left unchanged.
  - **Interactive runs:** the verb prompts on stderr and reads one line from stdin. `y` or `yes` (trimmed, case-insensitive) proceeds. Any other answer, or EOF, exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`, with no GitHub mutation and no local write.
  - **Non-interactive runs without `--yes`:** when the run has any write to make, the verb exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` before any GitHub mutation and before writing `.migrate-state.json` or the sentinel. The message names `--yes` as the remedy.
  - **Where `--yes` comes from:** argv only. It is never read from `manifest.yaml`, the environment or `.migrate-state.json`. It is not recorded in `.migrate-state.json` and is not part of `scope_args`, so passing or omitting it is never a resume mismatch. `--auto` does not imply it.
  - **Nothing left to do, sentinel present:** when the target-board read shows that every in-scope item and every parent and dependency link is already present, **and** the sentinel already exists and names this project (BEH-12), the run has no write to make. It needs no confirmation and prints no prompt, even when it is non-interactive and has no `--yes`. The verb goes straight to the success path (BEH-8), which leaves the sentinel byte-identical. For a beads source whose sentinel is not yet committed, that success path also commits it: the consent was given by the run that created the file.
  - **Nothing left to do, sentinel absent:** when every in-scope item and link is already present but the sentinel does not exist, the run still has one write to make, so it still needs confirmation. The write set shows zero items and zero links to create and names the sentinel. A non-interactive run without `--yes` exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` and writes nothing. An interactive run that is declined does the same.
  - **Dry runs:** `--dry-run` never asks for confirmation (BEH-7).

### Resume ownership

- **BEH-4** — **When** the target is `github` **then** the target board's `legacy_id` values are the idempotency and resume source of truth (GitHub spec BEH-30). The verb walks the in-scope items from index 0 and skips each item and link that the target already holds. Title matching is never used.

  `.context-index/tasks/.migrate-state.json` is kept on the github path for two jobs: the resume-argument checks and the resume progress line. It decides nothing else.
  - **Schema and writes:** it keeps its existing schema `{ source, target, last_successful_index, scope_args }`. It is still written by atomic temp-rename after each successful item, and still removed on success.
  - **Resume-argument checks that exist today:** these run at the start of every run, in `loadResumeState()` in `lib/cli/issues-migrate.mjs`. The base spec names neither code, so the implementation is the reference. An unparseable file exits 1 with `MIGRATE_RESUME_INVALID`. A file whose `source` or `target` differs from the current run exits 1 with `MIGRATE_RESUME_MISMATCH`.
  - **New refusal for a github target, scope mismatch:** when the state file's `scope_args.includeClosed` differs from whether the current run passes `--include-closed`, the verb exits 1 with `MIGRATE_RESUME_MISMATCH`. The message names both values and gives two remedies: re-run with the recorded scope, or delete the state file. The refusal happens before preflight, before any GitHub mutation and before any local write. On a github target, a state file whose `scope_args.includeClosed` is missing or not a boolean exits 1 with `MIGRATE_RESUME_INVALID`. **This is new behavior, not an existing check.** Today `loadResumeState()` handles a scope mismatch by printing a `warning:` line to stderr and continuing. The refusal exists because the scope decides which closed items are published to GitHub, and the operator confirmed a specific set on the earlier run.
  - **json and beads targets keep today's warn-and-continue** on a scope mismatch, unchanged by this amendment. The base Idempotency section says a scope mismatch is refused, but the code has never refused it. Notes for Planning records that discrepancy, and this amendment does not resolve it.
  - **Reader of `last_successful_index` — the resume progress line:** when a state file exists and passes every check above, the verb prints `resuming: N of M already migrated` on stderr after the target-board read succeeds. N is `last_successful_index + 1` and M is the number of in-scope source items. As a cross-check, the verb then counts B, the in-scope source items whose ID appears as a `legacy_id` on the target board. When B ≠ N it prints one more stderr line, `warning: .migrate-state.json records N of M migrated but the target board holds B; the target board decides what is skipped`, and continues. This is a warning, never a failure. Both lines come before the write-set disclosure (BEH-3). They are also printed on `--dry-run`, which reads the state file but never writes it. With no state file there is no line.
  - **The index never decides what is skipped.** A re-run with a valid state file and a re-run with no state file issue the same sequence of GitHub mutations. The progress line is the only output that differs. Deleting the file changes nothing a re-run writes.

  **When** the target is `json` or `beads` **then** base Behaviors 11, 17 and 18 and the base Idempotency section apply unchanged.

- **BEH-11** — **When** the github path has read the source board and the target board **then**, before confirmation and before any write, it checks where every `legacy_id` on the target came from. **Chosen rule:** refuse whenever the target board shows a `legacy_id` that cannot have come from this source board, and rely on confirmation where provenance cannot be determined.
  - **The source ID set:** every item and epic ID on the source board, in every status. It does not depend on `--include-closed`.
  - **Duplicate values:** a `legacy_id` held by more than one target item exits 1 with `GITHUB_AMBIGUOUS_LEGACY_ID` naming the items (GitHub spec Error Cases).
  - **Foreign values:** a non-empty `legacy_id` on the target that is not in the source ID set exits 1 with `MIGRATE_TARGET_FOREIGN_LEGACY_ID`. The message names up to 10 of the foreign values, gives the total count, and says that each source board must be migrated into its own project, because adev never merges two boards into one project. An item deleted from the source board after a partial migration also makes its `legacy_id` foreign. That case is refused too, and the operator resolves it by hand.
  - **Empty values:** target items with an empty `legacy_id`, such as items created directly on GitHub, are ignored.
  - **The case `legacy_id` cannot detect:** suppose another board with colliding IDs (for example flat `issue-1`, `issue-2`) was migrated into the same project, and the target's `legacy_id` values all fall inside this board's ID set. `legacy_id` alone cannot tell the two boards apart. `Legacy ID` holds only the source ID (GitHub spec BEH-29), and this amendment does not change its format. Confirmation limits the damage. Such a run finds items "already present" while this board has no sentinel, so BEH-3 requires confirmation, and the write set's already-migrated count shows the operator that a run they think is the first already finds items present.

### Abort envelope

- **BEH-5** — **When** the github path runs **then** its pre-write checks run in this order. Each one either passes or stops the run before any write:
  1. the github-source refusal (BEH-2);
  2. the resume-argument checks (BEH-4): `MIGRATE_RESUME_INVALID`, and `MIGRATE_RESUME_MISMATCH` for a source, target or scope mismatch;
  3. preflight (every code in GitHub spec BEH-3), then the `setup --check` gate (`GITHUB_FIELD_MISSING`);
  4. the source-board read and the target-board read (any `GITHUB_*` error);
  5. `legacy_id` provenance (BEH-11): `GITHUB_AMBIGUOUS_LEGACY_ID`, `MIGRATE_TARGET_FOREIGN_LEGACY_ID`;
  6. the existing-sentinel identity and path checks (BEH-12): `MIGRATE_SENTINEL_PROJECT_MISMATCH`, `SENTINEL_PATH_UNSAFE`;
  7. the resume progress line (BEH-4), which prints and never stops the run;
  8. confirmation (BEH-3): `MIGRATE_CONFIRMATION_REQUIRED`.

  **When** any of steps 1–6 or 8 fails **then** the verb prints the failing code and its message on stderr and exits 1. It emits no envelope. It makes no GitHub mutation, writes no sentinel, and neither writes nor removes `.migrate-state.json`, so a file left by an earlier run stays as it was.

  **When** the github path stops after confirmation, or after the nothing-left-to-do decision, **then** the verb writes `.migrate-state.json` (BEH-4) and emits the existing `MIGRATE_PARTIAL_FAILURE` envelope. That envelope is kept, not replaced by a top-level `GITHUB_*` code.

  The stops this covers:
  - a per-item failure listed in GitHub spec BEH-29 (`GITHUB_WRITE_FAILED`, `GITHUB_PARTIAL_CREATE`, `GITHUB_INVALID_FIELD_VALUE`);
  - `GITHUB_RATE_LIMITED` beyond the bounds in GitHub spec BEH-35;
  - any other `GITHUB_*` error raised while writing, such as `GITHUB_UNREACHABLE` or `GITHUB_PERMISSION_DENIED`.

  What the envelope contains:
  - **stdout:** one JSON report in the base Live-Run Output Shape, with `manifest_update_suggested: false`. `errors[]` holds one entry `{ source_id, code, message }`, where `code` is the `GITHUB_*` code and `source_id` is the failing source item's ID. A `GITHUB_PARTIAL_CREATE` entry also carries `target_id` (the new canonical ID) and `unwritten_fields`. A `GITHUB_RATE_LIMITED` entry also carries `reset_at`.
  - **Key mapping:** the envelope uses snake_case and the error objects use camelCase. `reset_at` is the error's `resetAt` property (`lib/issues/github/transport.mjs`). `target_id` and `unwritten_fields` are the canonical-ID and unwritten-fields properties of `GITHUB_PARTIAL_CREATE`, under the names plan Task 11 gives them.
  - **stderr:** one line that starts with `MIGRATE_PARTIAL_FAILURE:` and names the `GITHUB_*` code and the source ID.
  - **exit:** 1.

  Sentinel write and commit failures (BEH-8) happen after every item and link exists. They are not per-item stops, so they use their own codes and not this envelope.

  **Who consumes the envelope:** the operator, directly or through the agent session that ran the verb. No adev verb, skill or hook parses `errors[]`, and a re-run never reads an earlier run's stdout. `target_id` tells the operator which GitHub issue is partial. The next run does not read it: it finds that item by `legacy_id` and finishes it (GitHub spec BEH-14, BEH-30).
- **BEH-6** — **When** the github path writes any message to stdout or stderr **then** it redacts the message first. This applies to `errors[].message`, every stderr line, the write-set disclosure, the progress lines, and the dry-run and success reports.

  **Where redaction happens:** the github path's two output sinks are the `log` seam for stdout (BEH-10) and its stderr writer. Every string reaches them through one call, `redact()` from `lib/issues/github/errors.mjs`.

  Redaction replaces each of the following with `[REDACTED]`:
  - (a) the exact value of the `GH_TOKEN` or `GITHUB_TOKEN` environment variable, when it is set and at least 8 characters long. That is `redact()`'s existing `MIN_LITERAL_SECRET_LENGTH`. A shorter value is not a GitHub token, and scrubbing it would damage ordinary text.
  - (b) every match of `/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g`, which are `redact()`'s existing `TOKEN_PATTERNS`;
  - (c) the credential that follows `Authorization:` in every match of `/authorization:\s*(?:bearer|token)\s+\S+/gi`. This pattern is added to `redact()` and does not exist there today.

  Nothing else changes: no path scrubbing and no truncation. The verb redacts even when the adapter already has, as defense in depth.

  **This is a scoped exception to ADR 0014, recorded in ADR 0014 itself** (2026-11-26 note). ADR 0014's decision and rationale cover `br` stderr on the json and beads paths, where "there is no transport boundary … that would call for an additional redaction layer". The github path adds a network transport that carries credentials. Apart from token-like material, ADR 0014's verbatim policy still applies to the github path, and it is unchanged for json and beads targets.

### Dry-run and success output

- **BEH-7** — **When** `--dry-run --to github` runs **then** the verb issues no GitHub mutation (GitHub spec BEH-31), writes neither `.migrate-state.json` nor the sentinel, makes no git commit, and asks for no confirmation.
  - **Checks it still performs:** pre-write checks 1–7 of BEH-5, which include preflight, the `setup --check` gate, both board reads, `legacy_id` provenance, the existing-sentinel checks and the resume progress line. They are all read-only, and a failure exits 1 per BEH-5.
  - **Report:** one JSON report on stdout, then exit 0. The report keeps every key of the base Dry-Run Output Shape, with `already_migrated` counted by `legacy_id`, and adds this `github` object:

    ```json
    "github": {
      "project": "<Projects v2 URL>",
      "repository": "<owner>/<repo>",
      "visibility": { "project": "public|private", "repository": "public|private" },
      "would_create_ids": ["<source id>", "..."],
      "parent_links_to_replay": 0,
      "would_publish": { "titles": 0, "notes": 0 },
      "estimated_requests": 0
    }
    ```

  The json and beads dry-run shapes are unchanged. The consumer of the `github` object is the operator, who reads it before a live run. No adev code parses it.
- **BEH-8** — **When** a github migration finishes with every in-scope item and link present and no error **then** the verb does the following, in order:
  1. **Writes the read-only sentinel for the source board** (GitHub spec BEH-32).
     - **Writer:** `writeSentinel(storageRoot, backend, { project })` in `lib/issues/read-only-sentinel.mjs`, which plan Task 14 creates. `storageRoot` is `resolveStorageRoot(manifest, projectRoot)` (BEH-12), the same root the source adapter reads.
     - **Owned by `agent-reliable-state-artifacts` charter revision 9** ("Read-only board sentinel document schema"): the path, the five-key content, the atomic temp-rename write, the containment check and the `SENTINEL_PATH_UNSAFE` refusal.
     - **Path:** `.context-index/tasks/board-read-only.json` for a json or file source; `.beads/adev-read-only.json` for a beads source. Both are relative to the storage root.
     - **No read-modify-write:** no existing board file is changed to create the sentinel.
     - **Sentinel already present:** BEH-12 has already checked that it names this project. It is left byte-identical, and the stderr summary reports it as pre-existing along with the project it records.
     - **Write fails:** the verb exits 1 with `SENTINEL_PATH_UNSAFE` or the I/O error's code, and prints no success report. The GitHub items are kept and `.migrate-state.json` is kept. Because the sentinel is still absent, a re-run needs confirmation before it writes the sentinel (BEH-3).
  2. **Commits the sentinel, for a beads source only.** The verb commits exactly one file, `.beads/adev-read-only.json`, on the `beads-board` checkout. Charter revision 9 requires this: the beads sentinel is "never left local-only".
     - **Mechanism:** `commitSentinel(storageRoot)` in `lib/issues/read-only-sentinel.mjs`. It runs git as an argv array through `execFileSync("git", …)` with `cwd` set to `<storageRoot>/.beads`, the same git mechanism `lib/issues/board-worktree.mjs` uses for the `.beads/` linked worktree. No board-sync helper exists to reuse, because the `beads-board-direct-sync` spec has not been written.
     - **Steps:**
       1. Check that `.beads/` is a git worktree whose current branch (`git rev-parse --abbrev-ref HEAD`) is `beads-board`.
       2. When `git status --porcelain -- adev-read-only.json` is empty, the file is already committed and there is nothing to do.
       3. Otherwise run `git add -- adev-read-only.json`.
       4. Then run `git commit -m "chore(issues): retire beads board, migrated to GitHub" -- adev-read-only.json`. The pathspec limits the commit to that one file, so nothing else staged in `.beads/` is committed.
     - **What it never does:** it never passes `--no-verify` and never pushes. Pushing `beads-board` stays part of the operator's normal board sync.
     - **Commit fails:** this covers `.beads/` not being a linked worktree, a branch other than `beads-board`, a git error, and a refusing hook. The verb exits 1 with `MIGRATE_SENTINEL_COMMIT_FAILED` and prints no success report. The message names the absolute sentinel path and the branch, and says to commit that one file there by hand. The sentinel and `.migrate-state.json` are kept. A re-run finds the sentinel present, needs no confirmation (BEH-3) and tries the commit again.
     - **json or file source:** the verb makes no commit. The sentinel lands in the storage root's working tree. When the verb runs from a linked worktree of the main repo, that is the main checkout (BEH-12). The operator commits it on the branch that carries the board, the same way changes to `tasks.json` are committed today: no adev adapter commits `tasks.json` either. This is charter revision 9's json/file rule ("Committed on the branch that carries the board, like `tasks.json`").
  3. **Prints one JSON report on stdout.** It uses the base Live-Run Output Shape (`errors: []`, `manifest_update_suggested: true`) and adds `"github": { "project": "<URL>", "sentinel_path": "<repo-relative path>", "id_map": { "<source id>": "<canonical gh id>" } }`. `id_map` covers every in-scope item, whether this run created it or found it by `legacy_id`. The consumer is the operator, who uses `id_map` to update references to old IDs by hand. No adev code reads it.
  4. **Prints three things to stderr, in this order:**
     - the old-ID → new-ID summary, one `<source id> → <gh id>` line per item;
     - one line about the sentinel. For a json or file source it names the path and says to commit it on the branch that carries the board. For a beads source it names the path, says it was committed on `beads-board` (or was already committed), and says to push it with the next board sync;
     - the existing `manifestUpdateSuggestion("github")` text, as the last stderr line.
  5. **Removes `.migrate-state.json` and exits 0.**

  The beads sentinel commit is the verb's only git commit. The verb never pushes, and it never writes `manifest.yaml`, with or without `--auto` (base Behavior 19, GitHub spec BEH-32).

- **BEH-12** — **When** the github path runs, live or dry-run, **then** before confirmation and before any write it resolves the sentinel root and checks any sentinel already there.
  - **Root:** `resolveStorageRoot(manifest, projectRoot)` from `lib/issues/resolve-root.mjs`. That is `tasks.db_path` when set. Otherwise it is the main repository's working copy, found through `git rev-parse --git-common-dir`. A run started from a linked worktree of the main repo therefore reads and writes the main checkout's sentinel, never the worktree's own copy.
  - **Under a linked `.beads/` worktree:** in the beads-board topology, `.beads/` is a linked worktree of `beads-board` inside that root. So `<root>/.beads/adev-read-only.json` lies inside the `beads-board` checkout, where BEH-8 commits it. Containment is checked against `safeRealpath(root)`. A `.beads` that is a symlink resolving outside the root fails containment with `SENTINEL_PATH_UNSAFE`. So does a symlink at the sentinel path itself.
  - **Existing sentinel:** read with `readSentinel()` from `lib/issues/read-only-sentinel.mjs`.
    - Absent: the run continues.
    - Present, with `project` byte-equal to the project URL this run would record: the run continues, and BEH-8 leaves the file unchanged.
    - Present but naming a different project, or unparseable, or with an unknown `schema` (`{ malformed: true }`): the run exits 1 with `MIGRATE_SENTINEL_PROJECT_MISMATCH` before any write. The message names the recorded project, or says the sentinel is unreadable, and names the target project. It says the board is already retired, and that only removing the sentinel by hand un-retires it (charter revision 9).

### Pacing

- **BEH-9** — **When** the github path issues mutations or hits a rate limit **then** its pacing, waits and wait bounds are exactly those of GitHub spec BEH-35. A stop beyond those bounds uses the BEH-5 envelope.

### Test seams

- **BEH-10** — **When** `run()` in `lib/cli/issues-migrate.mjs` is called **then** it accepts six optional injected dependencies. Each has a production default:

  | Seam | What it is | Production default | Who receives it |
  |------|------------|--------------------|-----------------|
  | `exec` | the `gh` spawn the github transport uses | the real spawn | the target `GithubAdapter`'s transport |
  | `isTTY` | whether stdin is a TTY | `process.stdin.isTTY` | the confirmation step |
  | `readLine` | the source of the confirmation answer | a stdin line reader | the confirmation step |
  | `sleep` | the pacing delay | a `setTimeout`-based sleep | `migrateToGithub()` and the target `GithubAdapter` |
  | `now` | the clock | `Date.now` | `migrateToGithub()` and the target `GithubAdapter` |
  | `log` | the stdout sink for the single JSON report | `console.log` | `run()`'s report output on every path |

  **How the seams reach the adapter:**
  - **Into the migration module:** `run()` passes `exec`, `sleep` and `now` to `migrateToGithub()` in `lib/issues/github/migrate.mjs`, a module that plan Task 18 creates.
  - **Into the adapter:** `migrateToGithub()` builds the target adapter directly as `new GithubAdapter(storageRoot, manifest, { exec, now, sleep })`. It does not go through `getIssueManager()`, because the registry factory takes no seams. Preflight, the `setup --check` gate, the target-board read and every mutation all go through that adapter's transport, so an injected `exec` sees every `gh` call the run makes.
  - **Pacing:** `migrateToGithub()` uses `sleep` and `now` to space mutations and enforce the wait bounds (GitHub spec BEH-35).
  - **Confirmation:** the confirmation step (BEH-3) uses `isTTY` and `readLine`.
  - **stderr:** stderr lines still go through `console.error`, as they do today. Tests capture them by replacing `console.error`, the way `tests/lib/cli-issues-migrate.test.mjs` does.

  None of the seams is ever taken from argv, the environment or the manifest, so no production surface can redirect the `gh` transport. The CLI dispatcher `lib/cli/issues.mjs` calls `run({ projectRoot, argv, manifest })` and passes no seams, so a CLI invocation always uses the production defaults.

### Error Cases (delta)

| Condition | Expected Behavior | Exit |
|-----------|------------------|------|
| `--to` value not in `SUPPORTED_BACKENDS` | `MIGRATE_UNKNOWN_BACKEND` listing `SUPPORTED_BACKENDS` (replaces the base `{json, beads, file}` row) | non-zero |
| Source resolves to `github`, target is not `github` | `MIGRATE_GITHUB_UNAVAILABLE`; no adapter constructed, nothing read or written | 1 |
| `--to github`, state file's `scope_args.includeClosed` differs from this run | `MIGRATE_RESUME_MISMATCH` naming both values, before preflight and any write (new; json/beads still warn and continue) | 1 |
| `--to github`, state file's `scope_args.includeClosed` missing or not a boolean | `MIGRATE_RESUME_INVALID` before any write | 1 |
| `--to github`, preflight or `setup --check` fails | The `GITHUB_*` code on stderr (GitHub spec BEH-3, BEH-29); no envelope, no state file written, no sentinel | 1 |
| `--to github`, one `legacy_id` on several target items | `GITHUB_AMBIGUOUS_LEGACY_ID` naming the items, before any write | 1 |
| `--to github`, target holds a `legacy_id` not in the source ID set | `MIGRATE_TARGET_FOREIGN_LEGACY_ID` naming up to 10 values and the count, before any write | 1 |
| `--to github`, existing sentinel names another project, or is unreadable | `MIGRATE_SENTINEL_PROJECT_MISMATCH` naming both, before any write | 1 |
| `--to github`, symlink at the sentinel path, or sentinel root outside the storage root | `SENTINEL_PATH_UNSAFE` before any write (BEH-12) or at write time (BEH-8) | 1 |
| `--to github`, state file's progress count disagrees with the board's `legacy_id` count | `warning:` line on stderr; the run continues and the board decides what is skipped | unaffected |
| `--to github`, non-interactive, no `--yes`, work remains or the sentinel is absent | `MIGRATE_CONFIRMATION_REQUIRED` before any write | 1 |
| `--to github`, interactive, answer not `y`/`yes`, or EOF | `MIGRATE_CONFIRMATION_REQUIRED`; no write | 1 |
| `--to github`, nothing left to do and the sentinel already present for this project | No prompt, even non-interactive without `--yes`; success path | 0 |
| `--to github`, failure after confirmation | `MIGRATE_PARTIAL_FAILURE` envelope with a redacted `{ source_id, code: GITHUB_*, message }` in `errors[]`; `.migrate-state.json` written | 1 |
| `--to github`, sentinel write fails | `SENTINEL_PATH_UNSAFE` or the I/O code; no success report; GitHub items and state file kept; a re-run needs confirmation, then completes | 1 |
| `--to github`, beads source, sentinel commit on `beads-board` fails | `MIGRATE_SENTINEL_COMMIT_FAILED` naming the file and branch to commit by hand; sentinel kept; a re-run retries the commit without confirmation | 1 |
| `--to github --dry-run` | JSON report with the `github` object; no mutation, no local write, no commit | 0 |
| `--to github` success | JSON report with `github.id_map`, sentinel written (and committed on `beads-board` for a beads source), and on stderr the summary followed by `manifestUpdateSuggestion("github")` | 0 |

### Out of Scope

- **Migration out of a GitHub board.** BEH-2 keeps `MIGRATE_GITHUB_UNAVAILABLE`.
- **Pushing the sentinel, and committing a json or file sentinel.** The verb commits only a beads sentinel, on `beads-board`, and never pushes (BEH-8). The json and file commit rule belongs to `agent-reliable-state-artifacts` charter revision 9, and the operator carries it out.
- **Merging several source boards into one project.** BEH-11 refuses a target that holds foreign `legacy_id` values. Recording board identity in `Legacy ID` or in the sentinel would let adev tell colliding boards apart, but this amendment does not change either format.
- **Automated rollback.** The base Rollback section stands. For a github target, rollback means closing the created issues on GitHub by hand and, once the migration is abandoned, removing the sentinel by hand (and, for a beads source, committing that removal on `beads-board`). No adev verb deletes the sentinel (charter revision 9).
- **Changing json and beads scope-mismatch handling.** It stays warn-and-continue (BEH-4).
- **A `--json` flag.** As in the base, stdout is always the single JSON report.
- **Changes to `IssueManager`, `JsonAdapter` or `BeadsAdapter`.** Refusing writes on a sentinel-marked board is GitHub spec BEH-33 (plan Task 14), not part of this verb. This amendment's acceptance criteria check that guard end to end only after a migration.

### Notes for Planning

This amendment does not edit `github-board-backend.plan.md`. That plan must be reconciled with this contract before tasks 14, 18 and 19 are implemented:

- **Task 18 test sketch:**
  - It passes `--json` and reads `report.code`. This amendment adds no `--json` flag, and the stdout report has no top-level `code`. The envelope is identified by the stderr line starting `MIGRATE_PARTIAL_FAILURE:`, and the `GITHUB_*` code is in `errors[0].code`.
  - Its `log` seam is now part of BEH-10, as the stdout sink, so that part of the sketch is consistent.
- **Task 18 implementation:** it also owns these behaviors:
  - the github-only scope-mismatch refusal in `loadResumeState()` (BEH-4);
  - the resume progress line and its cross-check (BEH-4);
  - the `legacy_id` provenance checks and `MIGRATE_TARGET_FOREIGN_LEGACY_ID` (BEH-11);
  - building the target `GithubAdapter` with the seams (BEH-10);
  - adding the `Authorization:` pattern to `redact()` (BEH-6).
- **Task 19, case 3:** "a re-run with nothing left to create or link needs no confirmation" holds only when the sentinel already exists for this project. With the sentinel absent, the run needs confirmation or `--yes` (BEH-3).
- **Task 19, case 6:** it expects stdout to end with the `manifestUpdateSuggestion("github")` text. Under base Behavior 16 and BEH-8, that text is the last line on **stderr**, and stdout carries only the JSON report.
- **Task 19, confirmation tests:** they need the `readLine` seam (BEH-10) to test interactive confirmation.
- **Task 19, other work:** it also owns the existing-sentinel checks (BEH-12) and the beads sentinel commit (BEH-8).
- **Task 14:** `lib/issues/read-only-sentinel.mjs` gains `commitSentinel(storageRoot)` for the beads commit (BEH-8), next to `writeSentinel` and `readSentinel`. Task 19's tests for it need a temp repo with a `.beads/` linked worktree on `beads-board`.
- **Task 22 (docs):**
  - `docs/cli-reference.md` gains `--yes` and the changed `MIGRATE_UNKNOWN_BACKEND` text.
  - `docs/troubleshooting.md` gains `MIGRATE_CONFIRMATION_REQUIRED`, the github `MIGRATE_RESUME_MISMATCH` scope refusal, `MIGRATE_TARGET_FOREIGN_LEGACY_ID`, `MIGRATE_SENTINEL_PROJECT_MISMATCH` and `MIGRATE_SENTINEL_COMMIT_FAILED`.
- **Test prerequisite:** `tests/issues/github/replay-transport.mjs` (plan Task 5) already exists, and every acceptance criterion here uses it.
- **Base spec discrepancy, not resolved here:** the base Idempotency section says a scope mismatch is refused. For json and beads targets, `loadResumeState()` only warns. This amendment changes only the github target. Either the base text or the json/beads code needs a separate decision.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** no new dependency. `gh` is a process boundary reached through the github transport, the same posture the base spec takes toward `br`. The beads sentinel commit uses `git` through `execFileSync` argv arrays, as `lib/issues/board-worktree.mjs` already does.
- **Principle 3 — Pure ESM:** every change is in an `.mjs` module.
  - **Existing:** `lib/cli/issues-migrate.mjs`, `lib/issues/github/errors.mjs`.
  - **Created by the github plan:** `lib/issues/github/migrate.mjs` (Task 18) and `lib/issues/read-only-sentinel.mjs` (Task 14).
- **Principle 2 — Skills are primarily markdown:** no skill changes.
- **ADR 0014 (scoped-exception note, 2026-11-26):** unchanged for json and beads targets. The ADR now records BEH-6's token redaction on the github path as a scoped exception, using the same pattern as ADR 0016's 2026-11-26 exception.
- **ADR 0016 (amended 2026-11-26):** a github target is covered by its opt-in external-board exception. The source board is retired by the sentinel, as that exception requires.

## Acceptance Criteria

**How the criteria run:**
- **Through `run()`:** every criterion except the first runs through `run()` in `lib/cli/issues-migrate.mjs`, which is the function the CLI dispatcher `lib/cli/issues.mjs` calls for `adev issues migrate`, with `{ projectRoot, argv, manifest }`.
- **Fixtures:** each test passes argv exactly as the CLI would. It sets `exec` to `replayExec(...)` from `tests/issues/github/replay-transport.mjs`, so no network or token is needed.
- **Why not a subprocess:** `run()` is the public boundary because the `gh` transport can only be injected in-process (BEH-10).
- **Output capture:** stdout is captured through the `log` seam, and stderr by replacing `console.error`.
- **Beads cases:** these use a temp git repo whose `.beads/` is a linked worktree on `beads-board`.

- [ ] **Subprocess (BEH-3):** `adev issues migrate --to github --yes --dry-run` does not exit with `MIGRATE_ARG_PARSE`, and `adev issues migrate --help` lists `--yes`.
- [ ] **Dispatch (BEH-1):** `--to github` from a json source and from a beads source both dispatch to the github path, and `MIGRATE_UNKNOWN_BACKEND`'s message lists `github`. `grep -nE '\[\s*"(json|beads|file|github)"\s*,' lib/cli/issues-migrate.mjs` returns nothing, which shows there is no literal array of backend names. The single-entry `READONLY_BACKENDS` set is allowed.
- [ ] **github source (BEH-2):** `--from github --to json` exits 1 with `MIGRATE_GITHUB_UNAVAILABLE` and `exec.calls.length === 0`. `--from github --to github` exits non-zero with `MIGRATE_NOOP`.
- [ ] **Seam wiring (BEH-10):** a `--dry-run --to github` run with an injected `exec` records the preflight request as its first `exec.calls` entry, and records the target-board read after it. That shows the target `GithubAdapter` was built with the injected `exec` and not through `getIssueManager()`. A rate-limit fixture run with an injected `sleep` and `now` records its waits on the injected `sleep`, and real time advances by less than one second.
- [ ] **Non-interactive refusal (BEH-3):** with `isTTY: false` and no `--yes`, the run exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`. The same holds with `--auto` but no `--yes`. In both cases no mutation operation appears in `exec.calls`, and neither `.migrate-state.json` nor the sentinel exists afterwards.
- [ ] **Interactive confirmation (BEH-3):**
  - with `isTTY: true`, a `readLine` answer of `n` exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` and no mutation;
  - EOF does the same;
  - an answer of `YES` proceeds;
  - the write set appears on stderr exactly once and names the sentinel path.
- [ ] **Nothing left to do, sentinel present (BEH-3, BEH-8):** a re-run with `isTTY: false` and no `--yes` uses a replay fixture where every item and link already carries `legacy_id`, and a sentinel for this project is already on disk. It exits 0 without prompting, issues no mutation, and leaves the sentinel byte-identical.
- [ ] **Nothing left to do, sentinel absent (BEH-3):** the same fixture with no sentinel on disk, `isTTY: false` and no `--yes`, exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` and leaves no sentinel. The same run with `--yes` exits 0 and writes the sentinel.
- [ ] **Resume, board decides (BEH-4):** after an interruption at item 2, a re-run with the state file and a re-run after deleting it issue the identical sequence of mutation operations and variables in `exec.calls`. Neither creates a duplicate `CreateIssue`.
- [ ] **Resume progress line (BEH-4):**
  - **Agreeing file:** after the interruption at item 2 (the fixture fails item 2 before creating it), the re-run that keeps the state file prints `resuming: 2 of M already migrated` on stderr, where M is the in-scope count, before the write set. It prints no `warning:` line about the count.
  - **Disagreeing file:** a state file edited to say `last_successful_index: 0`, against a board that holds two `legacy_id` matches, prints `resuming: 1 of M already migrated` followed by a `warning:` line naming 1 and 2. It still exits 0 with the same mutation sequence.
  - **No file:** the re-run after deleting the file prints no `resuming:` line.
- [ ] **Scope mismatch refused on github (BEH-4):**
  - A github-target state file recording `includeClosed: true`, re-run without `--include-closed`, exits 1 with `MIGRATE_RESUME_MISMATCH`. Its message names both values, `exec.calls.length === 0` (the refusal comes before preflight), and the state file is byte-identical.
  - A github-target state file with no `scope_args.includeClosed` exits 1 with `MIGRATE_RESUME_INVALID`.
- [ ] **json and beads unchanged (BEH-4, base Behaviors 11, 17, 18):** the existing json → beads and beads → json migrate tests pass unchanged. A json → beads state file with a different `includeClosed` still prints the existing `warning:` line and continues.
- [ ] **legacy_id provenance (BEH-11):**
  - **Foreign value:** a target fixture holding a `legacy_id` that is not on the source board (for example `issue-zzzz99`) exits 1 with `MIGRATE_TARGET_FOREIGN_LEGACY_ID` naming that value. No mutation appears in `exec.calls`, and neither the state file nor the sentinel is written. The same fixture under `--dry-run` also exits 1.
  - **Duplicate value:** a target fixture where two items carry the same `legacy_id` exits 1 with `GITHUB_AMBIGUOUS_LEGACY_ID` and no mutation.
  - **Out-of-scope value:** a target fixture whose `legacy_id` values are all source IDs, including a closed item outside a run without `--include-closed`, passes the check.
  - **Empty value:** a target item with an empty `legacy_id` passes the check.
- [ ] **Existing sentinel identity (BEH-12):**
  - A pre-existing sentinel whose `project` is a different URL exits 1 with `MIGRATE_SENTINEL_PROJECT_MISMATCH` naming both projects, with no mutation, and the sentinel is byte-identical.
  - An unparseable sentinel exits 1 with the same code.
  - Run with `projectRoot` set to a linked worktree of the test repo, a json-source migration writes the sentinel under the main checkout's `.context-index/tasks/`, which is `resolveStorageRoot()`'s root, and not under the worktree's own `.context-index/tasks/`.
- [ ] **Abort envelope (BEH-5):** a `GITHUB_WRITE_FAILED` fixture at item 2 exits 1. stdout parses as the base Live-Run shape with `errors[0]` = `{ source_id: <item 2's source ID>, code: "GITHUB_WRITE_FAILED", message }`, and stderr has a line starting `MIGRATE_PARTIAL_FAILURE:`. A `GITHUB_PARTIAL_CREATE` fixture additionally carries `target_id` and `unwritten_fields`. A `GITHUB_RATE_LIMITED` fixture additionally carries `reset_at`, equal to the error's `resetAt`.
- [ ] **Redaction (BEH-6):** set `GH_TOKEN` to a fixture value of at least 8 characters, and use a fixture error message containing that value, a `ghp_` token, a `github_pat_` token and an `Authorization: bearer …` header. The captured stdout and stderr contain none of the four secret strings and do contain `[REDACTED]`. A unit test of `redact()` in `lib/issues/github/errors.mjs` shows that the `Authorization:` credential is redacted.
- [ ] **Pre-confirmation failure (BEH-5):** a preflight-failure fixture (`GITHUB_FIELD_MISSING` naming `Legacy ID`) exits 1 with no stdout envelope and no `.migrate-state.json`.
- [ ] **Dry run (BEH-7):** `--dry-run --to github` exits 0, has no mutation operation in `exec.calls`, writes no local file and makes no git commit. Its report has every base dry-run key plus `github.visibility`, `github.would_publish.{titles,notes}`, `github.would_create_ids`, `github.parent_links_to_replay` and `github.estimated_requests`.
- [ ] **Success, json source (BEH-8):**
  - `.context-index/tasks/board-read-only.json` holds exactly the five charter-rev-9 keys;
  - every pre-existing board file is byte-identical;
  - stdout's `github.id_map` covers every in-scope source ID;
  - the last stderr line equals `manifestUpdateSuggestion("github")`;
  - `.migrate-state.json` is gone;
  - `manifest.yaml` is byte-identical, with and without `--auto`;
  - `git log` on the checked-out branch shows no new commit.
- [ ] **Success, beads source (BEH-8):**
  - the run writes `.beads/adev-read-only.json`;
  - `git -C .beads log -1 --name-only` on `beads-board` shows one new commit that touches only that file;
  - a file that was staged in `.beads/` before the run is still staged and not in that commit;
  - nothing is pushed: the remote-tracking ref is unchanged;
  - the main branch has no new commit.
- [ ] **Beads commit failure (BEH-8):** with `.beads/` checked out on a branch other than `beads-board`, a beads-source run exits 1 with `MIGRATE_SENTINEL_COMMIT_FAILED`. The message names the sentinel's absolute path and `beads-board`. The sentinel exists and is uncommitted, and there is no success report on stdout. Switching `.beads/` back to `beads-board` and re-running with `isTTY: false` and no `--yes` commits the file and exits 0.
- [ ] **Unsafe sentinel (BEH-8, BEH-12):** a symlink at the sentinel path makes the run exit 1 with `SENTINEL_PATH_UNSAFE` before any mutation.
- [ ] **Sentinel blocks later local writes (BEH-8, GitHub spec BEH-33):** after a successful json-source migration, `create()` on the `JsonAdapter` for the same storage root throws `BOARD_READ_ONLY_MIGRATED` naming the target project, and `list()` still returns the board's items. After a successful beads-source migration, `assertWritable(storageRoot, "beads")` from `lib/issues/read-only-sentinel.mjs` throws `BOARD_READ_ONLY_MIGRATED`. That is the guard every `BeadsAdapter` write calls (plan Task 14).
- [ ] **Pacing (BEH-9):** pacing and wait bounds are asserted through the injected `sleep` and `now` as GitHub spec BEH-35 states. A stop beyond the bounds uses the BEH-5 envelope.
- [ ] **Seams not configurable (BEH-10):** `lib/issues/github/migrate.mjs` exists (plan Task 18 creates it). `grep -nE 'process\.env\.[A-Z_]*(EXEC|TTY|SLEEP|READLINE|LOG)' lib/cli/issues-migrate.mjs lib/issues/github/migrate.mjs` prints nothing and exits 1 (no match), not 2 (missing file). `run()` reads none of `exec`, `isTTY`, `readLine`, `sleep`, `now` or `log` from argv, the environment or the manifest.
- [ ] **No network (all):** `npm test` passes with no network access and no `GH_TOKEN`.
