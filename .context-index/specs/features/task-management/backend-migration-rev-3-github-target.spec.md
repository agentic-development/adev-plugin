---
charter: task-management
kind: action
status: review-pending
risk_level: high
revision: 1
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
  - **The github path:** defined by GitHub spec BEH-29. In order: preflight and the `setup --check` gate, confirmation (BEH-3 below), an ordered sequential copy that writes `Legacy ID`, then replay of parents and dependencies after every item exists. It stops on the first per-item failure.
  - **Removed refusal:** `MIGRATE_GITHUB_UNAVAILABLE` no longer fires for a github target.
  - **Base wording updated:** the base Error Cases row "`--to` value not in `{json, beads, file}`" now reads "`--to` value not in `SUPPORTED_BACKENDS`". The validation bullet in base Procedure Step 1 now reads "Validate `--to` ∈ `SUPPORTED_BACKENDS`".
- **BEH-2** — **When** the resolved source is `github` (`--from github`, or `tasks.backend: github` with no `--from`) and the target is not `github` **then** the verb exits 1 with `MIGRATE_GITHUB_UNAVAILABLE`. It does so before it constructs an adapter or reads or writes any state. Migration out of a GitHub board is out of scope. **When** both source and target are `github` **then** base Behavior 3 applies (`MIGRATE_NOOP`), and that check runs before this refusal.
- **BEH-3** — **When** the verb parses its arguments **then** it accepts `--yes` as a boolean flag that takes no value, and `help()` lists it as "Confirm a github migration's write set without prompting." `--yes` has no effect on json or beads targets, which have no confirmation step. For a github target, confirmation follows GitHub spec BEH-41, with these verb-level rules:
  - **What counts as interactive:** a run is interactive only when stdin is a TTY and `--auto` is absent. Every other run is non-interactive.
  - **When the write set is printed:** once, to stderr, after preflight, the `setup --check` gate and the target-board read all succeed, and before the first GitHub mutation or local file write. Its content is defined by GitHub spec BEH-41.
  - **Interactive runs:** the verb prompts on stderr and reads one line from stdin. `y` or `yes` (trimmed, case-insensitive) proceeds. Any other answer, or EOF, exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`, with no GitHub mutation and no local write.
  - **Non-interactive runs without `--yes`:** the verb exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` before any GitHub mutation and before writing `.migrate-state.json` or the sentinel. The message names `--yes` as the remedy.
  - **Where `--yes` comes from:** argv only. It is never read from `manifest.yaml`, the environment or `.migrate-state.json`. It is not recorded in `.migrate-state.json` and is not part of `scope_args`, so passing or omitting it is never a resume mismatch. `--auto` does not imply it.
  - **Nothing left to do:** when the target-board read shows that every in-scope item and every parent and dependency link is already present, the verb needs no confirmation and prints no prompt. This holds even for a non-interactive run without `--yes`. The verb goes straight to the success path (BEH-8). Writing the sentinel is a local write, not a publication to GitHub, so it needs no confirmation either.
  - **Dry runs:** `--dry-run` never asks for confirmation (BEH-7).

### Resume ownership

- **BEH-4** — **When** the target is `github` **then** the target board's `legacy_id` values are the idempotency and resume source of truth (GitHub spec BEH-30). The verb walks the in-scope items from index 0 and skips each item and link that the target already holds. Title matching is never used.

  `.context-index/tasks/.migrate-state.json` is kept for progress reporting only:
  - It keeps its existing schema `{ source, target, last_successful_index, scope_args }`.
  - It is still written by atomic temp-rename after each successful item, and still removed on success.
  - The existing resume-argument checks still run at the start of every run (base Procedure Step 2: `MIGRATE_RESUME_MISMATCH`, `MIGRATE_RESUME_INVALID`).
  - Its `last_successful_index` never decides which items are skipped. A re-run with a valid state file and a re-run with no state file issue the same sequence of GitHub mutations, so deleting the file changes nothing a re-run does.

  **When** the target is `json` or `beads` **then** base Behaviors 11, 17 and 18 and the base Idempotency section apply unchanged.

### Abort envelope

- **BEH-5** — **When** the github path stops after confirmation, or after the nothing-left-to-do decision, **then** the verb writes `.migrate-state.json` (BEH-4) and emits the existing `MIGRATE_PARTIAL_FAILURE` envelope. That envelope is kept, not replaced by a top-level `GITHUB_*` code.

  The stops this covers:
  - a per-item failure listed in GitHub spec BEH-29 (`GITHUB_WRITE_FAILED`, `GITHUB_PARTIAL_CREATE`, `GITHUB_INVALID_FIELD_VALUE`);
  - `GITHUB_RATE_LIMITED` beyond the bounds in GitHub spec BEH-35;
  - any other `GITHUB_*` error raised while writing, such as `GITHUB_UNREACHABLE` or `GITHUB_PERMISSION_DENIED`.

  What the envelope contains:
  - **stdout:** one JSON report in the base Live-Run Output Shape, with `manifest_update_suggested: false`. `errors[]` holds one entry `{ source_id, code, message }`, where `code` is the `GITHUB_*` code and `source_id` is the failing source item's ID. A `GITHUB_PARTIAL_CREATE` entry also carries `target_id` (the new canonical ID) and `unwritten_fields`. A `GITHUB_RATE_LIMITED` entry also carries `reset_at`.
  - **stderr:** one line that starts with `MIGRATE_PARTIAL_FAILURE:` and names the `GITHUB_*` code and the source ID.
  - **exit:** 1.

  **When** the github path fails before confirmation **then** the verb prints the failing code on stderr and exits 1. It emits no envelope and writes neither `.migrate-state.json` nor the sentinel. This covers:
  - every preflight code in GitHub spec BEH-3;
  - `GITHUB_FIELD_MISSING` from the `setup --check` gate;
  - any `GITHUB_*` error during the target-board read;
  - `MIGRATE_CONFIRMATION_REQUIRED`.
- **BEH-6** — **When** the github path writes any message to stdout or stderr **then** it redacts the message first. This applies to `errors[].message`, every stderr line, the write-set disclosure, and the dry-run and success reports.

  Redaction replaces each of the following with `[REDACTED]`:
  - (a) the exact value of the `GH_TOKEN` or `GITHUB_TOKEN` environment variable, when it is set and non-empty;
  - (b) every match of `/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g`;
  - (c) the credential that follows `Authorization:` in every match of `/authorization:\s*(?:bearer|token)\s+\S+/gi`.

  Nothing else changes: no path scrubbing and no truncation. The verb redacts even when the adapter already has, as defense in depth.

  **This does not contradict ADR 0014.** ADR 0014's decision and rationale cover `br` stderr on the json and beads paths, where "there is no transport boundary … that would call for an additional redaction layer". The github path adds a network transport that carries credentials. ADR 0014's verbatim policy still applies to everything except token-like material, and is unchanged for json and beads targets.

### Dry-run and success output

- **BEH-7** — **When** `--dry-run --to github` runs **then** the verb issues no GitHub mutation (GitHub spec BEH-31), writes neither `.migrate-state.json` nor the sentinel, and asks for no confirmation.
  - **Reads it still performs:** preflight, the `setup --check` gate and the target-board read. These are read-only, and their failures exit 1 per BEH-5.
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

  The json and beads dry-run shapes are unchanged.
- **BEH-8** — **When** a github migration finishes with every in-scope item and link present and no error **then** the verb does the following, in order:
  1. **Writes the read-only sentinel for the source board** (GitHub spec BEH-32).
     - **Owned by `agent-reliable-state-artifacts` charter revision 9** ("Read-only board sentinel document schema"): the path, the five-key content, the atomic temp-rename write, the containment check and the `SENTINEL_PATH_UNSAFE` refusal.
     - **Path:** `.context-index/tasks/board-read-only.json` for a json or file source; `.beads/adev-read-only.json` for a beads source.
     - **No read-modify-write:** no existing board file is changed to create the sentinel.
     - **Sentinel already present:** it is left byte-identical, and the stderr summary reports it as pre-existing along with the project it records.
     - **Write fails:** the verb exits 1 with that code. The GitHub items are kept, and a re-run writes the sentinel (nothing is left to do, so it needs no confirmation).
  2. **Prints one JSON report on stdout.** It uses the base Live-Run Output Shape (`errors: []`, `manifest_update_suggested: true`) and adds `"github": { "project": "<URL>", "sentinel_path": "<repo-relative path>", "id_map": { "<source id>": "<canonical gh id>" } }`. `id_map` covers every in-scope item, whether this run created it or found it by `legacy_id`.
  3. **Prints three things to stderr, in this order:**
     - the old-ID → new-ID summary, one `<source id> → <gh id>` line per item;
     - one line naming the sentinel path and saying it must be committed under the charter revision 9 commit rule (for a beads source, on `beads-board` in the sync that retires the board);
     - the existing `manifestUpdateSuggestion("github")` text, as the last stderr line.
  4. **Removes `.migrate-state.json` and exits 0.**

  The verb itself makes no git commit. It never writes `manifest.yaml`, with or without `--auto` (base Behavior 19, GitHub spec BEH-32).

### Pacing

- **BEH-9** — **When** the github path issues mutations or hits a rate limit **then** its pacing, waits and wait bounds are exactly those of GitHub spec BEH-35. A stop beyond those bounds uses the BEH-5 envelope.

### Test seams

- **BEH-10** — **When** `run()` in `lib/cli/issues-migrate.mjs` is called **then** it accepts five optional injected dependencies. Each has a production default:

  | Seam | What it is | Production default |
  |------|------------|--------------------|
  | `exec` | the `gh` spawn the github transport uses | the real spawn |
  | `isTTY` | whether stdin is a TTY | `process.stdin.isTTY` |
  | `readLine` | the source of the confirmation answer | a stdin line reader |
  | `sleep` | the pacing delay | a `setTimeout`-based sleep |
  | `now` | the clock | `Date.now` |

  None of them is ever taken from argv, the environment or the manifest, so no production surface can redirect the `gh` transport.

### Error Cases (delta)

| Condition | Expected Behavior | Exit |
|-----------|------------------|------|
| `--to` value not in `SUPPORTED_BACKENDS` | `MIGRATE_UNKNOWN_BACKEND` listing `SUPPORTED_BACKENDS` (replaces the base `{json, beads, file}` row) | non-zero |
| Source resolves to `github`, target is not `github` | `MIGRATE_GITHUB_UNAVAILABLE`; no adapter constructed, nothing read or written | 1 |
| `--to github`, preflight or `setup --check` fails | The `GITHUB_*` code on stderr (GitHub spec BEH-3, BEH-29); no envelope, no state file, no sentinel | 1 |
| `--to github`, non-interactive, no `--yes`, work remains | `MIGRATE_CONFIRMATION_REQUIRED` before any write | 1 |
| `--to github`, interactive, answer not `y`/`yes`, or EOF | `MIGRATE_CONFIRMATION_REQUIRED`; no write | 1 |
| `--to github`, failure after confirmation | `MIGRATE_PARTIAL_FAILURE` envelope with a redacted `{ source_id, code: GITHUB_*, message }` in `errors[]`; `.migrate-state.json` written | 1 |
| `--to github`, sentinel write fails | `SENTINEL_PATH_UNSAFE` or the I/O code; GitHub items kept; a re-run completes | 1 |
| `--to github --dry-run` | JSON report with the `github` object; no mutation, no local write | 0 |
| `--to github` success | JSON report with `github.id_map`, sentinel written, and on stderr the summary followed by `manifestUpdateSuggestion("github")` | 0 |

### Out of Scope

- **Migration out of a GitHub board.** BEH-2 keeps `MIGRATE_GITHUB_UNAVAILABLE`.
- **Committing or pushing the sentinel automatically.** The commit rule is owned by `agent-reliable-state-artifacts` charter revision 9; the verb only names it (BEH-8).
- **Automated rollback.** The base Rollback section stands. For a github target, rollback means closing the created issues on GitHub by hand and, once the migration is abandoned, removing the sentinel by hand. No adev verb deletes the sentinel (charter revision 9).
- **A `--json` flag.** As in the base, stdout is always the single JSON report.
- **Changes to `IssueManager`, `JsonAdapter` or `BeadsAdapter`.** Refusing writes on a sentinel-marked board is GitHub spec BEH-33, not part of this verb.

### Notes for Planning

`github-board-backend.plan.md` must be reconciled with this contract before tasks 18 and 19 are implemented:

- **Task 18:** its test sketch passes `--json` and reads `report.code`. This amendment adds no `--json` flag. The envelope is identified by the stderr line starting `MIGRATE_PARTIAL_FAILURE:`, and the `GITHUB_*` code is in `errors[0].code`.
- **Task 19, case 6:** it expects stdout to end with the `manifestUpdateSuggestion("github")` text. Under base Behavior 16 and BEH-8, that text is the last line on **stderr**, and stdout carries only the JSON report.
- **Task 19:** it needs the `readLine` seam (BEH-10) to test interactive confirmation.

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** no new dependency. `gh` is a process boundary reached through the github transport, the same posture the base spec takes toward `br`.
- **Principle 3 — Pure ESM:** all changes are in existing `.mjs` modules (`lib/cli/issues-migrate.mjs`, `lib/issues/github/migrate.mjs`).
- **Principle 2 — Skills are primarily markdown:** no skill changes.
- **ADR 0014:** unchanged for json and beads targets. BEH-6 explains why redaction on the github path is consistent with ADR 0014's own rationale.
- **ADR 0016 (amended 2026-11-26):** a github target is covered by its opt-in external-board exception. The source board is retired by the sentinel, as that exception requires.

## Acceptance Criteria

All criteria except the first run through `run()` in `lib/cli/issues-migrate.mjs`, which is the function `cli/index.mjs` dispatches `adev issues migrate` to. Each test passes argv exactly as the CLI would and sets `exec` to `replayExec(...)` from `tests/issues/github/replay-transport.mjs`, so no network or token is needed. `run()` is the public boundary rather than a subprocess because the `gh` transport can only be injected in-process (BEH-10).

- [ ] **Subprocess (BEH-3):** `adev issues migrate --to github --yes --dry-run` does not exit with `MIGRATE_ARG_PARSE`, and `adev issues migrate --help` lists `--yes`.
- [ ] **Dispatch (BEH-1):** `--to github` from a json source and from a beads source both dispatch to the github path, and `MIGRATE_UNKNOWN_BACKEND`'s message lists `github`. `grep -nE '\[\s*"(json|beads|file|github)"\s*,' lib/cli/issues-migrate.mjs` returns nothing, which shows there is no literal array of backend names. The single-entry `READONLY_BACKENDS` set is allowed.
- [ ] **github source (BEH-2):** `--from github --to json` exits 1 with `MIGRATE_GITHUB_UNAVAILABLE` and `exec.calls.length === 0`. `--from github --to github` exits non-zero with `MIGRATE_NOOP`.
- [ ] **Non-interactive refusal (BEH-3):** with `isTTY: false` and no `--yes`, the run exits 1 with `MIGRATE_CONFIRMATION_REQUIRED`. The same holds with `--auto` but no `--yes`. In both cases no mutation operation appears in `exec.calls`, and neither `.migrate-state.json` nor the sentinel exists afterwards.
- [ ] **Interactive confirmation (BEH-3):** with `isTTY: true`, a `readLine` answer of `n` exits 1 with `MIGRATE_CONFIRMATION_REQUIRED` and no mutation, and so does EOF. An answer of `YES` proceeds. The write set appears on stderr exactly once.
- [ ] **Nothing left to do (BEH-3, BEH-8):** a re-run against a replay fixture where every item and link already carries `legacy_id`, with `isTTY: false` and no `--yes`, exits 0 without prompting and writes the sentinel if it is absent.
- [ ] **Resume (BEH-4):** after an interruption at item 2, a re-run with the state file and a re-run after deleting it issue the identical sequence of mutation operations and variables in `exec.calls`. Neither creates a duplicate `CreateIssue`. A state file recording `--include-closed` against a re-run without it exits 1 with `MIGRATE_RESUME_MISMATCH`.
- [ ] **json and beads unchanged (BEH-4, base Behaviors 11, 17, 18):** the existing json → beads and beads → json migrate tests pass unchanged.
- [ ] **Abort envelope (BEH-5):** a `GITHUB_WRITE_FAILED` fixture at item 2 exits 1. stdout parses as the base Live-Run shape with `errors[0]` = `{ source_id: <item 2's source ID>, code: "GITHUB_WRITE_FAILED", message }`, and stderr has a line starting `MIGRATE_PARTIAL_FAILURE:`. A `GITHUB_PARTIAL_CREATE` fixture additionally carries `target_id` and `unwritten_fields`, and a `GITHUB_RATE_LIMITED` fixture additionally carries `reset_at`.
- [ ] **Redaction (BEH-6):** set `GH_TOKEN` to a fixture value, and use a fixture error message containing that value, a `ghp_` token, a `github_pat_` token and an `Authorization: bearer …` header. The captured stdout and stderr contain none of the three token strings and do contain `[REDACTED]`.
- [ ] **Pre-confirmation failure (BEH-5):** a preflight-failure fixture (`GITHUB_FIELD_MISSING` naming `Legacy ID`) exits 1 with no stdout envelope and no `.migrate-state.json`.
- [ ] **Dry run (BEH-7):** `--dry-run --to github` exits 0, has no mutation operation in `exec.calls` and writes no local file. Its report has every base dry-run key plus `github.visibility`, `github.would_publish.{titles,notes}`, `github.would_create_ids`, `github.parent_links_to_replay` and `github.estimated_requests`.
- [ ] **Success (BEH-8):** on success from a json source:
  - `.context-index/tasks/board-read-only.json` holds exactly the five charter-rev-9 keys;
  - every pre-existing board file is byte-identical;
  - stdout's `github.id_map` covers every in-scope source ID;
  - the last stderr line equals `manifestUpdateSuggestion("github")`;
  - `.migrate-state.json` is gone;
  - `manifest.yaml` is byte-identical, with and without `--auto`.

  The same run from a beads source writes `.beads/adev-read-only.json`.
- [ ] **Existing or unsafe sentinel (BEH-8):** a pre-existing sentinel is left byte-identical on a successful re-run. A symlink at the sentinel path makes the run exit 1 with `SENTINEL_PATH_UNSAFE`.
- [ ] **Pacing (BEH-9):** pacing and wait bounds are asserted through the injected `sleep` and `now` as GitHub spec BEH-35 states. A stop beyond the bounds uses the BEH-5 envelope.
- [ ] **Seams (BEH-10):** `run()` reads none of `exec`, `isTTY`, `readLine`, `sleep` or `now` from argv, the environment or the manifest. `grep -nE 'process\.env\.[A-Z_]*(EXEC|TTY|SLEEP)' lib/cli/issues-migrate.mjs lib/issues/github/migrate.mjs` returns nothing.
- [ ] **No network (all):** `npm test` passes with no network access and no `GH_TOKEN`.
