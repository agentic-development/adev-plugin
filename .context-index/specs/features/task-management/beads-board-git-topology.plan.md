<!-- partial_schema: plan@1 -->

# Implementation Plan: Beads Board Git Topology

> **Methodology:** adev
> **Charter:** .context-index/specs/features/task-management/charter.md
> **Spec:** .context-index/specs/features/task-management/beads-board-git-topology.spec.md
> **Review:** PASS (2026-08-22)
> **Platform:** JavaScript (ESM), Node.js, node:test

**Goal:** Move the beads backend's board data (`.beads/issues.jsonl`) off `main`'s git history onto a dedicated orphan `beads-board` branch, checked out as a linked `git worktree` at `.beads/`, with one-command fresh-clone bootstrap, automatic CLI-install provisioning, and a one-shot, idempotent, resumable migration tool for this repo's existing `main`-tracked board.

**Architecture:** A new reusable helper (`lib/issues/board-worktree.mjs`) wraps the orphan-branch-vs-existing-branch bootstrap decision (BEH-2/BEH-3) with `execFileSync` argv calls, matching the subprocess-safety convention in `lib/issues/resolve-root.mjs`. `cli/index.mjs`'s existing install/upgrade flow gains a call to this helper alongside its existing `maybeEnsureManagedGitignore` call (BEH-6). A new `lib/cli/issues-board.mjs` module — registered as a `board` sub-verb in `lib/cli/issues.mjs`, mirroring the existing `migrate`/`claim`/`stale` sub-verb pattern — implements `adev issues board migrate` (BEH-7/8/9), reusing the bootstrap helper for re-provisioning and a new checkpoint file (`.context-index/tasks/.board-migrate-state.json`) modeled directly on `backend-migration.spec.md`'s `.migrate-state.json` precedent (same directory, same atomic temp-rename write, same `MANAGED_GITIGNORE_PATHS` registration) to make an interrupted migration resumable. `resolveStorageRoot()` (`lib/issues/resolve-root.mjs`) requires no code change (BEH-4) — Task 2 proves that with a real worktree-inside-worktree test rather than by inspection. No new dependency: every behavior is implemented with `git` and `br`, both already required/optional per the constitution.

---

## File Structure

**Create:**
- `lib/issues/board-worktree.mjs` — Orphan-branch bootstrap helper: detects an existing `beads-board` branch (local or remote) and runs `git worktree add .beads beads-board`, or creates it fresh with `git worktree add --orphan -b beads-board .beads` when none exists. Also owns the corrupt-leftover recovery sequence (filesystem delete → `git worktree prune` → `git worktree add`) used both by fresh bootstrap retries and by the migration tool's re-provisioning step.
- `lib/cli/issues-board-state.mjs` — Read/write/clear helpers for `.context-index/tasks/.board-migrate-state.json`, mirroring `lib/cli/issues-migrate.mjs`'s `.migrate-state.json` pattern (atomic temp-rename write, JSON schema, best-effort clear).
- `lib/cli/issues-board.mjs` — `board` sub-verb implementation: topology detection (`migrated` / `main-tracked` / `nothing`), the `migrate` command (snapshot, orphan-branch creation, push, checkpoint write, `main` tree removal, `ensureManagedBlock()` call, worktree re-provisioning), `--dry-run`, and idempotency detection (BEH-9).
- `tests/lib/board-worktree.test.mjs` — Unit tests for the bootstrap helper: existing-branch path (BEH-2), orphan-creation path (BEH-3), `BOARD_ALREADY_EXISTS` when `.beads/` is a non-empty plain directory, and the corrupt-leftover recovery sequence in isolation.
- `tests/lib/issues-board-state.test.mjs` — Unit tests for the checkpoint helper: write/read round-trip, atomic-write-on-crash safety (temp file never left as the final artifact), and best-effort clear tolerating ENOENT.
- `tests/lib/cli-issues-board-migrate.test.mjs` — Integration tests for `adev issues board migrate` against a real scratch git repo (bare `origin.git` + clone, matching the spec's own prototype-spike methodology): BEH-7 (main-tracked → migrated), BEH-8 (`--dry-run` never mutates), BEH-9 (already-migrated no-op, live and dry-run), all 8 Error Cases table rows including the checkpoint-resume path and the corrupt-leftover-detection sub-case.
- `tests/cli-install-board-bootstrap.test.mjs` — Integration test for the CLI install/upgrade flow provisioning `.beads/` automatically (BEH-6) when `tasks.backend: beads` and a remote `beads-board` branch exist.

**Modify:**
- `lib/gitignore-paths.mjs` — Add two entries to the frozen `MANAGED_GITIGNORE_PATHS` array: `.beads/` (BEH-5) and `.context-index/tasks/.board-migrate-state.json` (BEH-7 checkpoint, mirrors the existing `.migrate-state.json` entry already in the array at line 62-65).
- `lib/cli/issues.mjs:39-108` — Add a `board` branch to the sub-verb dispatcher, delegating to `lib/cli/issues-board.mjs`, following the exact pattern the existing 8 subcommands (`migrate`, `claim`, `release`, `stale`, `set-modules`, `next`, `record-attempt`, `show`) already use. Add a `board` line to `help()`.
- `cli/index.mjs` — Add a `maybeProvisionBoardWorktree(projectRoot, manifest)` function (modeled on the existing `maybeEnsureManagedGitignore` at line 1034) and call it at both existing call sites (`cmdInstall` around line 1250, `cmdUpgrade` around line 1384), immediately after the existing `maybeEnsureManagedGitignore` call.
- `tests/lib/gitignore-paths.test.mjs` — Extend the existing array/dogfood assertions to cover the two new entries.
- `tests/lib/issues-resolve-root.test.mjs` — Extend with a real-git-worktree regression test proving `resolveStorageRoot()` resolves correctly when invoked from inside `.beads/` as a linked worktree (BEH-4).

**Reference (read, do not modify):**
- `lib/issues/resolve-root.mjs` — `resolveStorageRoot()` algorithm (`git rev-parse --path-format=absolute --git-common-dir`); Task 2 proves it needs no change.
- `lib/worktree.mjs` — Existing `add`/`merge`/`remove` primitives for adev's own ephemeral worktrees. Confirmed (by all four review-arc reviewers) to have zero `git worktree prune` calls and no corrupt-recovery path — `board-worktree.mjs`'s recovery sequence is new logic, not extracted from here.
- `lib/gitignore-installer.mjs::ensureManagedBlock` — Idempotent paired-marker block installer; called unconditionally by both the CLI install path and the migration tool.
- `lib/cli/issues-migrate.mjs:32-67,297-389` — `.migrate-state.json` checkpoint precedent: `MIGRATE_STATE_REL` constant, `loadResumeState`/`writeMigrateState`/`clearMigrateState`, local `atomicWriteJson` (temp-rename pattern). `lib/cli/issues-board-state.mjs` mirrors this shape for the simpler single-marker checkpoint this spec needs.
- `lib/issues/beads-adapter.mjs:282-320` — `--no-db` fallback (`_runBr`) that BEH-1 depends on; already shipped for issue-i0ji37, not modified by this spec.
- `cli/index.mjs:1034-1064,1242-1251,1382-1386` — `maybeEnsureManagedGitignore` and its two call sites; the pattern `maybeProvisionBoardWorktree` follows.
- `.context-index/specs/features/task-management/backend-migration.spec.md` (Behaviors 17-18) and its `.plan.md` — the direct precedent for a resumable, checkpointed, idempotent one-shot migration CLI verb.
- `.context-index/specs/features/setup/managed-gitignore-block.spec.md` — Owning spec for `MANAGED_GITIGNORE_PATHS`; this plan's Task 3 is the cross-spec coordination point.

## Context Packets

### Task 1 Context (Orphan-branch bootstrap helper)
- Spec: `beads-board-git-topology.spec.md` (BEH-2, BEH-3, Error Cases rows 1-2)
- Charter: `charter.md` (capability: Beads Board Git Topology)
- Reference: `lib/issues/resolve-root.mjs` (subprocess-safety convention: `execFileSync` argv arrays)
- Reference: `lib/worktree.mjs::add` (existing `git worktree add -b <branch>` pattern, `WorktreeError` class shape)
- Review: `beads-board-git-topology.review.md` (revision 3-4 arc: `lib/worktree.mjs` confirmed to have no `prune` call or corrupt-recovery path)

### Task 2 Context (`resolveStorageRoot()` compatibility test)
- Spec: `beads-board-git-topology.spec.md` (BEH-4)
- Source: `lib/issues/resolve-root.mjs::resolveStorageRoot` (full read — algorithm under test)
- Existing suite: `tests/lib/issues-resolve-root.test.mjs` (extend, do not replace)
- Dependency: Task 1's helper, to provision the `.beads/` worktree fixture the test inspects

### Task 3 Context (`MANAGED_GITIGNORE_PATHS` additions — cross-spec)
- Spec: `beads-board-git-topology.spec.md` (BEH-5, BEH-7 checkpoint gitignore requirement)
- Source: `lib/gitignore-paths.mjs` (full read — frozen array + SEC-3 invariants)
- Existing suite: `tests/lib/gitignore-paths.test.mjs` (extend)
- Cross-cutting: `.context-index/specs/features/setup/managed-gitignore-block.spec.md` (owning spec for the array's convention)

### Task 4 Context (`cli/index.mjs` bootstrap integration)
- Spec: `beads-board-git-topology.spec.md` (BEH-6)
- Source: `cli/index.mjs:1034-1064` (`maybeEnsureManagedGitignore` — the pattern to mirror), `cli/index.mjs:1242-1251,1382-1386` (both call sites)
- Constitution: Architecture Boundaries — CLI-installation-path boundary note (confirmed out of scope for `~/.claude/` layout; this change is project-local `.beads/` provisioning only)
- Dependency: Task 1's helper (`lib/issues/board-worktree.mjs`)

### Task 5 Context (`.board-migrate-state.json` checkpoint helper)
- Spec: `beads-board-git-topology.spec.md` (Error Cases row 8, Acceptance Criteria: checkpoint removed on success, gitignored)
- Reference: `lib/cli/issues-migrate.mjs:32-67,297-389` (direct precedent — `MIGRATE_STATE_REL`, `loadResumeState`, `writeMigrateState`, `clearMigrateState`)
- Dependency: Task 3 (checkpoint path must be in `MANAGED_GITIGNORE_PATHS` before this ships, so a stray checkpoint is never accidentally committable)

### Task 6 Context (`lib/cli/issues-board.mjs` — migrate core: snapshot, branch, push, main-tree removal)
- Spec: `beads-board-git-topology.spec.md` (BEH-7, BEH-8, BEH-9, Error Cases rows 3-6, Postconditions)
- Reference: `lib/gitignore-installer.mjs::ensureManagedBlock` (the shared call BEH-5 and BEH-7 both make)
- Reference: `lib/issues/resolve-root.mjs::resolveStorageRoot` (storage root resolution used to locate the pre-migration `issues.jsonl`)
- Dependency: Task 1 (bootstrap helper for re-provisioning), Task 3 (gitignore entries), Task 5 (checkpoint helper)

### Task 7 Context (corrupt-recovery sequence + checkpoint-driven resume)
- Spec: `beads-board-git-topology.spec.md` (Error Cases row 8 — `BOARD_MIGRATE_PARTIAL_FAILURE`, full recovery-sequence description; Acceptance Criteria on corrupt-leftover cleanup)
- Review: `beads-board-git-topology.review.md` (revision 4's targeted change — all four reviewers independently verified the delete→prune→add ordering and that `lib/worktree.mjs::remove()` has no equivalent)
- Dependency: Task 6 (extends the same module), Task 1 (recovery sequence lives in `board-worktree.mjs`, consumed by `issues-board.mjs`)

### Task 8 Context (`board` dispatcher registration + CLI wiring)
- Spec: `beads-board-git-topology.spec.md` (Interface Contracts: `adev issues board migrate` CLI verb)
- Reference: `lib/cli/issues.mjs:39-108` (dispatcher pattern — 8 existing subcommands to mirror exactly)
- Dependency: Task 6, Task 7 (the module being dispatched to)

### Task 9 Context (error-case coverage sweep)
- Spec: `beads-board-git-topology.spec.md` (full Error Cases table, all 8 rows; full Acceptance Criteria list)
- Dependency: Task 2, Task 4, Task 8 (exercises the fully-wired CLI surface)

### Task 10 Context (full quality gate + acceptance sign-off)
- Spec: `beads-board-git-topology.spec.md` (Acceptance Criteria: "All quality gates pass (`npm test`)")
- Constitution: Quality Gates section (`npm test`)
- Dependency: all prior tasks

## Parallelization

- Group A (foundation, sequential): Task 1 (bootstrap helper)
- Group B (independent, parallel with A): Task 3 (gitignore-paths array), Task 5 (checkpoint helper) — no file overlap with Task 1 or each other
- Group C (sequential, after A): Task 2 (resolveStorageRoot test — needs Task 1's helper to provision its fixture worktree), Task 4 (CLI bootstrap integration — needs Task 1's helper; benefits from Task 3 landing first so the existing `maybeEnsureManagedGitignore` call picks up the new `.beads/` entry, but does not hard-block on it)
- Group D (sequential, after A + B): Task 6 → Task 7 (same file, `lib/cli/issues-board.mjs`) → Task 8 (dispatcher wiring, depends on the finished module)
- Group E (after C + D): Task 9 (error-case sweep — exercises the fully-wired CLI surface from Task 8, plus regression coverage from Task 2 and Task 4)
- Group F (after everything): Task 10 (full `npm test` run)

Groups B can run fully in parallel with Group A. Group C's two tasks can run in parallel with each other once Group A finishes.

## Task Summary

| # | Title | Complexity | Strategy | Depends On | Files |
|---|-------|-----------|----------|------------|-------|
| 1 | Orphan-branch bootstrap helper | small | unit | — | 2 create |
| 2 | `resolveStorageRoot()` compatibility test | small | unit | Task 1 | 0 create, 1 modify |
| 3 | `MANAGED_GITIGNORE_PATHS` additions | small | unit | — | 0 create, 2 modify |
| 4 | `cli/index.mjs` bootstrap integration | medium | unit | Task 1, Task 3 | 1 create, 1 modify |
| 5 | `.board-migrate-state.json` checkpoint helper | small | unit | Task 3 | 2 create |
| 6 | `lib/cli/issues-board.mjs` migrate core | large | unit | Task 1, Task 3, Task 5 | 2 create |
| 7 | Corrupt-recovery sequence + checkpoint resume | medium | unit | Task 6 | 0 create, 1 modify (extends Task 6's files) |
| 8 | `board` dispatcher registration | small | unit | Task 6, Task 7 | 0 create, 1 modify |
| 9 | Error-case coverage sweep | medium | unit | Task 2, Task 4, Task 8 | 0 create, up to 3 modify |
| 10 | Full quality gate run | small | unit | Task 1-9 | 0 create, 0 modify |

## Strategy Summary

Omitted — every task resolves to `unit` (source: fallback, confidence: high). No `test_strategies` manifest entry or spec-declared `test_strategy` applies; all behaviors are exercised via `node:test` against real scratch git repos (matching the spec's own prototype-spike methodology, not mocks), which is still an automated unit-level suite runnable under `npm test`.

## Task Structure

### Task 1: Orphan-branch bootstrap helper [specialist: none]

**Charter capability:** Beads Board Git Topology
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Create: `lib/issues/board-worktree.mjs`
- Test: `tests/lib/board-worktree.test.mjs`

**Tests:** `tests/lib/board-worktree.test.mjs` (create — behavior suite for BEH-2/BEH-3)

**Context to load:**
- `lib/issues/resolve-root.mjs` (subprocess-safety convention)
- `lib/worktree.mjs::add` (existing worktree-add pattern, `WorktreeError` shape)

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionBoardWorktree, BoardWorktreeError } from "../../lib/issues/board-worktree.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

describe("provisionBoardWorktree", () => {
  let repo;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "board-wt-"));
    git(["init", "-q"], repo);
    git(["commit", "--allow-empty", "-q", "-m", "init"], repo);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("creates an orphan beads-board branch when none exists (BEH-3)", () => {
    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "orphan");
    assert.equal(result.created, true);
    const branches = git(["branch", "--list", "beads-board"], repo);
    assert.match(branches, /beads-board/);
  });

  it("uses the existing beads-board branch when one is already present (BEH-2)", () => {
    git(["worktree", "add", "--orphan", "-b", "beads-board", ".beads-tmp"], repo);
    git(["worktree", "remove", "--force", ".beads-tmp"], repo);
    const result = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(result.mode, "existing-branch");
  });

  it("throws BOARD_ALREADY_EXISTS when .beads/ is a non-empty plain directory", () => {
    mkdtempSync(join(repo, ".beads"));
    // ...write a file into it, then assert throw with code BOARD_ALREADY_EXISTS
    assert.throws(() => provisionBoardWorktree({ projectRoot: repo }), (err) => {
      assert.ok(err instanceof BoardWorktreeError);
      assert.equal(err.code, "BOARD_ALREADY_EXISTS");
      return true;
    });
  });

  it("is idempotent: re-running against an already-provisioned .beads/ returns already-provisioned instead of failing (review finding)", () => {
    provisionBoardWorktree({ projectRoot: repo }); // first call: creates orphan
    const second = provisionBoardWorktree({ projectRoot: repo }); // second call: repeat install/upgrade
    assert.equal(second.mode, "already-provisioned");
    assert.equal(second.created, false);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/board-worktree.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/issues/board-worktree.mjs'`

- [ ] **Implement**

```javascript
// lib/issues/board-worktree.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BOARD_BRANCH = "beads-board";
const BOARD_DIR = ".beads";

export class BoardWorktreeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BoardWorktreeError";
    this.code = code;
  }
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function branchExists(cwd, ref) {
  try {
    git(["rev-parse", "--verify", "--quiet", ref], cwd);
    return true;
  } catch {
    return false;
  }
}

function isRegisteredWorktree(cwd, absPath) {
  try {
    const out = git(["worktree", "list", "--porcelain"], cwd);
    return out.split("\n").some((l) => l === `worktree ${absPath}`);
  } catch {
    return false;
  }
}

/** Delete-then-prune corrupt-leftover recovery, run unconditionally before every re-provisioning add. */
export function recoverBeforeAdd({ projectRoot }) {
  const boardPath = join(projectRoot, BOARD_DIR);
  if (existsSync(boardPath)) {
    rmSync(boardPath, { recursive: true, force: true });
  }
  try {
    git(["worktree", "prune"], projectRoot);
  } catch {
    /* best-effort */
  }
}

export function provisionBoardWorktree({ projectRoot }) {
  const boardPath = join(projectRoot, BOARD_DIR);

  // Idempotency (review finding): an already-provisioned .beads/ must return a
  // no-op result, not fall through to `git worktree add`, which fails against
  // an already-registered path and would otherwise be mislabeled
  // BOARD_NO_BRANCH by the catch block below. This is what makes calling this
  // helper unconditionally on every `adev install`/`adev upgrade` (Task 4)
  // safe to repeat.
  if (existsSync(boardPath) && isRegisteredWorktree(projectRoot, boardPath)) {
    return { mode: "already-provisioned", created: false };
  }

  if (existsSync(boardPath) && !isRegisteredWorktree(projectRoot, boardPath)) {
    const contents = readdirSync(boardPath);
    if (contents.length > 0) {
      throw new BoardWorktreeError(
        "BOARD_ALREADY_EXISTS",
        `${boardPath} already exists as a non-empty plain directory. Run 'adev issues board migrate' instead.`,
      );
    }
  }

  const hasLocal = branchExists(projectRoot, `refs/heads/${BOARD_BRANCH}`);
  const hasRemote = branchExists(projectRoot, `refs/remotes/origin/${BOARD_BRANCH}`);

  if (hasLocal || hasRemote) {
    try {
      git(["worktree", "add", BOARD_DIR, BOARD_BRANCH], projectRoot);
    } catch (err) {
      throw new BoardWorktreeError(
        "BOARD_NO_BRANCH",
        `git worktree add failed: ${err.stderr?.toString?.().trim() || err.message}`,
      );
    }
    return { mode: "existing-branch", created: true };
  }

  git(["worktree", "add", "--orphan", "-b", BOARD_BRANCH, BOARD_DIR], projectRoot);
  return { mode: "orphan", created: true };
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/board-worktree.test.mjs`
Expected: PASS

- [ ] **Commit**

Branch: `feat/task-management/beads-board-git-topology`

```bash
git add lib/issues/board-worktree.mjs tests/lib/board-worktree.test.mjs
git commit -m "feat(lib): add orphan-branch bootstrap helper for beads board worktree

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 1"
```

---

### Task 2: `resolveStorageRoot()` compatibility regression test [specialist: none]

**Charter capability:** Beads Board Git Topology
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1
**Files:**
- Modify: `tests/lib/issues-resolve-root.test.mjs`

**Tests:** `tests/lib/issues-resolve-root.test.mjs` (extend — existing suite, per-behavior granularity)

**Context to load:**
- `lib/issues/resolve-root.mjs::resolveStorageRoot` (full read)
- `lib/issues/board-worktree.mjs::provisionBoardWorktree` (Task 1's helper, used to build the fixture)

- [ ] **Write failing test**

```javascript
it("resolves the main repo root from inside a .beads/ linked worktree (BEH-4)", () => {
  const repo = mkdtempSync(join(tmpdir(), "resolve-root-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], { cwd: repo });
  provisionBoardWorktree({ projectRoot: repo });

  const resolved = resolveStorageRoot(undefined, join(repo, ".beads"));
  assert.equal(realpathSync(resolved), realpathSync(repo));
});
```

Add this alongside the existing manifest-override and cwd-fallback cases already in the file — do not replace them.

- [ ] **Verify test fails**

Run: `node --test tests/lib/issues-resolve-root.test.mjs`
Expected: FAIL until Task 1 lands (module-not-found) or, once Task 1 is merged, the test itself is new so it must be confirmed absent before this task's implement step — since no code change is expected, "fail" here means "test doesn't exist yet."

- [ ] **Implement**

No production code change. `resolveStorageRoot()` already walks up via `git rev-parse --path-format=absolute --git-common-dir`, which resolves identically whether invoked from `.beads/` (a linked worktree) or any other linked worktree of the same repo — the linked-worktree topology this spec introduces is exactly the case that algorithm already handles. This step is "confirm the test is correct and needs no source change," not "write new source."

- [ ] **Verify test passes**

Run: `node --test tests/lib/issues-resolve-root.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add tests/lib/issues-resolve-root.test.mjs
git commit -m "test(lib): prove resolveStorageRoot compatibility with .beads/ linked worktree

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 2"
```

---

### Task 3: `MANAGED_GITIGNORE_PATHS` additions [specialist: none]

**Charter capability:** Beads Board Git Topology
**Strategy:** unit (source: fallback, confidence: high)
**Files:**
- Modify: `lib/gitignore-paths.mjs`
- Modify: `tests/lib/gitignore-paths.test.mjs`

**Tests:** `tests/lib/gitignore-paths.test.mjs` (extend)

**Context to load:**
- `lib/gitignore-paths.mjs` (full read — SEC-3 invariants apply to new entries too)
- `.context-index/specs/features/setup/managed-gitignore-block.spec.md`

- [ ] **Write failing test**

```javascript
it("includes .beads/ and the board-migrate checkpoint in MANAGED_GITIGNORE_PATHS", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  assert.ok(paths.includes(".beads/"));
  assert.ok(paths.includes(".context-index/tasks/.board-migrate-state.json"));
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/gitignore-paths.test.mjs`
Expected: FAIL — assertion fails, entries not present

- [ ] **Implement**

Add two entries to `MANAGED_GITIGNORE_PATHS` in `lib/gitignore-paths.mjs`, alongside the existing `.migrate-state.json` entry:

```javascript
  { path: ".beads/", comment: "beads board — linked git worktree against beads-board, not main's tree" },
  {
    path: ".context-index/tasks/.board-migrate-state.json",
    comment: "board-migrate resume checkpoint",
  },
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/gitignore-paths.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/gitignore-paths.mjs tests/lib/gitignore-paths.test.mjs
git commit -m "feat(lib): register .beads/ and board-migrate checkpoint in managed gitignore

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 3"
```

---

### Task 4: `cli/index.mjs` bootstrap integration [specialist: none]

**Charter capability:** Beads Board Git Topology
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3
**Files:**
- Create: `tests/cli-install-board-bootstrap.test.mjs`
- Modify: `cli/index.mjs` (new `maybeProvisionBoardWorktree` function + two call sites near lines 1250 and 1384)

**Tests:** `tests/cli-install-board-bootstrap.test.mjs` (create)

**Context to load:**
- `cli/index.mjs:1034-1064` (`maybeEnsureManagedGitignore` — pattern to mirror)
- `cli/index.mjs:1242-1251,1382-1386` (both call sites)
- Constitution: Architecture Boundaries (CLI-installation-path boundary — confirmed out of scope; this touches project-local `.beads/` provisioning only)

- [ ] **Write failing test**

```javascript
it("provisions .beads/ as a linked worktree on install when tasks.backend is beads and a beads-board branch exists on origin", () => {
  // Scratch bare origin + clone fixture, origin already has beads-board branch.
  // Run `node cli/index.mjs install` (or invoke maybeProvisionBoardWorktree directly)
  // against the clone with manifest { tasks: { backend: "beads" } }.
  // Assert .beads/ exists and `git worktree list` includes it.
});

it("running install/upgrade a second time against an already-provisioned repo is a silent no-op (review finding)", async () => {
  // Provision once (as above), capture console.log output, then call
  // maybeProvisionBoardWorktree a second time and assert: no "warn:" line is
  // printed, .beads/ is untouched, and the function does not throw.
});
```

- [ ] **Verify test fails**

Run: `node --test tests/cli-install-board-bootstrap.test.mjs`
Expected: FAIL — `.beads/` not provisioned, no such function exported

- [ ] **Implement**

Add to `cli/index.mjs`, mirroring `maybeEnsureManagedGitignore`:

```javascript
export async function maybeProvisionBoardWorktree(projectRoot, manifest) {
  if (manifest?.tasks?.backend !== "beads") return;
  let provisionBoardWorktree;
  try {
    const mod = await import("../lib/issues/board-worktree.mjs");
    provisionBoardWorktree = mod.provisionBoardWorktree;
  } catch {
    return; // module not present — skip silently
  }
  try {
    const result = provisionBoardWorktree({ projectRoot });
    if (result.mode === "already-provisioned") {
      // Silent no-op on repeat install/upgrade — nothing changed (review finding).
      return;
    }
    console.log(`beads board worktree: ${result.mode} (provisioned)`);
  } catch (err) {
    if (err?.code === "BOARD_ALREADY_EXISTS") return; // un-migrated repo — leave for `adev issues board migrate`
    console.error(`warn: beads board worktree provisioning skipped: ${err.message}`);
  }
}
```

Call it at both existing `maybeEnsureManagedGitignore` sites, right after the existing call:

```javascript
await maybeEnsureManagedGitignore(process.cwd(), m);
await maybeProvisionBoardWorktree(process.cwd(), m);
```

- [ ] **Verify test passes**

Run: `node --test tests/cli-install-board-bootstrap.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add cli/index.mjs tests/cli-install-board-bootstrap.test.mjs
git commit -m "feat(cli): auto-provision beads board worktree on install/upgrade

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 4"
```

---

### Task 5: `.board-migrate-state.json` checkpoint helper [specialist: none]

**Charter capability:** Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 3
**Files:**
- Create: `lib/cli/issues-board-state.mjs`
- Test: `tests/lib/issues-board-state.test.mjs`

**Tests:** `tests/lib/issues-board-state.test.mjs` (create)

**Context to load:**
- `lib/cli/issues-migrate.mjs:32-67,297-389` (direct precedent: `MIGRATE_STATE_REL`, `loadResumeState`, `writeMigrateState`, `clearMigrateState`, local `atomicWriteJson`)

- [ ] **Write failing test**

```javascript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeBoardMigrateCheckpoint,
  readBoardMigrateCheckpoint,
  clearBoardMigrateCheckpoint,
} from "../../lib/cli/issues-board-state.mjs";

describe("board-migrate checkpoint", () => {
  let root;
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), "board-state-"))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("round-trips a written checkpoint", () => {
    writeBoardMigrateCheckpoint(root, { step: "push-landed" });
    const read = readBoardMigrateCheckpoint(root);
    assert.equal(read.step, "push-landed");
  });

  it("returns null when no checkpoint exists", () => {
    assert.equal(readBoardMigrateCheckpoint(root), null);
  });

  it("clear tolerates a missing file", () => {
    assert.doesNotThrow(() => clearBoardMigrateCheckpoint(root));
  });

  it("clear removes a written checkpoint", () => {
    writeBoardMigrateCheckpoint(root, { step: "push-landed" });
    clearBoardMigrateCheckpoint(root);
    assert.equal(readBoardMigrateCheckpoint(root), null);
  });
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/issues-board-state.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/issues-board-state.mjs'`

- [ ] **Implement**

```javascript
// lib/cli/issues-board-state.mjs
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const STATE_REL = join(".context-index", "tasks", ".board-migrate-state.json");

function atomicWriteJson(filePath, data) {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function writeBoardMigrateCheckpoint(projectRoot, data) {
  atomicWriteJson(join(projectRoot, STATE_REL), { ...data, written_at: new Date().toISOString() });
}

export function readBoardMigrateCheckpoint(projectRoot) {
  const path = join(projectRoot, STATE_REL);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function clearBoardMigrateCheckpoint(projectRoot) {
  const path = join(projectRoot, STATE_REL);
  try {
    unlinkSync(path);
  } catch {
    /* tolerate ENOENT */
  }
}
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/issues-board-state.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-board-state.mjs tests/lib/issues-board-state.test.mjs
git commit -m "feat(cli): add board-migrate resumable checkpoint helper

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 5"
```

---

### Task 6: `lib/cli/issues-board.mjs` — migrate core [specialist: none]

**Charter capability:** Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 3, Task 5
**Files:**
- Create: `lib/cli/issues-board.mjs`
- Test: `tests/lib/cli-issues-board-migrate.test.mjs`

**Tests:** `tests/lib/cli-issues-board-migrate.test.mjs` (create — behavior suite for BEH-7/BEH-8/BEH-9)

**Context to load:**
- `lib/gitignore-installer.mjs::ensureManagedBlock`
- `lib/issues/board-worktree.mjs` (Task 1's helper)
- `lib/cli/issues-board-state.mjs` (Task 5's checkpoint helper)

- [ ] **Write failing test**

```javascript
it("migrates a main-tracked .beads/issues.jsonl onto beads-board (BEH-7)", async () => {
  // Scratch repo: main has .beads/issues.jsonl tracked with sample content, a
  // configured `origin` remote (bare repo).
  const { run } = await import("../../lib/cli/issues-board.mjs");
  const code = await run({ projectRoot: repo, argv: ["migrate"], manifest: { tasks: { backend: "beads" } } });
  assert.equal(code, 0);
  // .beads/ is a linked worktree against beads-board with the same content
  // main no longer tracks .beads/issues.jsonl
  // main's .gitignore contains .beads/
});

it("--dry-run reports planned steps without mutating (BEH-8)", async () => { /* ... */ });

it("reports BOARD_ALREADY_MIGRATED as a no-op when already migrated (BEH-9)", async () => { /* ... */ });

it("BOARD_NOTHING_TO_MIGRATE when .beads/issues.jsonl does not exist on main", async () => { /* ... */ });

it("a checkpoint from a mid-migration interruption is consulted BEFORE topology detection (iteration-2 review finding)", async () => {
  // Reproduces the exact ambiguous state: main-tree-cleanup has already
  // committed (.beads/issues.jsonl no longer tracked in HEAD) but
  // re-provisioning hasn't run yet, so .beads/ is also not yet a registered
  // worktree. Write a checkpoint by hand to represent this, matching what
  // the live code path leaves behind between its cleanup commit and its
  // provisionBoardWorktree() call.
  writeBoardMigrateCheckpoint(repo, { step: "push-landed" });
  // (git rm -r --cached .beads already committed on `repo` by test setup —
  // main's HEAD has no .beads/issues.jsonl blob, .beads/ dir absent on disk.)
  const { run } = await import("../../lib/cli/issues-board.mjs");
  const code = await run({ projectRoot: repo, argv: ["migrate"], manifest: {} });
  // Must NOT fall through detectTopology()'s "nothing" branch and return
  // BOARD_NOTHING_TO_MIGRATE — the checkpoint must short-circuit straight to
  // recovery + re-provisioning instead.
  assert.equal(code, 0);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: FAIL — `Cannot find module '../../lib/cli/issues-board.mjs'`

- [ ] **Implement**

```javascript
// lib/cli/issues-board.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { ensureManagedBlock } from "../gitignore-installer.mjs";
import { provisionBoardWorktree, recoverBeforeAdd, BoardWorktreeError } from "../issues/board-worktree.mjs";
import {
  writeBoardMigrateCheckpoint,
  readBoardMigrateCheckpoint,
  clearBoardMigrateCheckpoint,
} from "./issues-board-state.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function detectTopology(projectRoot) {
  const boardPath = join(projectRoot, ".beads");
  const isWorktree = (() => {
    try {
      const out = git(["worktree", "list", "--porcelain"], projectRoot);
      return out.split("\n").includes(`worktree ${boardPath}`);
    } catch {
      return false;
    }
  })();
  if (isWorktree) return "migrated";

  const trackedInMain = (() => {
    try {
      return git(["ls-tree", "-r", "--name-only", "HEAD", "--", ".beads/issues.jsonl"], projectRoot).length > 0;
    } catch {
      return false;
    }
  })();
  return trackedInMain ? "main-tracked" : "nothing";
}

export function help() {
  console.log("Usage: adev issues board <migrate> [--dry-run]");
}

export async function run({ projectRoot, argv, manifest }) {
  const sub = argv?.[0];
  if (sub !== "migrate") {
    help();
    return 1;
  }
  const dryRun = argv.includes("--dry-run");

  // Checkpoint check comes FIRST, before topology detection (iteration-2
  // review finding). Once main-tree-cleanup has committed but re-provisioning
  // hasn't finished yet, .beads/ is neither a registered worktree (isWorktree
  // === false) NOR tracked in main's index anymore (trackedInMain === false)
  // — detectTopology() alone cannot tell that apart from "never migrated" and
  // would wrongly return "nothing", short-circuiting into BOARD_NOTHING_TO_MIGRATE
  // before the checkpoint is ever consulted. The checkpoint is the
  // authoritative signal for "push landed AND main's tree is already clean";
  // when present, skip topology detection entirely and go straight to
  // recovery + re-provisioning.
  const checkpoint = readBoardMigrateCheckpoint(projectRoot);
  if (checkpoint) {
    if (dryRun) {
      console.log("Dry run: a resumable migration checkpoint exists — would recover and re-provision .beads/ only (main's tree is already clean).");
      return 0;
    }
    recoverBeforeAdd({ projectRoot });
    try {
      provisionBoardWorktree({ projectRoot });
    } catch (err) {
      if (err instanceof BoardWorktreeError) {
        console.error(`BOARD_MIGRATE_PARTIAL_FAILURE: ${err.message}`);
        return 1;
      }
      throw err;
    }
    clearBoardMigrateCheckpoint(projectRoot);
    console.log("Migrated .beads/ to the beads-board linked-worktree topology (resumed from checkpoint).");
    return 0;
  }

  // No checkpoint: this is either a fresh invocation or a fully-completed
  // prior one. Topology detection is meaningful here because it isn't the
  // no-man's-land the checkpoint branch above exists to handle.
  const topology = detectTopology(projectRoot);

  if (topology === "migrated") {
    console.log("BOARD_ALREADY_MIGRATED: .beads/ is already a linked worktree against beads-board. Nothing to do.");
    return 0;
  }
  if (topology === "nothing") {
    console.error("BOARD_NOTHING_TO_MIGRATE: .beads/issues.jsonl is not tracked on main. Nothing to migrate.");
    return 1;
  }
  if (dryRun) {
    console.log("Dry run: would create beads-board, snapshot .beads/issues.jsonl, remove it from main, update .gitignore, and re-provision .beads/ as a linked worktree.");
    return 0;
  }

  // topology === "main-tracked", no checkpoint: run the full snapshot ->
  // branch -> push -> main-tree-cleanup sequence exactly once.
  const snapshot = readFileSync(join(projectRoot, ".beads", "issues.jsonl"));
  const tmpWorktree = join(projectRoot, ".beads-migrate-tmp");
  git(["worktree", "add", "--orphan", "-b", "beads-board", ".beads-migrate-tmp"], projectRoot);
  writeFileSync(join(tmpWorktree, "issues.jsonl"), snapshot);
  git(["add", "issues.jsonl"], tmpWorktree);
  git(["commit", "-m", "chore: snapshot board content from main"], tmpWorktree);
  git(["push", "origin", "beads-board"], tmpWorktree);
  git(["worktree", "remove", "--force", ".beads-migrate-tmp"], projectRoot);
  // Checkpoint written immediately after push succeeds — this is the single
  // durable marker a subsequent invocation reads (via the branch above) to
  // know main-tree cleanup is safe to skip re-running.
  writeBoardMigrateCheckpoint(projectRoot, { step: "push-landed" });

  // main tree cleanup — runs exactly once, immediately after the push
  // succeeded. A subsequent invocation never reaches this code path again:
  // it short-circuits into the checkpoint branch at the top of this function.
  git(["rm", "-r", "--cached", ".beads"], projectRoot);
  ensureManagedBlock(projectRoot);
  git(["add", ".gitignore"], projectRoot);
  git(["commit", "-m", "chore: move beads board off main onto beads-board branch"], projectRoot);

  recoverBeforeAdd({ projectRoot });
  try {
    provisionBoardWorktree({ projectRoot });
  } catch (err) {
    if (err instanceof BoardWorktreeError) {
      console.error(`BOARD_MIGRATE_PARTIAL_FAILURE: ${err.message}`);
      return 1;
    }
    throw err;
  }
  clearBoardMigrateCheckpoint(projectRoot);
  console.log("Migrated .beads/ to the beads-board linked-worktree topology.");
  return 0;
}

export default { run, help };
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-board.mjs tests/lib/cli-issues-board-migrate.test.mjs
git commit -m "feat(cli): implement adev issues board migrate core

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 6"
```

---

### Task 7: Corrupt-recovery sequence + checkpoint-driven resume [specialist: none]

**Charter capability:** Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6
**Files:**
- Modify: `lib/cli/issues-board.mjs` (checkpoint-driven resume path)
- Modify: `tests/lib/cli-issues-board-migrate.test.mjs`

**Tests:** `tests/lib/cli-issues-board-migrate.test.mjs` (extend)

**Context to load:**
- Spec Error Cases row 8 (full recovery-sequence description)
- `lib/issues/board-worktree.mjs::recoverBeforeAdd` (Task 1 — already implements delete→prune; Task 6's implement step now gates the entire main-tree-cleanup block behind `if (!checkpoint)`, per the plan-review fix)

**Primary deliverable (plan-review finding):** Task 6's `run()` already gates snapshot/branch/push AND main-tree-cleanup behind a single `if (!checkpoint)` block. This task's job is to prove that gating is correct with a real resumed-invocation test — a resumed invocation must NOT re-run `git rm --cached .beads`, `ensureManagedBlock`, or the cleanup commit, since all three are guaranteed already done once the checkpoint exists. The corrupt-leftover recovery-sequence ordering (delete → prune → add) is a secondary check: Task 1 already implements it in `recoverBeforeAdd`, and Task 6 already calls it unconditionally before every `provisionBoardWorktree` attempt — this task verifies that call fires on the resumed path too.

- [ ] **Write failing test**

```javascript
it("resumes from a checkpoint without re-touching main's tree (plan-review fix)", async () => {
  // Set up a repo where the push has already landed (write a
  // .board-migrate-state.json checkpoint by hand) and main's tree has
  // ALREADY been cleaned (.beads/ removed from the index, .gitignore
  // already updated, cleanup commit already made) — i.e. exactly the state
  // Task 6's `if (!checkpoint)` block leaves behind. Record the current
  // HEAD sha and the current .gitignore content before calling run().
  const beforeHead = git(["rev-parse", "HEAD"], repo);
  const beforeGitignore = readFileSync(join(repo, ".gitignore"), "utf8");

  const { run } = await import("../../lib/cli/issues-board.mjs");
  const code = await run({ projectRoot: repo, argv: ["migrate"], manifest: {} });
  assert.equal(code, 0);

  // main's tree must be untouched by this invocation: no new commit, no
  // second git rm --cached attempt (which would throw or no-op-commit).
  assert.equal(git(["rev-parse", "HEAD"], repo), beforeHead);
  assert.equal(readFileSync(join(repo, ".gitignore"), "utf8"), beforeGitignore);
  // .beads/ is now a clean, valid linked worktree; checkpoint file removed.
});

it("resumes from a checkpoint left by an interrupted migration, skipping snapshot/branch/push (Error Cases row 8)", async () => {
  // Same setup as above but assert .beads/ ends up as a valid worktree and
  // a second interrupted retry does not surface BOARD_ALREADY_EXISTS.
});

it("a second corrupt-leftover retry never surfaces a stale-registration error", async () => {
  // Run migrate, kill mid-reprovision (simulate by leaving a stale .beads/
  // dir + stale worktree admin entry), run migrate again — must succeed.
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: without Task 6's plan-review fix applied, the first test fails — `HEAD` moves (a second cleanup commit is attempted) or the run throws on `git rm --cached` against an already-untracked path. With Task 6's fix already in place (this plan bakes it into Task 6's own implement step), confirm this test is the one that would have caught the regression, then proceed to verify the fix holds.

- [ ] **Implement**

No further production change beyond what Task 6 already implements — this task is the regression test that locks in the fix. If the test in fact fails against the code from Task 6, the bug is that `run()`'s `if (!checkpoint)` guard does not fully enclose the `git rm`/`ensureManagedBlock`/commit block; move those three calls inside the guard (see Task 6's Implement step, which already shows the corrected structure). Separately, confirm `recoverBeforeAdd({ projectRoot })` in `lib/cli/issues-board.mjs::run` executes unconditionally immediately before every `provisionBoardWorktree` call — including on this resumed path — matching the spec's exact ordering: (1) filesystem delete of any existing `.beads/` (not `git worktree remove`), (2) `git worktree prune`, (3) `git worktree add`.

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues-board.mjs tests/lib/cli-issues-board-migrate.test.mjs
git commit -m "test(cli): lock in checkpoint-gated resume so main's tree is never re-touched

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 7"
```

---

### Task 8: `board` dispatcher registration [specialist: none]

**Charter capability:** Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 6, Task 7
**Files:**
- Modify: `lib/cli/issues.mjs:39-108` (add `board` branch), `lib/cli/issues.mjs:23-37` (`help()`)
- Modify: `tests/lib/cli-issues-board-migrate.test.mjs` (add end-to-end dispatch assertion)

**Tests:** `tests/lib/cli-issues-board-migrate.test.mjs` (extend with dispatcher-level assertions)

**Context to load:**
- `lib/cli/issues.mjs:39-108` (exact pattern of the 8 existing subcommands)

- [ ] **Write failing test**

```javascript
it("adev issues board migrate dispatches through the issues sub-verb router", async () => {
  const { run } = await import("../../lib/cli/issues.mjs");
  const code = await run({ projectRoot: repo, argv: ["board", "migrate"], manifest: { tasks: { backend: "beads" } } });
  assert.equal(code, 0);
});

it("adev issues board with no sub-verb prints usage and exits 1", async () => {
  const { run } = await import("../../lib/cli/issues.mjs");
  const code = await run({ projectRoot: repo, argv: ["board"], manifest: {} });
  assert.equal(code, 1);
});
```

- [ ] **Verify test fails**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: FAIL — `unknown issues subcommand: board`

- [ ] **Implement**

In `lib/cli/issues.mjs`, add before the final `console.error("unknown issues subcommand..."` fallback:

```javascript
  if (sub === "board") {
    const mod = await import("./issues-board.mjs");
    if (argv.includes("--help") || argv.includes("-h")) {
      mod.help();
      return 0;
    }
    return mod.run({ projectRoot, argv: argv.slice(1), manifest });
  }
```

And add to `help()`:

```javascript
  console.log("  board        Manage the beads board's git topology (migrate)");
```

- [ ] **Verify test passes**

Run: `node --test tests/lib/cli-issues-board-migrate.test.mjs`
Expected: PASS

- [ ] **Commit**

```bash
git add lib/cli/issues.mjs tests/lib/cli-issues-board-migrate.test.mjs
git commit -m "feat(cli): register board sub-verb on adev issues dispatcher

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 8"
```

---

### Task 9: Error-case coverage sweep [specialist: none]

**Charter capability:** Beads Board Git Topology, Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 2, Task 4, Task 8
**Files:**
- Modify: `tests/lib/board-worktree.test.mjs`, `tests/lib/cli-issues-board-migrate.test.mjs`, `tests/cli-install-board-bootstrap.test.mjs` (only if gaps are found — this task closes coverage, it does not introduce new production code)

**Tests:** all three suites above (extend as needed)

**Context to load:**
- Full Error Cases table in `beads-board-git-topology.spec.md` (all 8 rows)
- Full Acceptance Criteria list in the spec

- [ ] **Write failing test**

Cross-check each of the 8 Error Cases rows against the suites written in Tasks 1, 4, 6, 7:

1. `BOARD_ALREADY_EXISTS` — Task 1 ✓
2. `BOARD_NO_BRANCH` — Task 1's helper auto-creates the orphan branch (BEH-3), so this row is only reachable via the raw `git worktree add .beads beads-board` command bypassing the helper; add a test asserting the helper itself never surfaces this code, only the raw-git path would.
3. `BOARD_ALREADY_MIGRATED` (live) — Task 6 ✓
4. `BOARD_ALREADY_MIGRATED` (`--dry-run`) — Task 6 ✓
5. `BOARD_NOTHING_TO_MIGRATE` — Task 6 ✓
6. `br` `--no-db` fallback continuity — add a regression test asserting `BeadsAdapter` still resolves against a worktree-provisioned `.beads/` with no `*.db` present (cross-reference to the existing issue-i0ji37 fix; no new production code, just a new assertion combining Task 1's fixture with the existing adapter).
7. main untouched until push succeeds — add a test that simulates a push failure and asserts `main`'s tree and `.gitignore` are unchanged (no partial commit, no removed `.beads/`).
8. `BOARD_MIGRATE_PARTIAL_FAILURE` + resumable retry — Task 7 ✓

For any row without an existing test after this check, write the failing test now.

- [ ] **Verify test fails**

Run each new/updated suite; confirm any newly-added test fails before its (if any) implementation.

- [ ] **Implement**

Implement only what's needed to close gaps found above. Expectation: rows 1, 3, 4, 5, 8 are already covered by Tasks 1/6/7 and require no new code — only confirmation. Rows 2, 6, 7 likely need new test-only additions (no production code, since the behavior they assert already follows from Tasks 1 and 6's design).

- [ ] **Verify test passes**

Run: `node --test tests/lib/board-worktree.test.mjs tests/lib/cli-issues-board-migrate.test.mjs tests/cli-install-board-bootstrap.test.mjs`
Expected: PASS — all 8 Error Cases rows have a passing automated test

- [ ] **Commit**

```bash
git add tests/lib/board-worktree.test.mjs tests/lib/cli-issues-board-migrate.test.mjs tests/cli-install-board-bootstrap.test.mjs
git commit -m "test(cli): close error-case coverage gaps for beads board git topology

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 9"
```

---

### Task 10: Full quality gate run [specialist: none]

**Charter capability:** Beads Board Git Topology, Beads Board Migration Tool
**Strategy:** unit (source: fallback, confidence: high)
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9
**Files:** none (verification only)

**Tests:** full `npm test` run

**Context to load:**
- Constitution Quality Gates section
- Full spec Acceptance Criteria list

- [ ] **Write failing test**

N/A — this task runs the existing full suite, it does not add a new test file.

- [ ] **Verify test fails**

N/A.

- [ ] **Implement**

Run `npm test`. Fix any regression surfaced in unrelated suites (e.g., other `resolveStorageRoot()` callers, the gitignore dogfood parity test against this repo's own `.gitignore`, existing `BeadsAdapter` tests) caused by Tasks 1-9's changes.

- [ ] **Verify test passes**

Run: `npm test`
Expected: PASS — full suite green, including all 9 behaviors and all 8 error cases from this spec

- [ ] **Commit**

Only if fixes were needed in Task 10 itself; otherwise this task produces no new commit (Task 9's commit is the closing commit for the plan).

```bash
git add <any files touched to fix regressions>
git commit -m "fix: resolve full-suite regressions from beads board git topology

Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md
Plan-task: 10"
```

---

## Quality Gates

After all tasks are complete, `/adev:validate` verifies the full quality gate suite. Results are recorded in the validation report (`.validate.md`), not in this plan.

- Tests pass: `npm test`
- All acceptance criteria from spec satisfied:
  - All 9 behaviors (BEH-1 through BEH-9) have passing automated tests
  - All 8 error cases have passing automated tests
  - `resolveStorageRoot()` is proven compatible with `.beads/` as a linked worktree by a real test
  - `adev issues board migrate` is idempotent
  - `adev issues board migrate --dry-run` never mutates the repository
  - A partial/interrupted migration never leaves `main` with `.beads/` removed but not yet gitignored (or vice versa)
  - A migration interrupted between `.beads/` removal and re-provisioning is recoverable via the checkpoint
  - Corrupt leftovers from an interrupted `git worktree add` are cleaned up before every re-provisioning attempt
  - `.context-index/tasks/.board-migrate-state.json` is removed on successful completion and gitignored
  - No constitutional violations introduced; the CLI-installation-path boundary note is confirmed accurate by implementation

No `governance/gates.yaml` override applies beyond the standard `npm test` gate; no lint or typecheck command is configured in this project's constitution beyond the test suite.
