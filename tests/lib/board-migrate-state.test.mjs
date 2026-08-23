// tests/lib/board-migrate-state.test.mjs
//
// Round-trip + atomic-write-safety + best-effort-clear coverage for the
// board-migrate resumable checkpoint helper.
//
// Spec: .context-index/specs/features/task-management/beads-board-git-topology.spec.md

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writeBoardMigrateCheckpoint,
  readBoardMigrateCheckpoint,
  clearBoardMigrateCheckpoint,
} from "../../lib/issues/board-migrate-state.mjs";

describe("board-migrate checkpoint", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "board-state-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("round-trips a written checkpoint", () => {
    writeBoardMigrateCheckpoint(root, { step: "push-landed" });
    const read = readBoardMigrateCheckpoint(root);
    assert.equal(read.step, "push-landed");
  });

  it("stamps written_at as an ISO 8601 timestamp", () => {
    writeBoardMigrateCheckpoint(root, { step: "push-landed" });
    const read = readBoardMigrateCheckpoint(root);
    assert.ok(typeof read.written_at === "string");
    assert.ok(!Number.isNaN(Date.parse(read.written_at)));
  });

  it("returns null when no checkpoint exists", () => {
    assert.equal(readBoardMigrateCheckpoint(root), null);
  });

  it("returns null for an unparseable checkpoint file rather than throwing", () => {
    const dir = join(root, ".context-index", "tasks");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".board-migrate-state.json"), "{not json");
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

  it("write never leaves a .tmp file behind as the final artifact", () => {
    writeBoardMigrateCheckpoint(root, { step: "push-landed" });
    const dir = join(root, ".context-index", "tasks");
    const entries = readdirSync(dir);
    assert.ok(entries.includes(".board-migrate-state.json"));
    assert.ok(!entries.some((e) => e.endsWith(".tmp")), `leftover tmp file: ${entries.join(", ")}`);
  });
});
