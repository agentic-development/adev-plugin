// tests/lib/board-worktree-adapter-live.test.mjs
//
// Real (non-mocked) coverage for BeadsAdapter against a genuine `br` CLI
// running with `--no-db` on a freshly provisioned board worktree (Error
// Cases row 6, issue-i0ji37 cross-reference). `checkBr` defaults to true —
// this is a live `br` integration check, matching the spec's own
// empirically-validated-against-real-git/br methodology, not a mock.
//
// Named with "live" so `node --test tests/lib/board-worktree-adapter-live.test.mjs`
// selects it directly; excluded from the default `npm test` run
// (scripts/run-tests.mjs's `-live.test.mjs` convention, alongside
// tests/integration/bugfix-loop-commit-pr-live.test.mjs) because CI does not
// install `beads_rust` (it is an optional external CLI, not an npm
// dependency — see docs/configuration.md). Per this project's no-silent-skip
// convention (feedback_falsify_guards): when this suite IS invoked and `br`
// is unavailable, it fails hard (BEADS_NOT_AVAILABLE) — it never skips
// silently.
//
// Requires: `br` (beads_rust) installed and on PATH.
//   https://github.com/Dicklesworthstone/beads_rust

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { provisionBoardWorktree } from "../../lib/issues/board-worktree.mjs";
import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

describe("BeadsAdapter --no-db fallback on a fresh board worktree (Error Cases row 6)", () => {
  let repo;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "board-wt-nodb-"));
    git(["init", "-q", "-b", "main"], repo);
    git(["config", "user.email", "test@test.com"], repo);
    git(["config", "user.name", "Test"], repo);
    git(["config", "commit.gpgsign", "false"], repo);
    git(["commit", "--allow-empty", "-q", "-m", "init"], repo);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("BeadsAdapter reads and writes against a worktree-provisioned .beads/ with no *.db present (issue-i0ji37 cross-reference)", async () => {
    const provision = provisionBoardWorktree({ projectRoot: repo });
    assert.equal(provision.mode, "orphan");
    assert.ok(!existsSync(join(repo, ".beads", "beads.db")));

    const adapter = new BeadsAdapter(repo, { autoMigrate: false });
    const before = await adapter.list();
    assert.deepEqual(before, [], "no SYNC_CONFLICT on an empty, db-less worktree");

    const created = await adapter.create({ title: "no-db fallback smoke test", type: "task" });
    assert.ok(created.id);

    const after = await adapter.list();
    assert.ok(after.some((i) => i.id === created.id));
    // Still no *.db — br's --no-db mode never creates one.
    assert.ok(!existsSync(join(repo, ".beads", "beads.db")));
  });
});
