---
charter: worktree-parallelization
kind: behavioral
status: review-passed
milestone: v1
mode: extract
revision: 2
charter-revision: 2
created: 2026-07-07
updated: 2026-07-07
extracted-from:
  - lib/worktree.mjs
  - lib/cli/worktree.mjs
  - cli/index.mjs
  - tests/lib/worktree.test.mjs
  - tests/cli/worktree.test.mjs
---

# Live Spec: Worktree Primitive

<!-- Extracted from existing code. Describes current behavior as of 2026-07-07
     (branch feat/adev-worktrees). Documents what IS, not what SHOULD BE.
     Covers charter capabilities: worktree-primitive, worktree-cli-verb, serial-fallback. -->

## Behavioral Contract

The worktree primitive lets adev create, enumerate, merge, and remove git worktrees it
manages itself — anchored to the main repository root so they never nest — plus a guard that
reports whether the current directory already sits inside a worktree. It is exposed both as a
library (`lib/worktree.mjs`) and a CLI verb (`adev worktree`).

- **When** `add({ slug, baseRef?, cwd? })` is called with a valid slug and no worktree exists
  at the slug's path **then** a git worktree is created at `<mainRoot>/.adev/worktrees/<slug>`
  on a new branch `adev/<slug>` (from `baseRef`, defaulting to current `HEAD`), and the result
  `{ slug, path, branch, created: true, mainRoot }` is returned.
- **When** `add(...)` is called for a slug whose worktree already exists **then** no new
  worktree is created and the existing record is returned with `created: false` (idempotent).
- **When** `add(...)` is called for a slug whose branch `adev/<slug>` already exists but has no
  worktree **then** the existing branch is checked out into a new worktree (rather than
  re-created).
- **When** `add(...)` is invoked with `cwd` pointing *inside* an existing worktree **then** the
  new worktree is still created at the **main** repository root (`mainRoot`), never nested under
  the invoking worktree. The main root is resolved via `git rev-parse --path-format=absolute
  --git-common-dir` and taking its parent directory.
- **When** `list({ cwd? })` is called **then** it returns only adev-managed worktrees — those
  whose resolved path is under `<mainRoot>/.adev/worktrees/` — each as
  `{ slug, path, branch, head }`, excluding the main checkout and any non-adev worktrees.
- **When** `merge({ slug, cwd?, noFf? })` is called and the branch `adev/<slug>` merges without
  conflict **then** it is merged into the **main root's current branch** (the primitive runs
  `git merge` in the main root, resolved via `resolveMainRoot`, NOT the invoking cwd's branch)
  with `--no-edit` (optional `--no-ff`), and `{ slug, branch, merged: true, conflicts: [] }` is
  returned.
- **When** `merge(...)` encounters a merge conflict **then** the conflicted paths are collected,
  `git merge --abort` is run to leave the working tree clean, and a `WorktreeError` with code
  `MERGE_CONFLICT` is thrown naming the conflicted files. No partial merge state remains.
- **When** `remove({ slug, cwd?, force?, deleteBranch? })` is called **then** the worktree is
  removed via `git worktree remove` (`--force` when requested); when `deleteBranch` is set the
  `adev/<slug>` branch is also deleted (non-fatal if the branch is unmerged or absent).
- **When** `detectNesting(cwd?)` (CLI: `guard`) is called **then** it returns
  `{ nested, kind }` where `kind` is `harness` if the path contains a `.claude/worktrees/`
  segment, `adev` if it contains a `.adev/worktrees/` segment, or `null` otherwise. This lets
  orchestrators fall back to serial execution when already inside a worktree.

## Preconditions

- The current working directory is inside a git repository (git ≥ 2.5 with worktree support).
- `add` / `merge` / `remove` require the invoking user to have write access to the main repo.
- A slug supplied to any slug-taking operation matches `SLUG_RE` (`^[a-z0-9][a-z0-9._-]{0,99}$/i`).

## Postconditions

- A created worktree lives under `<mainRoot>/.adev/worktrees/<slug>` on branch `adev/<slug>`
  and is discoverable by `list`.
- After a successful `merge`, the target branch contains the worktree branch's commits.
- After a conflicting `merge`, the working tree is clean (`git merge --abort` ran) and no
  `MERGE_HEAD` exists.
- After `remove`, the worktree path no longer exists and is absent from `list`.
- No adev-managed worktree is ever nested inside another worktree.

## Error Cases

| Condition | Expected Behavior | Error Code |
|-----------|-------------------|------------|
| Slug fails `SLUG_RE` (empty, `.`, contains `/`, `..`, > 100 chars) | Throws before any git call | `INVALID_SLUG` |
| `git worktree add` fails (e.g., path occupied, dirty) | Throws with git stderr surfaced | `ADD_FAILED` |
| `merge` hits a conflict | Aborts merge, leaves clean tree, throws with conflicted files | `MERGE_CONFLICT` |
| `git worktree remove` fails (e.g., uncommitted changes without `--force`) | Throws with git stderr surfaced | `REMOVE_FAILED` |
| CLI: subcommand missing `--slug` where required | Exit 1, usage on stderr | (argument error) |
| CLI: unknown subcommand | Exit 1, usage on stderr | (argument error) |
| CLI: any `WorktreeError` | Exit 1, `<code>: <message>` on stderr | (verb surfaces `.code`) |

## System Constitution Reference

- **Principle 1 (minimize external dependencies)** — ✓ Compliant. `lib/worktree.mjs` uses only
  Node built-ins (`child_process`, `fs`, `path`) and the `git` binary already required by the
  project. No new npm dependency.
- **Principle 3 (pure ESM)** — ✓ Compliant. `.mjs`, ESM imports/exports throughout.
- **`cli-driver-surface` charter (prose names the work, a `lib/cli/<verb>.mjs` helper does it)** —
  ✓ Compliant. `lib/cli/worktree.mjs` exposes the `run({projectRoot,argv})`/`help()` contract and
  is registered in `cli/index.mjs::VERB_REGISTRY`; the logic lives in `lib/worktree.mjs`.
- **Architecture Boundary "modifying the CLI installation path structure"** — ✓ Not tripped.
  `.adev/worktrees/<slug>` is a runtime working directory; adding `adev worktree` is a dispatch
  verb, not an install-path change.

## Coverage Gaps

<!-- Extract mode: gaps in the CURRENT implementation, to be addressed by downstream specs. -->

- **No `.gitignore` guarantee.** The charter reserves `.adev/worktrees/` as git-ignored, but the
  primitive does not itself ensure the ignore entry exists. (Follow-up: the parallel-implement
  spec or setup should add the managed ignore block.)
- **No stale-worktree recovery verb.** `git worktree prune` is not wrapped; an interrupted run
  can leave a registered-but-missing worktree until a manual prune. (`list` still enumerates via
  git, so recovery is possible but manual.)
- **`merge` targets the main root's HEAD implicitly.** There is no explicit `--into <ref>`; the
  target is wherever the main root's current branch points. Adequate for the orchestrator (which
  controls HEAD) but under-specified for ad-hoc CLI use.
- **No concurrency guard across simultaneous `add` of the same slug.** Two racing `add` calls for
  one slug rely on git's own worktree-add atomicity; not independently serialized.
- **No auto-removal on process death.** Unlike the harness's `isolation:"worktree"`, adev
  worktrees persist until explicitly removed (by design — but the orchestrator must guarantee
  teardown; see the parallel-implement spec's failure semantics).
- **`baseRef` is not validated (SEC-1).** `baseRef` is passed to `git worktree add … <base>` as a
  trailing positional with no `--` separator; a `baseRef` beginning with `-` could be parsed by git
  as an option (argument injection). Low real-world risk (operator-controlled, local CLI), but
  `/adev:implement` should harden this — reject a leading-dash `baseRef` or insert `--` before
  positionals.
- **Non-git-repo cwd surfaces a raw error (SA-2).** If `resolveMainRoot`'s `git rev-parse` fails
  (cwd not in a git repo), the caller sees a raw `execFileSync` error rather than a `WorktreeError`;
  orchestrators cannot pattern-match `.code` on this path. The "cwd is inside a git repository"
  precondition covers intent, but the failure mode is unwrapped.
- **Exposed helpers not enumerated as behaviors (SA-3).** `worktreePathFor`, `resolveMainRoot`, and
  the constants `WORKTREE_SUBDIR` / `BRANCH_PREFIX` are part of the imported surface (charter
  Interface Contracts) but are described only inline here, not as first-class behavior/API lines.

## Acceptance Criteria

- [x] `add` creates a worktree at `<mainRoot>/.adev/worktrees/<slug>` on branch `adev/<slug>`.
- [x] `add` from inside a worktree anchors to the main root and does not nest.
- [x] `add` is idempotent (`created: false` on repeat).
- [x] Invalid/traversal slugs are rejected with `INVALID_SLUG` before any git call.
- [x] `list` returns only adev-managed worktrees.
- [x] `merge` of a non-conflicting branch integrates commits into the target branch.
- [x] `merge` conflict aborts, leaves a clean tree, and throws `MERGE_CONFLICT` naming files.
- [x] `remove` deletes the worktree (and branch with `--delete-branch`).
- [x] `detectNesting`/`guard` classifies `harness` / `adev` / `null` correctly.
- [x] CLI verb emits JSON on stdout and uses exit codes 0 (success) / 1 (error).
- [ ] `.adev/worktrees/` is guaranteed git-ignored (Coverage Gap — deferred).
- [x] All quality gates pass (`npm test`): `tests/lib/worktree.test.mjs` (13) +
      `tests/cli/worktree.test.mjs` (7), all green.
- [x] No constitutional violations.
