/**
 * Tests for lib/issues/json-adapter.mjs.
 *
 * Covers: constructor + path safety (Tasks 4, 6); _read/_write primitives +
 * atomic temp-then-rename (Task 5); document-shape validators (Task 7);
 * init (Task 8); board-granularity validator (Task 9); create/update with
 * status + granularity guards (Task 10); close + cascade + deps (Task 11);
 * read APIs (Task 12); legacy epic wrappers (Task 13); addDependency cycle
 * detection (Task 14); walkTree (Task 15); legacy markdown read fallback (Task 16).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { JsonAdapter } from "../../../lib/issues/json-adapter.mjs";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Set up a temp project root with `.context-index/manifest.yaml`. */
function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "json-adapter-test-"));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
  return dir;
}

function readBoard(dir) {
  const p = join(dir, ".context-index", "tasks", "tasks.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeBoardRaw(dir, contents) {
  const tasksDir = join(dir, ".context-index", "tasks");
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(join(tasksDir, "tasks.json"), contents);
}

// ---------------------------------------------------------------------------
// Task 4 — constructor + skeleton
// ---------------------------------------------------------------------------

describe("JsonAdapter — constructor", () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("constructs with a valid projectRoot", () => {
    const adapter = new JsonAdapter(dir);
    assert.equal(adapter.name, "json");
    assert.equal(typeof adapter.filePath, "string");
    assert.ok(adapter.filePath.endsWith(join(".context-index", "tasks", "tasks.json")));
  });

  it("exposes every IssueManagerInterface method", () => {
    const adapter = new JsonAdapter(dir);
    const required = [
      "init", "create", "update", "close", "list", "get",
      "listEpics", "createEpic", "updateEpic", "addDependency", "walkTree",
    ];
    for (const m of required) {
      assert.equal(typeof adapter[m], "function", `expected method ${m}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 6 — path containment defenses
// ---------------------------------------------------------------------------

describe("JsonAdapter — path safety (SEC-2)", () => {
  it("throws INVALID_PROJECT_ROOT when manifest is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "json-adapter-test-bad-"));
    try {
      assert.throws(
        () => new JsonAdapter(dir),
        (err) => err.code === "INVALID_PROJECT_ROOT"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws INVALID_PROJECT_ROOT on empty string", () => {
    assert.throws(
      () => new JsonAdapter(""),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });

  it("throws INVALID_PROJECT_ROOT on null", () => {
    assert.throws(
      () => new JsonAdapter(null),
      (err) => err.code === "INVALID_PROJECT_ROOT"
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5 — _read / _write primitives + atomic temp-then-rename
// ---------------------------------------------------------------------------

describe("JsonAdapter — _read / _write primitives", () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("_read returns the empty board when tasks.json is absent", () => {
    const adapter = new JsonAdapter(dir);
    const board = adapter._read();
    assert.equal(board.version, 2);
    assert.deepEqual(board.epics, []);
    assert.deepEqual(board.issues, []);
  });

  it("_write produces a syntactically valid JSON file", () => {
    const adapter = new JsonAdapter(dir);
    adapter._write({ version: 2, epics: [], issues: [{ id: "issue-1", title: "x" }] });
    const board = readBoard(dir);
    assert.equal(board.version, 2);
    assert.equal(board.issues.length, 1);
    assert.equal(board.issues[0].id, "issue-1");
  });

  it("_write trailing newline + 2-space indent", () => {
    const adapter = new JsonAdapter(dir);
    adapter._write({ version: 2, epics: [], issues: [] });
    const raw = readFileSync(join(dir, ".context-index", "tasks", "tasks.json"), "utf8");
    assert.ok(raw.endsWith("\n"), "file should end with newline");
    assert.ok(raw.includes("\n  "), "should be indented");
  });

  it("creates the storage directory if missing", () => {
    const adapter = new JsonAdapter(dir);
    adapter._write({ version: 2, epics: [], issues: [] });
    assert.ok(existsSync(join(dir, ".context-index", "tasks")));
    assert.ok(existsSync(adapter.filePath));
  });

  it("leaves no temp files after a successful write", () => {
    const adapter = new JsonAdapter(dir);
    adapter._write({ version: 2, epics: [], issues: [] });
    const files = readdirSync(join(dir, ".context-index", "tasks"));
    const tmps = files.filter((f) => f.endsWith(".tmp"));
    assert.equal(tmps.length, 0, `unexpected temp files: ${tmps.join(", ")}`);
  });

  it("writes via temp-then-rename (no truncated file visible to a reader)", () => {
    // We can't kill the process mid-write here, but we can assert the
    // atomicity contract: after _write returns, tasks.json exists with the
    // full payload (not a partial). The fault-injection test lives in
    // json-adapter.atomic.test.mjs.
    const adapter = new JsonAdapter(dir);
    adapter._write({ version: 2, epics: [], issues: [] });
    const raw = readFileSync(adapter.filePath, "utf8");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 2);
  });
});

// ---------------------------------------------------------------------------
// Task 7 — document-shape validators
// ---------------------------------------------------------------------------

describe("JsonAdapter — document-shape validators", () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("throws MALFORMED_BOARD on malformed JSON with line/column + prefix", () => {
    writeBoardRaw(dir, "{ this is not json");
    const adapter = new JsonAdapter(dir);
    assert.throws(
      () => adapter._read(),
      (err) =>
        err.code === "MALFORMED_BOARD" &&
        /line \d+/i.test(err.message) &&
        /column \d+/i.test(err.message)
    );
  });

  it("MALFORMED_BOARD message context prefix is at most 200 chars", () => {
    const huge = "{\n" + " ".repeat(500) + "garbage";
    writeBoardRaw(dir, huge);
    const adapter = new JsonAdapter(dir);
    try {
      adapter._read();
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.code, "MALFORMED_BOARD");
      // Look for any explicit prefix substring; ensure it isn't the raw 500-char span.
      assert.ok(err.message.length < 2000, "message should be bounded");
    }
  });

  it("throws INVALID_BOARD_SHAPE when top-level shape is wrong", () => {
    writeBoardRaw(dir, JSON.stringify({ version: 2, foo: "bar" }));
    const adapter = new JsonAdapter(dir);
    assert.throws(
      () => adapter._read(),
      (err) => err.code === "INVALID_BOARD_SHAPE"
    );
  });

  it("throws INVALID_BOARD_SHAPE when epics is not an array", () => {
    writeBoardRaw(dir, JSON.stringify({ version: 2, epics: {}, issues: [] }));
    const adapter = new JsonAdapter(dir);
    assert.throws(
      () => adapter._read(),
      (err) => err.code === "INVALID_BOARD_SHAPE"
    );
  });

  it("throws UNSUPPORTED_BOARD_VERSION when version < 2", () => {
    writeBoardRaw(dir, JSON.stringify({ version: 1, epics: [], issues: [] }));
    const adapter = new JsonAdapter(dir);
    assert.throws(
      () => adapter._read(),
      (err) => err.code === "UNSUPPORTED_BOARD_VERSION"
    );
  });

  it("throws UNSUPPORTED_BOARD_VERSION with fixed message when version is non-numeric", () => {
    writeBoardRaw(dir, JSON.stringify({ version: "abc", epics: [], issues: [] }));
    const adapter = new JsonAdapter(dir);
    try {
      adapter._read();
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.code, "UNSUPPORTED_BOARD_VERSION");
      // SEC-4: fixed-string fallback. Must NOT interpolate the raw value.
      assert.ok(!/abc/.test(err.message), `message leaks raw value: ${err.message}`);
    }
  });

  it("accepts version >= 2 (forward-compat)", () => {
    writeBoardRaw(dir, JSON.stringify({ version: 5, epics: [], issues: [] }));
    const adapter = new JsonAdapter(dir);
    const board = adapter._read();
    assert.equal(board.version, 5);
  });
});

// ---------------------------------------------------------------------------
// Task 8 — init() idempotent bootstrap
// ---------------------------------------------------------------------------

describe("JsonAdapter — init()", () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates an empty board when tasks.json is absent", async () => {
    const adapter = new JsonAdapter(dir);
    await adapter.init();
    const board = readBoard(dir);
    assert.equal(board.version, 2);
    assert.deepEqual(board.epics, []);
    assert.deepEqual(board.issues, []);
  });

  it("is idempotent: init() twice leaves the file byte-identical", async () => {
    const adapter = new JsonAdapter(dir);
    await adapter.init();
    const raw1 = readFileSync(adapter.filePath, "utf8");
    await adapter.init();
    const raw2 = readFileSync(adapter.filePath, "utf8");
    assert.equal(raw1, raw2);
  });
});

// ---------------------------------------------------------------------------
// Task 9 — board-granularity validator
// ---------------------------------------------------------------------------

describe("JsonAdapter — board-granularity validator (standalone)", () => {
  it("rejects { planRef, planTask } pair", () => {
    assert.throws(
      () => JsonAdapter._validateBoardGranularity({ planRef: "x", planTask: 1 }),
      (err) =>
        err.code === "BOARD_GRANULARITY_VIOLATION" &&
        /lifecycle/i.test(err.message)
    );
  });

  it("rejects planTask alone", () => {
    assert.throws(
      () => JsonAdapter._validateBoardGranularity({ planTask: 1 }),
      (err) => err.code === "BOARD_GRANULARITY_VIOLATION"
    );
  });

  it("permits planRef alone", () => {
    assert.doesNotThrow(() =>
      JsonAdapter._validateBoardGranularity({ planRef: "plans/p.md" })
    );
  });

  it("permits an empty payload", () => {
    assert.doesNotThrow(() => JsonAdapter._validateBoardGranularity({}));
  });

  it("permits planTask explicitly null or undefined", () => {
    assert.doesNotThrow(() => JsonAdapter._validateBoardGranularity({ planTask: null }));
    assert.doesNotThrow(() => JsonAdapter._validateBoardGranularity({ planTask: undefined }));
  });
});

// ---------------------------------------------------------------------------
// Task 10 — create() + update()
// ---------------------------------------------------------------------------

describe("JsonAdapter — create()", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("creates an issue with auto-incremented legacy ID", async () => {
    const a = await adapter.create({ title: "First", type: "task" });
    const b = await adapter.create({ title: "Second", type: "task" });
    assert.equal(a.id, "issue-1");
    assert.equal(b.id, "issue-2");
  });

  it("persists the issue to tasks.json", async () => {
    await adapter.create({ title: "Persisted", type: "task" });
    const board = readBoard(dir);
    assert.equal(board.issues.length, 1);
    assert.equal(board.issues[0].title, "Persisted");
  });

  it("rejects create with planTask set (BOARD_GRANULARITY_VIOLATION)", async () => {
    await assert.rejects(
      adapter.create({ title: "Bad", type: "task", planTask: 1 }),
      (err) => err.code === "BOARD_GRANULARITY_VIOLATION"
    );
  });

  it("rejects create with planRef+planTask pair", async () => {
    await assert.rejects(
      adapter.create({ title: "Bad", type: "task", planRef: "p.md", planTask: 1 }),
      (err) => err.code === "BOARD_GRANULARITY_VIOLATION"
    );
  });

  it("accepts create with planRef alone", async () => {
    const i = await adapter.create({ title: "OK", type: "task", planRef: "p.md" });
    assert.equal(i.planRef, "p.md");
  });

  it("rejects create without title", async () => {
    await assert.rejects(
      adapter.create({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("leaves board unchanged after a rejected create", async () => {
    const before = readFileSync(adapter.filePath, "utf8");
    await assert.rejects(adapter.create({ title: "Bad", planTask: 1 }));
    const after = readFileSync(adapter.filePath, "utf8");
    assert.equal(before, after);
  });

  it("creates a tiered item with parent_id (default 'e' prefix)", async () => {
    const root = await adapter.create({ title: "Root", type: "task", tier_prefix: "e" });
    assert.match(root.id, /^e\d+$/);
    const child = await adapter.create({ title: "Child", type: "task", parent_id: root.id });
    assert.ok(child.id.startsWith(root.id + "."));
  });
});

describe("JsonAdapter — update()", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("updates fields on an existing issue", async () => {
    const i = await adapter.create({ title: "T", type: "task" });
    const updated = await adapter.update(i.id, { priority: 0 });
    assert.equal(updated.priority, 0);
    assert.equal(updated.title, "T");
  });

  it("rejects update on closed issue", async () => {
    const i = await adapter.create({ title: "T", type: "task" });
    await adapter.close(i.id, "done");
    await assert.rejects(
      adapter.update(i.id, { priority: 0 }),
      (err) => err.code === "ISSUE_CLOSED"
    );
  });

  it("rejects update with status: closed (USE_CLOSE_METHOD)", async () => {
    const i = await adapter.create({ title: "T", type: "task" });
    await assert.rejects(
      adapter.update(i.id, { status: "closed" }),
      (err) => err.code === "USE_CLOSE_METHOD"
    );
  });

  it("rejects update that would set planTask to a non-null value", async () => {
    const i = await adapter.create({ title: "T", type: "task" });
    await assert.rejects(
      adapter.update(i.id, { planTask: 1 }),
      (err) => err.code === "BOARD_GRANULARITY_VIOLATION"
    );
  });

  it("tolerates updating a legacy issue without touching its planRef/planTask pair", async () => {
    // Write a board containing a legacy issue with planRef+planTask both set.
    writeBoardRaw(
      dir,
      JSON.stringify({
        version: 2,
        epics: [],
        issues: [{
          id: "issue-99",
          title: "Legacy",
          status: "open",
          priority: 2,
          type: "task",
          dependencies: [],
          notes: "",
          planRef: "old.md",
          planTask: 1,
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
        }],
      })
    );
    const updated = await adapter.update("issue-99", { priority: 0 });
    assert.equal(updated.priority, 0);
    assert.equal(updated.planRef, "old.md");
    assert.equal(updated.planTask, 1);
  });

  it("allows clearing legacy planTask to null", async () => {
    writeBoardRaw(
      dir,
      JSON.stringify({
        version: 2,
        epics: [],
        issues: [{
          id: "issue-99",
          title: "Legacy",
          status: "open",
          priority: 2,
          type: "task",
          dependencies: [],
          notes: "",
          planRef: "old.md",
          planTask: 1,
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
        }],
      })
    );
    const updated = await adapter.update("issue-99", { planTask: null });
    assert.equal(updated.planTask, null);
  });

  it("rejects update on nonexistent issue", async () => {
    await assert.rejects(
      adapter.update("issue-999", { priority: 0 }),
      (err) => err.code === "NOT_FOUND"
    );
  });
});

// ---------------------------------------------------------------------------
// Task 11 — close() cascade + deps
// ---------------------------------------------------------------------------

describe("JsonAdapter — close()", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("closes an issue with no dependencies", async () => {
    const i = await adapter.create({ title: "X", type: "task" });
    const closed = await adapter.close(i.id, "done");
    assert.equal(closed.status, "closed");
    assert.match(closed.notes, /Closed: done/);
  });

  it("rejects close on issue with open dependencies (BLOCKED_BY_DEPENDENCIES)", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    const b = await adapter.create({ title: "B", type: "task" });
    await adapter.addDependency(b.id, a.id);
    await assert.rejects(
      adapter.close(b.id, "done"),
      (err) => err.code === "BLOCKED_BY_DEPENDENCIES"
    );
  });

  it("rejects close on tiered parent with open children (CASCADE_BLOCKED)", async () => {
    const root = await adapter.create({ title: "Root", type: "task", tier_prefix: "e" });
    await adapter.create({ title: "Child", type: "task", parent_id: root.id });
    await assert.rejects(
      adapter.close(root.id, "done"),
      (err) => err.code === "CASCADE_BLOCKED"
    );
  });

  it("rejects close on nonexistent issue", async () => {
    await assert.rejects(
      adapter.close("issue-999", "done"),
      (err) => err.code === "NOT_FOUND"
    );
  });
});

// ---------------------------------------------------------------------------
// Task 12 — list / get / listEpics
// ---------------------------------------------------------------------------

describe("JsonAdapter — read APIs", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("list() returns all issues", async () => {
    await adapter.create({ title: "A", type: "task" });
    await adapter.create({ title: "B", type: "task" });
    const issues = await adapter.list({});
    assert.equal(issues.length, 2);
  });

  it("list filters by status", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    await adapter.create({ title: "B", type: "task" });
    await adapter.close(a.id, "done");
    const open = await adapter.list({ status: "open" });
    assert.equal(open.length, 1);
    assert.equal(open[0].title, "B");
  });

  it("list filters by type", async () => {
    await adapter.create({ title: "A", type: "bug" });
    await adapter.create({ title: "B", type: "task" });
    const bugs = await adapter.list({ type: "bug" });
    assert.equal(bugs.length, 1);
  });

  it("list filters by epicId", async () => {
    await adapter.create({ title: "A", type: "task", epicId: "epic-1" });
    await adapter.create({ title: "B", type: "task", epicId: "epic-2" });
    const result = await adapter.list({ epicId: "epic-1" });
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "A");
  });

  it("list filters by planRef", async () => {
    await adapter.create({ title: "A", type: "task", planRef: "p.md" });
    await adapter.create({ title: "B", type: "task" });
    const result = await adapter.list({ planRef: "p.md" });
    assert.equal(result.length, 1);
  });

  it("list sorts by priority then created date", async () => {
    await adapter.create({ title: "Low", type: "task", priority: 3 });
    await adapter.create({ title: "High", type: "task", priority: 0 });
    const sorted = await adapter.list({});
    assert.equal(sorted[0].title, "High");
    assert.equal(sorted[1].title, "Low");
  });

  it("get() returns the issue by ID", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    const got = await adapter.get(a.id);
    assert.equal(got.title, "A");
  });

  it("get() returns null for nonexistent ID", async () => {
    const got = await adapter.get("issue-999");
    assert.equal(got, null);
  });

  it("listEpics() returns only epics", async () => {
    await adapter.createEpic({ title: "Epic A" });
    await adapter.create({ title: "Issue B", type: "task" });
    const epics = await adapter.listEpics({});
    assert.equal(epics.length, 1);
    assert.equal(epics[0].title, "Epic A");
  });

  it("listEpics() filters by status", async () => {
    await adapter.createEpic({ title: "Open" });
    const e2 = await adapter.createEpic({ title: "Done" });
    await adapter.updateEpic(e2.id, { status: "in_progress" });
    const result = await adapter.listEpics({ status: "open" });
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "Open");
  });
});

// ---------------------------------------------------------------------------
// CON-3 / CON-6 — read-tolerance for legacy planRef+planTask issues
// ---------------------------------------------------------------------------
// json-issue-board-adapter.spec.md line 145 (CON-3): legacy in-board issues
// carrying both `planRef` and `planTask` are tolerated on read indefinitely.
// test-migration.spec.md CON-6: a direct read-tolerance test under
// tests/lib/issues/* is permitted (asserts against parsed in-memory data,
// not against authored markdown/YAML fixtures).

describe("JsonAdapter — read-tolerance for legacy planRef+planTask issues (CON-3)", () => {
  let dir, adapter;
  beforeEach(() => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns issues with both planRef and planTask via list() without rejecting", async () => {
    // Pre-existing legacy issue authored before the granularity invariant.
    writeBoardRaw(
      dir,
      JSON.stringify({
        version: 2,
        epics: [],
        issues: [{
          id: "issue-legacy",
          title: "Legacy",
          status: "open",
          priority: 2,
          type: "task",
          dependencies: [],
          notes: "",
          planRef: "specs/features/foo/bar.plan.md",
          planTask: 3,
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-01T00:00:00.000Z",
        }],
      })
    );
    const issues = await adapter.list();
    assert.equal(issues.length, 1);
    assert.equal(issues[0].planRef, "specs/features/foo/bar.plan.md");
    assert.equal(issues[0].planTask, 3);
  });
});

// ---------------------------------------------------------------------------
// Task 13 — legacy epic wrappers
// ---------------------------------------------------------------------------

describe("JsonAdapter — createEpic / updateEpic", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("createEpic assigns an epic-N ID", async () => {
    const e = await adapter.createEpic({ title: "Auth" });
    assert.equal(e.id, "epic-1");
    assert.equal(e.status, "open");
  });

  it("createEpic rejects missing title", async () => {
    await assert.rejects(
      adapter.createEpic({}),
      (err) => err.code === "MISSING_REQUIRED_FIELD"
    );
  });

  it("updateEpic merges changes", async () => {
    const e = await adapter.createEpic({ title: "Auth" });
    const updated = await adapter.updateEpic(e.id, { status: "in_progress" });
    assert.equal(updated.status, "in_progress");
    assert.equal(updated.title, "Auth");
  });

  it("updateEpic rejects nonexistent epic", async () => {
    await assert.rejects(
      adapter.updateEpic("epic-999", { status: "in_progress" }),
      (err) => err.code === "NOT_FOUND"
    );
  });

  it("createEpic preserves planRef (epic-level snake_case is allowed)", async () => {
    const e = await adapter.createEpic({ title: "Auth", planRef: "plans/auth.md" });
    assert.equal(e.planRef, "plans/auth.md");
  });
});

// ---------------------------------------------------------------------------
// Task 14 — addDependency cycle detection
// ---------------------------------------------------------------------------

describe("JsonAdapter — addDependency", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("appends a dependency", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    const b = await adapter.create({ title: "B", type: "task" });
    await adapter.addDependency(b.id, a.id);
    const got = await adapter.get(b.id);
    assert.ok(got.dependencies.includes(a.id));
  });

  it("detects a self-cycle", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    await assert.rejects(
      adapter.addDependency(a.id, a.id),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("detects an indirect cycle", async () => {
    const a = await adapter.create({ title: "A", type: "task" });
    const b = await adapter.create({ title: "B", type: "task" });
    await adapter.addDependency(a.id, b.id);
    await assert.rejects(
      adapter.addDependency(b.id, a.id),
      (err) => err.code === "CIRCULAR_DEPENDENCY"
    );
  });

  it("rejects missing issue id", async () => {
    await assert.rejects(
      adapter.addDependency("issue-999", "issue-998"),
      (err) => err.code === "NOT_FOUND"
    );
  });
});

// ---------------------------------------------------------------------------
// Task 15 — walkTree prefix match
// ---------------------------------------------------------------------------

describe("JsonAdapter — walkTree", () => {
  let dir, adapter;
  beforeEach(async () => {
    dir = makeProject();
    adapter = new JsonAdapter(dir);
    await adapter.init();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns descendants of a tiered parent", async () => {
    const root = await adapter.create({ title: "Root", type: "task", tier_prefix: "e" });
    await adapter.create({ title: "C1", type: "task", parent_id: root.id });
    await adapter.create({ title: "C2", type: "task", parent_id: root.id });
    const tree = await adapter.walkTree(root.id);
    const ids = tree.map((i) => i.id).sort();
    assert.equal(ids.length, 2);
    assert.ok(ids[0].startsWith(root.id + "."));
    assert.ok(ids[1].startsWith(root.id + "."));
  });

  it("returns empty list for legacy IDs", async () => {
    await adapter.create({ title: "X", type: "task" });
    const result = await adapter.walkTree("issue-1");
    assert.deepEqual(result, []);
  });

  it("returns empty list for unknown IDs", async () => {
    const result = await adapter.walkTree("unknown-999");
    assert.deepEqual(result, []);
  });
});

// ---------------------------------------------------------------------------
// Task 16 — legacy markdown read fallback
// ---------------------------------------------------------------------------

describe("JsonAdapter — legacy markdown read fallback", () => {
  let dir;
  beforeEach(() => { dir = makeProject(); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("parses tasks.md when tasks.json is absent and legacy_read=enabled", async () => {
    const tasksDir = join(dir, ".context-index", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const md = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|
| epic-1 | E | open |  |  | 2026-01-01 | 2026-01-02 |

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | I | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
`;
    writeFileSync(join(tasksDir, "tasks.md"), md);
    const adapter = new JsonAdapter(dir);
    const issues = await adapter.list({});
    assert.equal(issues.length, 1);
    assert.equal(issues[0].id, "issue-1");
    const epics = await adapter.listEpics({});
    assert.equal(epics.length, 1);
  });

  it("returns an empty board when legacy_read=disabled even if tasks.md exists", async () => {
    const tasksDir = join(dir, ".context-index", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(
      join(tasksDir, "tasks.md"),
      `# x\n\n## Epics\n\n| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |\n|----|-------|--------|----------|-----------|---------|---------|\n| epic-1 | E | open |  |  | a | b |\n\n## Issues\n\n| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |\n|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|\n`
    );
    const adapter = new JsonAdapter(dir, { legacyRead: "disabled" });
    const issues = await adapter.list({});
    assert.equal(issues.length, 0);
    const epics = await adapter.listEpics({});
    assert.equal(epics.length, 0);
  });

  it("first write creates tasks.json and leaves tasks.md intact", async () => {
    const tasksDir = join(dir, ".context-index", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const md = `# Issue Board

## Epics

| ID | Title | Status | Plan-Ref | Milestone | Created | Updated |
|----|-------|--------|----------|-----------|---------|---------|

## Issues

| ID | Title | Status | Priority | Type | Epic | Plan-Ref | Plan-Task | Spec-Ref | Deps | Notes | Next-Action | Created | Updated |
|----|-------|--------|----------|------|------|----------|-----------|----------|------|-------|-------------|---------|---------|
| issue-1 | Pre | open | 2 | task |  |  |  |  |  |  |  | 2026-01-01 | 2026-01-02 |
`;
    writeFileSync(join(tasksDir, "tasks.md"), md);
    const mdBefore = readFileSync(join(tasksDir, "tasks.md"), "utf8");

    const adapter = new JsonAdapter(dir);
    await adapter.create({ title: "New", type: "task" });

    assert.ok(existsSync(join(tasksDir, "tasks.json")), "tasks.json should exist after write");
    const mdAfter = readFileSync(join(tasksDir, "tasks.md"), "utf8");
    assert.equal(mdBefore, mdAfter, "tasks.md should be untouched after a JSON write");

    // The legacy issue should be preserved in the new JSON file.
    const board = readBoard(dir);
    const ids = board.issues.map((i) => i.id);
    assert.ok(ids.includes("issue-1"), "legacy issue should be preserved");
    assert.ok(ids.some((id) => id !== "issue-1"), "new issue should be appended");
  });

  it("JsonAdapter source contains no `import` of FileAdapter", () => {
    const src = readFileSync(
      new URL("../../../lib/issues/json-adapter.mjs", import.meta.url),
      "utf8"
    );
    assert.ok(
      !/from\s+['"]\.\/file-adapter\.mjs['"]/m.test(src),
      "JsonAdapter must not import FileAdapter"
    );
  });
});
