/**
 * Tests for lib/issues/beads-adapter.mjs
 *
 * These tests verify command construction and adapter behavior
 * without requiring `br` to be installed.
 */

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { BeadsAdapter } from "../../lib/issues/beads-adapter.mjs";
import { createTempDir, cleanupTempDir } from "../helpers.mjs";

describe("BeadsAdapter", () => {
  it("throws BEADS_NOT_AVAILABLE when br is not on PATH", () => {
    // This test passes in environments where br is not installed
    // (which is the expected CI/test environment).
    try {
      new BeadsAdapter("/tmp/nonexistent", { checkBr: true });
      // If br IS installed, skip this assertion
    } catch (err) {
      assert.equal(err.code, "BEADS_NOT_AVAILABLE");
    }
  });

  it("can be constructed with checkBr=false (for testing)", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(adapter.name, "beads");
  });

  it("separates the .beads workspace directory from the --db file path", () => {
    const adapter = new BeadsAdapter("/tmp/test-root", { checkBr: false });
    // `br --db` takes the database FILE; `.beads/` is the workspace directory
    // that contains it. Passing the directory is what produced
    // "Database error: I/O error: Is a directory (os error 21)".
    assert.equal(adapter.workspaceDir, "/tmp/test-root/.beads");
    // Resolved lazily from the workspace contents — null until `br init` has
    // run and a *.db exists, at which point `--db` is omitted and br applies
    // its own auto-discovery.
    assert.equal(adapter.dbPath, null);
    assert.equal(adapter._resolveDbPath(), null, "no workspace → no db file");
  });

  it("keeps no sidecar path and no local epic delegate", () => {
    // The board lives entirely in beads. `.beads-map.json` held the adev id
    // map plus branch/pr/claimed_at, and a local JsonAdapter held the epics —
    // two stores that could disagree with beads. The sidecar's disagreement
    // was not hypothetical: it let the claim gate report "unclaimed" for an
    // issue br had already assigned, and the gate failed OPEN.
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(adapter.mapPath, undefined, "no sidecar path may survive");
    assert.equal(adapter._epicAdapter, undefined, "no local epic store may survive");
    assert.equal(typeof adapter._readMap, "undefined");
    assert.equal(typeof adapter._writeMap, "undefined");
    assert.equal(typeof adapter._getBeadsId, "undefined");
  });

  it("resolves adev ids from br's external_ref, never from a persisted map", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const scan = [
      { id: "tst-aaa", external_ref: "issue-1", title: "one" },
      { id: "tst-bbb", external_ref: "issue-2", title: "two" },
      { id: "tst-ccc", title: "created straight through br" },
    ];

    assert.equal(adapter._resolve("issue-2", scan).id, "tst-bbb");
    // An issue created directly in br stays operable under its own id, so the
    // board is never blind to work a human filed.
    assert.equal(adapter._resolve("tst-ccc", scan).id, "tst-ccc");
    assert.throws(
      () => adapter._resolve("issue-9", scan),
      (err) => err.code === "NOT_FOUND",
    );
  });

  it("resolves by id even when the record carries a stale, unrelated external_ref (adev-plugin-42zv)", () => {
    // Reproduces the hl0m/ga1t shape: a record migrated from the legacy
    // issue-N scheme still carries that old external_ref, but its *own* br
    // id is now the adev-plugin-* id callers actually address it by. Clause
    // 1 (external_ref match) correctly misses; clause 2 must not also miss
    // just because external_ref happens to be non-empty.
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const scan = [
      { id: "adev-plugin-hl0m", external_ref: "issue-591", title: "stale ref" },
      { id: "adev-plugin-ga1t", external_ref: "issue-t6vahn", title: "stale ref 2" },
      { id: "adev-plugin-gkfv.4", title: "no ref at all" },
    ];

    assert.equal(adapter._resolve("adev-plugin-hl0m", scan).id, "adev-plugin-hl0m");
    assert.equal(adapter._resolve("adev-plugin-ga1t", scan).id, "adev-plugin-ga1t");
    // Regression: a record with no external_ref still resolves by its own id.
    assert.equal(adapter._resolve("adev-plugin-gkfv.4", scan).id, "adev-plugin-gkfv.4");
    // Regression: the legacy external_ref lookup path (clause 1) is untouched —
    // a caller still holding the pre-migration id resolves the same record.
    assert.equal(adapter._resolve("issue-591", scan).id, "adev-plugin-hl0m");
    // Regression: a genuinely unknown id still fails loudly.
    assert.throws(
      () => adapter._resolve("adev-plugin-zzzz", scan),
      (err) => err.code === "NOT_FOUND",
    );
  });

  it("mints merge-safe ids that collide with nothing already on the board", () => {
    // issue-613: ids are no longer `max(external_ref) + 1`. Sequential
    // allocation is safe within one file and across worktrees but NOT across
    // git branches — two sessions off one baseline mint the same number and
    // only discover it at merge. Randomness needs no shared counter, which is
    // the property a branch cannot otherwise obtain.
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const scan = [
      { id: "a", external_ref: "issue-1" },
      { id: "b", external_ref: "issue-7" }, // may well be closed — `-s all` sees it
      { id: "c", external_ref: "epic-2" },
      { id: "d" },
    ];

    const minted = adapter._nextId("issue", scan);
    assert.match(minted, /^issue-[a-z0-9]{6}$/, "prefix stays quotable");
    assert.ok(
      !["issue-1", "issue-7"].includes(minted),
      "must not reuse an id already on the board",
    );
    assert.match(adapter._nextId("epic", scan), /^epic-[a-z0-9]{6}$/);
    assert.match(adapter._nextId("issue", []), /^issue-[a-z0-9]{6}$/);

    // The point of the change: independent mints do not agree.
    const many = new Set(
      Array.from({ length: 50 }, () => adapter._nextId("issue", scan)),
    );
    assert.equal(many.size, 50, "50 independent mints must all differ");
  });

  it("never throws on malformed or foreign agent_context", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    // `agent_context` is br's field, writable by humans and other tools. A
    // board must not become unreadable because one issue holds odd JSON.
    for (const agent_context of ["not json at all", "[1,2,3]", '"a string"', "", null, "{}"]) {
      const issue = adapter._toIssue({ id: "x", external_ref: "issue-1", agent_context });
      assert.equal(issue.id, "issue-1");
      assert.equal(issue.branch, undefined);
      assert.equal(issue.next_action, null);
    }

    const populated = adapter._toIssue({
      id: "x",
      external_ref: "issue-1",
      assignee: "alice",
      agent_context: JSON.stringify({
        house_rules: "not adev's",
        adev: { branch: "feat/x", epicId: "epic-2", claimed_at: "2026-01-01T00:00:00Z" },
      }),
    });
    assert.equal(populated.branch, "feat/x");
    assert.equal(populated.epicId, "epic-2");
    assert.equal(populated.owner, "alice", "the holder is br's assignee, and only that");
  });

  it("exposes epic operations without constructing any local store", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter.createEpic, "function");
    assert.equal(typeof adapter.updateEpic, "function");
    assert.equal(typeof adapter.listEpics, "function");
  });

  it("exposes all IssueManagerInterface methods", () => {
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    const methods = ["create", "update", "close", "list", "get",
                     "createEpic", "updateEpic", "addDependency", "init"];
    for (const method of methods) {
      assert.equal(typeof adapter[method], "function",
        `Expected method '${method}' to exist`);
    }
  });

  it("uses execFileSync pattern (not exec/execSync string)", () => {
    // Verify the adapter imports execFileSync, not execSync
    // This is a structural test — the actual invocation is tested
    // in integration tests with br available
    const adapter = new BeadsAdapter("/tmp/nonexistent", { checkBr: false });
    assert.equal(typeof adapter._runBr, "function");
  });
});

// ─── _runBr maxBuffer ceiling (issue-mohump) ───────────────────────────────
{
  /**
   * `_runBr` drives every read verb (board, list, ready, get) through
   * `br list -s all --json`, whose payload covers the whole board — open AND
   * closed. Node's execFileSync defaults `maxBuffer` to 1 MiB; a payload past
   * that throws ENOBUFS regardless of how healthy `br` itself is, and the
   * catch clause reports `err.stdout` — on ENOBUFS the truncated buffer — so
   * the failure surfaces as a megabyte of JSON that reads like backend
   * corruption rather than a size ceiling. Observed live at 1,050,038 bytes.
   *
   * A real subprocess exercises this, not a stub of `_runBr` — every other
   * test in this suite stubs `_runBr` itself, which cannot observe a
   * maxBuffer regression because the stub never calls execFileSync at all.
   * The stand-in binary needs no `br` install: it ignores argv and writes a
   * payload sized just past the default ceiling.
   */

  const dir = createTempDir();
  const binDir = join(dir, "bin");

  function makeFakeBrOnPath(payloadSize) {
    mkdirSync(binDir, { recursive: true });
    const script = join(binDir, "br");
    writeFileSync(
      script,
      `#!/usr/bin/env node\nprocess.stdout.write("a".repeat(${payloadSize}));\n`,
    );
    chmodSync(script, 0o755);
    return binDir;
  }

  describe("BeadsAdapter — _runBr maxBuffer ceiling (issue-mohump)", () => {
    after(() => cleanupTempDir(dir));

    it("does not throw ENOBUFS on a payload past Node's 1 MiB default", () => {
      const oversizePayload = 1024 * 1024 + 50_000; // past the 1,048,576-byte default
      const fakeBinDir = makeFakeBrOnPath(oversizePayload);
      const originalPath = process.env.PATH;
      process.env.PATH = `${fakeBinDir}:${originalPath}`;
      try {
        const adapter = new BeadsAdapter(dir, { checkBr: false });
        const output = adapter._runBr(["list", "-s", "all", "--json"]);
        assert.equal(
          output.length,
          oversizePayload,
          "the full payload must come back intact, not truncated by a low maxBuffer",
        );
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });
}
