// tests/lib/gitignore-paths.test.mjs
//
// Shape contract + SEC-3 load-time invariants for MANAGED_GITIGNORE_PATHS.
//
// Spec: .context-index/specs/features/setup/managed-gitignore-block.spec.md
//   Behaviors 1-3, Canonical Path List section.

import { test } from "node:test";
import { strict as assert } from "node:assert";

import { MANAGED_GITIGNORE_PATHS } from "../../lib/gitignore-paths.mjs";

const GITIGNORE_OPEN = "# >>> adev:gitignore >>>";
const GITIGNORE_CLOSE = "# <<< adev:gitignore <<<";

test("MANAGED_GITIGNORE_PATHS is an array of { path, comment? } objects", () => {
  assert.ok(Array.isArray(MANAGED_GITIGNORE_PATHS));
  assert.ok(MANAGED_GITIGNORE_PATHS.length > 0);
  for (const entry of MANAGED_GITIGNORE_PATHS) {
    assert.equal(typeof entry, "object");
    assert.notEqual(entry, null);
    assert.equal(typeof entry.path, "string");
    if (entry.comment !== undefined) {
      assert.equal(typeof entry.comment, "string");
    }
  }
});

test("MANAGED_GITIGNORE_PATHS is frozen", () => {
  assert.ok(Object.isFrozen(MANAGED_GITIGNORE_PATHS));
});

test("MANAGED_GITIGNORE_PATHS contains the spec-declared 21 entries in declared order", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  const expected = [
    ".context-index/hygiene/",
    ".context-index/packets/",
    ".context-index/.token-cursor.json",
    ".context-index/.reminder-counter",
    ".context-index/.session-tracking.jsonl",
    ".context-index/user-config",
    ".context-index/.context-preflight-ok",
    ".context-index/.execution-state.json",
    ".context-index/.advisory-counter",
    ".context-index/lifecycle-state/*.json",
    ".context-index/build-state/*.json",
    ".context-index/tasks/tasks.json.lock",
    ".context-index/tasks/tasks.json.*.tmp",
    ".context-index/tasks/.migrate-state.json",
    ".beads/",
    ".context-index/tasks/.board-migrate-state.json",
    "*.partial",
    "*.partial.lock",
    ".gitignore.*.tmp",
    ".adev/",
    ".githooks/*.adev",
  ];
  assert.deepEqual(paths, expected);
});

test("includes .beads/ and the board-migrate checkpoint in MANAGED_GITIGNORE_PATHS", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  assert.ok(paths.includes(".beads/"));
  assert.ok(paths.includes(".context-index/tasks/.board-migrate-state.json"));
});

test("MANAGED_GITIGNORE_PATHS does NOT include .context-index/sessions/", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  assert.ok(
    !paths.includes(".context-index/sessions/"),
    "sessions/ is separately owned by adev:session-capture-gitignore",
  );
});

test("SEC-3: no entry's path or comment contains \\n, \\r, \\0", () => {
  for (const entry of MANAGED_GITIGNORE_PATHS) {
    assert.ok(!/[\n\r\0]/.test(entry.path), `path has forbidden char: ${entry.path}`);
    if (entry.comment !== undefined) {
      assert.ok(
        !/[\n\r\0]/.test(entry.comment),
        `comment has forbidden char: ${entry.comment}`,
      );
    }
  }
});

test("SEC-3: no entry's path or comment contains the marker tokens", () => {
  for (const entry of MANAGED_GITIGNORE_PATHS) {
    assert.ok(!entry.path.includes(GITIGNORE_OPEN));
    assert.ok(!entry.path.includes(GITIGNORE_CLOSE));
    if (entry.comment !== undefined) {
      assert.ok(!entry.comment.includes(GITIGNORE_OPEN));
      assert.ok(!entry.comment.includes(GITIGNORE_CLOSE));
    }
  }
});

test("SA-1 absorption: lifecycle-state/*.json comment references jsonl", () => {
  const entry = MANAGED_GITIGNORE_PATHS.find(
    (e) => e.path === ".context-index/lifecycle-state/*.json",
  );
  assert.ok(entry, "lifecycle-state/*.json entry is present");
  assert.ok(
    /jsonl/i.test(entry.comment ?? ""),
    "lifecycle-state comment must reference jsonl rationale (SA-1)",
  );
});

test("SEC-2: .gitignore.*.tmp atomic-write temp pattern is present", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  assert.ok(paths.includes(".gitignore.*.tmp"));
});

test("Cross-cutting: *.partial and *.partial.lock present (SA-5 / CON-4)", () => {
  const paths = MANAGED_GITIGNORE_PATHS.map((e) => e.path);
  assert.ok(paths.includes("*.partial"));
  assert.ok(paths.includes("*.partial.lock"));
});
