---
partial_schema: spec@1
charter: task-management
kind: behavioral
status: review-pending
risk_level: medium
milestone: 5
revision: 1
charter-revision: 9
created: 2026-09-11
updated: 2026-09-11
---

# Live Spec: Beads Board Direct Sync

<!-- Live Spec within the task-management charter.
     This defines a specific behavioral contract that drives implementation and testing.
     Parent Charter: .context-index/specs/features/task-management/charter.md -->

Covers the **Beads Board Direct Sync** capability from the charter's Capability Map
(milestone 5): `adev issues sync --push`, a CLI verb that flushes local board
mutations and pushes them directly to the `beads-board` orphan branch (see
`beads-board-git-topology.spec.md`), no PR, no branch-protection exception, since
nothing merges into `main`. Explicitly single-writer-safe only for this milestone —
safe reconciliation of concurrent pushes from independent clones/CI is a separately
tracked, deferred capability (**Beads Board Concurrent-Write Reconciliation**,
milestone 6, `issue-vtj7lp`) that depends on this capability existing.

## Behavioral Contract

### Preconditions

- The repository's `.beads/` is provisioned as a linked git worktree checked out on
  the `beads-board` orphan branch (via `adev issues board migrate` or a fresh-clone
  bootstrap) — see `beads-board-git-topology.spec.md`.
- `tasks.backend` is configured to the beads adapter in `manifest.yaml`.
- The `br` (beads_rust) binary is present on `PATH`.

### Behaviors

<!-- retired-behavior-ids: (none) -->

- **BEH-1** — **When** an operator or automated process runs `adev issues sync
  --push` with pending local board mutations, **then** the CLI flushes the local
  beads_rust db to `.beads/issues.jsonl` (via `br sync --flush-only`), commits the
  change on `beads-board`, and pushes it to the remote.
- **BEH-2** — **When** `adev issues sync --push` is invoked from any directory
  inside the repository, **then** it resolves the `.beads/` worktree path the same
  way `resolveStorageRoot()` and the board-worktree helpers already do, and
  operates against that worktree directly — the caller does not need to `cd
  .beads` first.
- **BEH-3** — **When** the flushed `issues.jsonl` is byte-identical to the tip of
  `beads-board`, **then** the verb is a no-op: no empty commit is created and no
  push is attempted.
- **BEH-4** — **When** the push is rejected because the remote `beads-board` ref
  has moved since the local worktree last fetched (a non-fast-forward push), **then**
  the verb fails fast with a clear, actionable concurrent-write-conflict error, and
  does not attempt to auto-merge, force-push, or silently discard local changes.
- **BEH-5** — **When** `.beads/` has not been bootstrapped as a linked worktree yet
  (the board is still tracked in `main`'s history), **then** the verb fails fast
  with an error directing the operator to run `adev issues board migrate` first,
  rather than attempting to commit board data onto `main`.
- **BEH-6** — **When** `adev issues sync --push` completes successfully, **then**
  it prints a concise, machine-parseable confirmation (the pushed commit sha, or
  the literal string `nothing to sync`) so calling skills and hooks can log the
  outcome deterministically.
- **BEH-7** — **When** invoked with `--dry-run`, **then** the verb reports what
  would be flushed, committed, and pushed without performing any git-mutating
  operation, mirroring the `--dry-run` convention already used by `adev issues
  board migrate`.

### Postconditions

- On success, the remote `beads-board` branch's tip reflects the same
  `issues.jsonl` content as the local `.beads/` worktree at the moment the verb
  ran.
- `main`'s history is untouched — no commit is ever created outside the
  `beads-board` branch by this verb.
- On failure (BEH-4, BEH-5), the local `.beads/` worktree is left exactly as it
  was before invocation — no partial commit, no partial push.

### Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| `.beads/` is not a linked worktree on `beads-board` (pre-migration state) | Fail fast; message directs to `adev issues board migrate` | 1 |
| Push rejected as non-fast-forward (remote diverged) | Fail fast with concurrent-write-conflict message; no merge, no force-push | 1 |
| `br` binary not found on `PATH` | Fail fast with a missing-dependency error naming `br` | 1 |
| Unexpected foreign (non-board) changes present in the `.beads/` working tree | Fail fast rather than committing unknown content | 1 |
| Network or authentication failure on `git push` | Fail fast, surfacing the underlying git error verbatim | 1 |
| `--dry-run` with no pending mutations | Report `nothing to sync`; no git-mutating operation | 0 |

## System Constitution Reference

- **Principle 1 — Minimize external dependencies:** "prefer Node.js built-ins... Justify any new dependency in an ADR." Applies because this verb wraps the existing `git` and `br` shell-outs via `execFileSync` (the same pattern as `lib/issues/board-worktree.mjs`), introducing no new npm dependency.
- **Principle 3 — Pure ESM:** "all `.mjs` files, `type: module`... No CommonJS." Applies because the new CLI verb and its library module are authored as `.mjs` ESM, consistent with the rest of `lib/issues/` and `lib/cli/`.

## Actionable Task Map

| Task | Description | Estimated Complexity |
|------|-------------|-----------------------|
| Add `sync` sub-verb to `lib/cli/issues.mjs` dispatch | Route `adev issues sync push` (or `--push` flag form, matching existing verb conventions) to a new `lib/cli/issues-sync.mjs` | small |
| Implement flush-commit-push mechanics | `br sync --flush-only`, `git add`/`commit`/`push` against the `.beads/` worktree, resolved via `resolveStorageRoot()` conventions | medium |
| Implement no-op detection (BEH-3) | Diff flushed `issues.jsonl` against `beads-board` tip before committing | small |
| Implement conflict / missing-worktree / missing-`br` error paths (BEH-4, BEH-5, Error Cases) | Fail-fast checks with actionable messages, no auto-recovery | medium |
| Implement `--dry-run` (BEH-7) | Report intended flush/commit/push without mutating | small |
| Tests | Unit + integration coverage for BEH-1..7 and all Error Cases, mirroring `tests/lib/board-worktree.test.mjs` conventions | medium |

## Acceptance Criteria

- [ ] `adev issues sync --push` flushes, commits, and pushes pending board mutations to `beads-board` (BEH-1).
- [ ] The verb resolves and operates against the `.beads/` worktree from any invocation directory (BEH-2).
- [ ] No-op behavior verified: no empty commit or push when nothing changed (BEH-3).
- [ ] Non-fast-forward push rejection fails fast with a concurrent-write-conflict message and performs no merge/force-push (BEH-4).
- [ ] Pre-migration state (no linked worktree) fails fast, directing to `adev issues board migrate` (BEH-5).
- [ ] Successful runs print a deterministic confirmation (pushed sha or `nothing to sync`) (BEH-6).
- [ ] `--dry-run` reports intended actions without mutating anything (BEH-7).
- [ ] All Error Cases in the table above are covered by tests.
- [ ] All quality gates pass (`npm test`).
- [ ] No constitutional violations introduced.
