---
charter: task-management
kind: behavioral
status: review-pending
risk_level: medium
milestone: 5
revision: 1
charter-revision: 9
created: 2026-08-22
updated: 2026-08-22
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
reconciliation of concurrent pushes from independent clones/CI — tracked separately as
`issue-vtj7lp` and covered by the sibling `beads-board-direct-sync` spec, not this one.

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
  tree, adds a `.beads/` entry to `main`'s `.gitignore`, and re-provisions `.beads/` as a
  linked worktree against `beads-board` — leaving the board's logical content unchanged
  and none of `main`'s prior commit history rewritten.
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
| `git worktree add .beads beads-board` run when `.beads/` already exists as a non-empty plain directory (an un-migrated repo) | Fails with git's own "already exists" error; the operator is directed to `adev issues board migrate` instead of a raw `git worktree add` | non-zero |
| `git worktree add .beads beads-board` run when no `beads-board` branch exists yet, locally or on the remote | Fails with git's own "invalid reference" error; the CLI bootstrap flow (BEH-6) must create the orphan branch first via `--orphan` when none is found | non-zero |
| `adev issues board migrate` run on a repo where `.beads/` is already a linked worktree against `beads-board` | No mutation; reports already-migrated (BEH-9) | 0 |
| `adev issues board migrate --dry-run` run on an already-migrated repo | Reports nothing-to-do; no mutation | 0 |
| `adev issues board migrate` run on a repo where `.beads/issues.jsonl` does not exist on `main` at all (nothing to migrate) | Fails with a clear "nothing to migrate" error rather than silently creating an empty `beads-board` | non-zero |
| `br` commands run inside a freshly bootstrapped `.beads/` worktree with no `*.db` present | Falls back to `--no-db` mode per the existing issue-i0ji37 fix — not a new error case; cross-referenced here because BEH-1 depends on it | 0 |
| `adev issues board migrate` fails partway (e.g., interrupted push) | `main`'s tree is left untouched until the final step (removing `.beads/` from `main` and adding the `.gitignore` entry happens only after the `beads-board` push succeeds), so a partial failure never leaves `main` with a missing, un-gitignored `.beads/` | non-zero |

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

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|----------------------|
| Orphan-branch bootstrap helper | Implement the git sequence behind BEH-2/BEH-3 (detect existing `beads-board` vs. create with `--orphan`) as a reusable helper in `lib/issues/` | small |
| `resolveStorageRoot()` compatibility test | Add a regression test proving BEH-4 (no code change needed, worktree-inside-worktree resolves correctly) rather than assuming it | small |
| `main` `.gitignore` provisioning | Add the `.beads/` entry as part of both fresh-install scaffolding and the migration tool | small |
| `cli/index.mjs` bootstrap integration | Wire BEH-6 into the existing install flow | medium |
| `adev issues board migrate` CLI verb | Implement BEH-7/BEH-8/BEH-9 — snapshot, branch creation, `main` tree removal, gitignore edit, worktree re-provisioning, dry-run, idempotency detection | large |
| Error-case coverage | Implement and test every row in the Error Cases table above, including the partial-failure ordering guarantee | medium |

## Acceptance Criteria

- [ ] All 9 behaviors (BEH-1 through BEH-9) have passing automated tests
- [ ] All 7 error cases have passing automated tests
- [ ] `resolveStorageRoot()` is proven compatible with `.beads/` as a linked worktree by a
      real test, not by inspection alone
- [ ] `adev issues board migrate` is idempotent: running it twice in a row produces no
      second mutation and no error
- [ ] `adev issues board migrate --dry-run` never mutates the repository under any
      precondition state
- [ ] A partial/interrupted migration never leaves `main` with `.beads/` removed from its
      tree but not yet gitignored (or vice versa)
- [ ] All quality gates pass (`npm test`)
- [ ] No constitutional violations introduced; the CLI-installation-path boundary note
      above is confirmed accurate by implementation, not just asserted
