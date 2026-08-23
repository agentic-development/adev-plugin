---
charter: task-management
kind: behavioral
status: validated
risk_level: medium
milestone: 5
revision: 4
charter-revision: 9
created: 2026-08-22
updated: 2026-08-22
source-manifest:
  sha: "9c5902a"
  files:
    - cli/index.mjs
    - lib/cli/issues-board.mjs
    - lib/cli/issues.mjs
    - lib/gitignore-paths.mjs
    - lib/issues/board-migrate-state.mjs
    - lib/issues/board-worktree.mjs
    - tests/cli-install-board-bootstrap.test.mjs
    - tests/lib/board-migrate-state.test.mjs
    - tests/lib/board-worktree.test.mjs
    - tests/lib/cli-issues-board-migrate.test.mjs
    - tests/lib/gitignore-paths.test.mjs
    - tests/lib/issues-resolve-root.test.mjs
  computed-at: "2026-08-22T22:06:18.462Z"
---

# Live Spec: Beads Board Git Topology

<!-- Live Spec within the task-management charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/task-management/charter.md -->

Covers two capabilities from charter revision 9's Capability Map: **Beads Board Git
Topology** and **Beads Board Migration Tool**. Grouped per the charter's Spec
Organization Plan (dependency-chain + blast-radius: the migration tool applies the
topology's own git mechanics to convert an existing repo's board; both touch
git-worktree plumbing and `cli/index.mjs`'s bootstrap path). Explicitly excludes safe
reconciliation of concurrent pushes from independent clones/CI — tracked as `issue-vtj7lp`
and will be covered by a forthcoming `beads-board-direct-sync` spec (not yet written; the
charter's Capability Map lists it with Status `—`), not this one.

Every behavior below was empirically validated in the brainstorm's prototype spike: real
`git`/`br` commands run against a scratch repo (a bare `origin.git`, a primary clone, a
fresh second clone, and a second independent clone), not inferred from documentation.

## Behavioral Contract

### Preconditions

- The project is a git repository with `git` >= 2.42 on PATH (the version that added
  `git worktree add --orphan`; this repo runs 2.50.1).
- `tasks.backend: beads` is configured in `manifest.yaml`.
- `br` (beads_rust) is installed and satisfies `MIN_BR_VERSION` when beads operations are
  exercised (the `--no-db` fallback behaviors below depend on the fix already shipped in
  `lib/issues/beads-adapter.mjs` for issue-i0ji37).
- For push-based bootstrap (BEH-2), a `beads-board` branch already exists on the remote
  `origin`.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** `.beads/` is provisioned as a `git worktree` linked to the
  `beads-board` orphan branch and no `*.db` file exists inside it yet, **then** `br` and
  `BeadsAdapter` read and write directly against `issues.jsonl` via the existing `--no-db`
  fallback (issue-i0ji37) — no `SYNC_CONFLICT` error, and no separate `br init` step is
  required before the worktree is usable.
- **BEH-2** — **When** a project is cloned from a remote that already has a `beads-board`
  branch, **then** a single command, `git worktree add .beads beads-board`, provisions
  `.beads/` as a working, board-ready linked worktree. No separate `git fetch` is required
  — a plain `git clone` already fetches every remote branch ref, `beads-board` included.
- **BEH-3** — **When** `.beads/` is provisioned for the first time in a repo that has no
  `beads-board` branch yet, **then** `git worktree add --orphan -b beads-board .beads`
  creates the branch with history unrelated to `main` and checks it out at `.beads/` in
  one step.
- **BEH-4** — **When** `resolveStorageRoot()` (`lib/issues/resolve-root.mjs`) resolves the
  storage root from inside any local git worktree of the main repo, **then** it continues
  to return the main repo's working-copy root exactly as it does today — the `.beads/`
  linked-worktree topology requires no change to `resolveStorageRoot()`'s own resolution
  algorithm, because the linked worktree lives at a path (`.beads/`) inside the root that
  algorithm already resolves to.
- **BEH-5** — **When** `main`'s working tree is inspected with `git status` after `.beads/`
  is converted to a linked worktree, **then** `.beads/` does not appear as untracked
  content, because `main`'s `.gitignore` carries a `.beads/` entry.
- **BEH-6** — **When** the CLI install/bootstrap flow (`cli/index.mjs`) runs against a
  project whose remote already has a `beads-board` branch, **then** it provisions `.beads/`
  as a linked worktree automatically as part of scaffolding, without requiring the operator
  to run `git worktree add` by hand.
- **BEH-7** — **When** `adev issues board migrate` runs against a repo whose
  `.beads/issues.jsonl` is currently tracked inside `main`'s tree (this repo's state before
  this spec ships), **then** it: creates the `beads-board` orphan branch, replays the
  current board content onto it as a new commit, removes `.beads/` from `main`'s tracked
  tree, ensures `main`'s `.gitignore` covers `.beads/` by calling the existing
  `ensureManagedBlock(projectRoot)` (`lib/gitignore-installer.mjs`) — the same call BEH-5's
  fresh-install path makes — and re-provisions `.beads/` as a linked worktree against
  `beads-board`. This is a genuinely small **cross-spec** dependency, not a bespoke
  mechanism: `.beads/` is added as a new entry to the frozen `MANAGED_GITIGNORE_PATHS` array
  (`lib/gitignore-paths.mjs`), owned by `setup/managed-gitignore-block.spec.md`. That list
  already carries several feature-conditional entries unconditionally (e.g. the pre-existing
  `.context-index/tasks/.migrate-state.json` entry only matters to a project that has ever
  run `adev issues migrate`, and `.adev/` only matters to a project that has prototyped) —
  the pattern this spec relies on is the array's own established convention, not a new one.
  `ensureManagedBlock` writes and rewrites the *entire* canonical block (paired-marker
  splice), never a single-line append, and it is already idempotent by construction: it
  returns `"noop"` when the on-disk block already matches canonical, so calling it
  unconditionally on both the fresh-install path and here is correct and requires no
  additional skip-if-present logic in this spec's own code. The board's logical content is
  unchanged and none of `main`'s prior commit history is rewritten.
- **BEH-8** — **When** `adev issues board migrate --dry-run` runs, **then** it reports the
  planned steps (branch creation, file removal, gitignore edit, worktree provisioning)
  without mutating the repository.
- **BEH-9** — **When** `adev issues board migrate` runs against a repo where `.beads/` is
  already a linked worktree against `beads-board` (already migrated), **then** it detects
  the existing topology and reports a no-op rather than attempting the conversion again.

### Postconditions

- `.beads/` resolves as a working, read/write board via `BeadsAdapter`, whether it arrived
  by fresh-clone bootstrap (BEH-2/BEH-3) or by one-shot migration (BEH-7).
- `main`'s commit history contains no new board-content commits after this spec ships —
  every board mutation lands on `beads-board` only.
- `git status` run at the repo root is clean with respect to `.beads/` in every topology
  state this spec produces.
- The pre-migration and post-migration board content are logically identical (same issues,
  same fields) — migration is a location change, not a data change.

### Error Cases

| Condition | Expected Behavior | Exit |
|-----------|-------------------|------|
| `git worktree add .beads beads-board` run when `.beads/` already exists as a non-empty plain directory (an un-migrated repo) | `BOARD_ALREADY_EXISTS`; fails with git's own "already exists" error surfaced under this code; the operator is directed to `adev issues board migrate` instead of a raw `git worktree add` | non-zero |
| `git worktree add .beads beads-board` run when no `beads-board` branch exists yet, locally or on the remote | `BOARD_NO_BRANCH`; fails with git's own "invalid reference" error surfaced under this code; the CLI bootstrap flow (BEH-6) must create the orphan branch first via `--orphan` when none is found | non-zero |
| `adev issues board migrate` run on a repo where `.beads/` is already a linked worktree against `beads-board` | `BOARD_ALREADY_MIGRATED`; no mutation; reports already-migrated (BEH-9) | 0 |
| `adev issues board migrate --dry-run` run on an already-migrated repo | `BOARD_ALREADY_MIGRATED`; reports nothing-to-do; no mutation | 0 |
| `adev issues board migrate` run on a repo where `.beads/issues.jsonl` does not exist on `main` at all (nothing to migrate) | `BOARD_NOTHING_TO_MIGRATE`; fails with a clear "nothing to migrate" error rather than silently creating an empty `beads-board` | non-zero |
| `br` commands run inside a freshly bootstrapped `.beads/` worktree with no `*.db` present | Falls back to `--no-db` mode per the existing issue-i0ji37 fix — not a new error case; cross-referenced here because BEH-1 depends on it | 0 |
| `adev issues board migrate` fails partway (e.g., interrupted push) | `main`'s tree is left untouched until the final step (removing `.beads/` from `main` and adding the `.gitignore` entry happens only after the `beads-board` push succeeds), so a partial failure never leaves `main` with a missing, un-gitignored `.beads/` | non-zero |
| `adev issues board migrate` fails between physically removing `.beads/` from disk and the subsequent `git worktree add .beads beads-board` re-provisioning step (e.g., permissions error, git version skew, disk error, or the retry's own `git worktree add` call is itself interrupted) | `BOARD_MIGRATE_PARTIAL_FAILURE`. A `.context-index/tasks/.board-migrate-state.json` checkpoint — same directory, same atomic temp-rename write, and same `MANAGED_GITIGNORE_PATHS` registration as the precedent it mirrors, `.context-index/tasks/.migrate-state.json` (`backend-migration.spec.md` Behaviors 17-18) — is written immediately after the `beads-board` push succeeds and immediately before `.beads/` is removed, recording that the push landed. On next invocation, `adev issues board migrate` reads the checkpoint and retries only the re-provisioning, via a fixed three-step recovery sequence run unconditionally before `git worktree add .beads beads-board` (cheap and idempotent when nothing is actually broken): (1) if `.beads/` exists on disk, remove its contents with a plain filesystem delete — **not** `git worktree remove`, since an interrupted prior `git worktree add` may not have registered cleanly enough for git to recognize it as a valid worktree to remove; (2) run `git worktree prune` to clear any stale `.git/worktrees/.beads` administrative entry that an interrupted `git worktree add` may have left behind — this is git's own standard primitive for exactly this class of problem (per `git worktree prune`'s own documented purpose: pruning worktree administrative data for working trees that no longer exist), used here as new logic beyond what this repo's existing `lib/worktree.mjs::remove()` provides, since that helper only wraps `git worktree remove` against an already-valid, already-registered worktree and has no corrupt-recovery path of its own; (3) run `git worktree add .beads beads-board`. The checkpoint is removed on successful completion, mirroring `backend-migration.spec.md` Behavior 18. The pushed `beads-board` content is never lost even if this exact step fails, so `.beads/` is always recoverable by re-running the same command | non-zero, resumable on retry |

## System Constitution Reference

- **Principle 1 ("Minimize external dependencies")** — Applies because this spec adds no
  new dependency: every behavior is implemented with `git` (already required) and `br`
  (already an optional external CLI the beads backend depends on).
- **Architecture Boundaries > Requires Human Approval ("Modifying the CLI installation
  path structure")** — Applies to BEH-6: the CLI install/bootstrap flow change is scoped to
  project-local `.beads/` provisioning only, not the adev-plugin CLI's own installation
  path (`~/.claude/` layout, plugin registration) — confirmed out of scope for that
  boundary during charter review, but the constitutional reference is recorded here because
  the change does touch `cli/index.mjs`.
- **Pure ESM (Principle 3)** — Applies to the `adev issues board migrate` CLI verb's
  implementation, which lives in `lib/cli/` per the existing per-verb module pattern.
  `lib/cli/issues.mjs`'s existing subcommand dispatcher (`migrate`, `claim`, `release`,
  `stale`, `set-modules`, `next`, `record-attempt`, `show` — 8 subcommands, verified against
  the dispatcher's own `run()` body) gains a `board` branch delegating to a new
  `lib/cli/issues-board.mjs`, the same one-module-per-subcommand pattern every existing
  subcommand already follows.
- **Subprocess safety (established repo-wide convention, not a numbered principle)** —
  Every `git`/`br` invocation this spec introduces uses `execFileSync` with argv arrays,
  never shell-interpolated strings, matching the existing convention in
  `lib/issues/resolve-root.mjs` and `lib/issues/beads-adapter.mjs`. No value in any
  behavior above is externally supplied (branch name and paths are fixed literals), so
  this is not a live escape today, but the convention applies uniformly regardless.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Orphan-branch bootstrap helper | Implement the git sequence behind BEH-2/BEH-3 (detect existing `beads-board` vs. create with `--orphan`) as a reusable helper in `lib/issues/` | small |
| `resolveStorageRoot()` compatibility test | Add a regression test proving BEH-4 (no code change needed, worktree-inside-worktree resolves correctly) rather than assuming it | small |
| **Cross-spec:** add `.beads/` and `.context-index/tasks/.board-migrate-state.json` to `MANAGED_GITIGNORE_PATHS` (`lib/gitignore-paths.mjs`) | Two new frozen-array entries, coordinated with `setup/managed-gitignore-block.spec.md` (the owning spec) — no new mechanism, reuses the existing `ensureManagedBlock()` primitive for both BEH-5 and BEH-7 | small |
| `cli/index.mjs` bootstrap integration | Wire BEH-6 into the existing install flow, calling `ensureManagedBlock(projectRoot)` | medium |
| `lib/cli/issues-board.mjs` + `board` dispatcher branch | Implement BEH-7/BEH-8/BEH-9 — snapshot, branch creation, `main` tree removal, `ensureManagedBlock()` call, worktree re-provisioning (filesystem cleanup + `git worktree prune` + `git worktree add`, run unconditionally before every add attempt — new logic, not reused from `lib/worktree.mjs`, which has no corrupt-recovery path), dry-run, idempotency detection; register the `board` branch in `lib/cli/issues.mjs`'s dispatcher, mirroring how `migrate`/`claim`/etc. each delegate to their own module | large |
| `.context-index/tasks/.board-migrate-state.json` checkpoint | Write/read the resumable checkpoint (push-landed marker), atomic temp-rename write, removed on successful completion — same location convention and lifecycle as the precedent it mirrors, `.context-index/tasks/.migrate-state.json` | medium |
| Error-case coverage | Implement and test every row in the Error Cases table above, including the checkpoint-resume path and the corrupt-leftover-`.beads/`-detection sub-case | medium |

## Acceptance Criteria

- [x] All 9 behaviors (BEH-1 through BEH-9) have passing automated tests
- [x] All 8 error cases have passing automated tests
- [x] `resolveStorageRoot()` is proven compatible with `.beads/` as a linked worktree by a
      real test, not by inspection alone
- [x] `adev issues board migrate` is idempotent: running it twice in a row produces no
      second mutation and no error
- [x] `adev issues board migrate --dry-run` never mutates the repository under any
      precondition state
- [x] A partial/interrupted migration never leaves `main` with `.beads/` removed from its
      tree but not yet gitignored (or vice versa)
- [x] A migration interrupted between `.beads/` removal and worktree re-provisioning is
      recoverable by re-running `adev issues board migrate`, via the
      `.context-index/tasks/.board-migrate-state.json` checkpoint — `.beads/` is never left
      permanently absent
- [x] A corrupt leftover from an interrupted `git worktree add` — either a partial
      `.beads/` directory, a stale `.git/worktrees/.beads` admin entry, or both — is
      cleaned up (filesystem delete + `git worktree prune`) before every re-provisioning
      attempt, so a second interrupted retry never surfaces `BOARD_ALREADY_EXISTS` or an
      `already exists` error from a stale registration
- [x] `.context-index/tasks/.board-migrate-state.json` is removed on successful completion
      of a resumed migration, and is covered by a `MANAGED_GITIGNORE_PATHS` entry so it is
      never committed to `main`
- [x] All quality gates pass (`npm test`)
- [x] No constitutional violations introduced; the CLI-installation-path boundary note
      above is confirmed accurate by implementation, not just asserted
