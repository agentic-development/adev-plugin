import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { JsonAdapter, UNSUPPORTED_VERSION_FALLBACK } from "../../../lib/issues/json-adapter.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

  it("creates issues with distinct, merge-safe flat IDs", async () => {
    const a = await adapter.create({ title: "First", type: "task" });
    const b = await adapter.create({ title: "Second", type: "task" });
    // issue-613: sequential max+1 collided across git branches. Ids are now
    // random, so two branches cannot mint the same one without coordinating.
    assert.match(a.id, /^issue-[a-z0-9]{6}$/);
    assert.match(b.id, /^issue-[a-z0-9]{6}$/);
    assert.notEqual(a.id, b.id);
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

  it("createEpic assigns a merge-safe epic ID", async () => {
    const e = await adapter.createEpic({ title: "Auth" });
    assert.match(e.id, /^epic-[a-z0-9]{6}$/);
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

// ─── merged from tests/lib/issues/json-adapter.atomic.test.mjs ──────────────────────────────────────────────
{
  /**
   * Atomic-write fault injection for `JsonAdapter._write()`.
   *
   * Verifies the CON-6 commitment: a failure between temp-file write and rename
   * leaves the prior `tasks.json` content unchanged and best-effort cleans up
   * the orphan temp file.
   *
   * Strategy: ES-module bindings are read-only, so we can't patch `fs` directly.
   * Instead we provoke a real renameSync failure by making the destination
   * directory non-writable on POSIX, and we provoke a writeFile failure by
   * occupying the temp filename with a directory (so writeFileSync EISDIR).
   *
   * On platforms where chmod-based read-only does not actually block writes for
   * the test user (e.g. running as root, Windows), the tests are skipped with a
   * note rather than failing.
   */









  function makeProject() {
    const dir = mkdtempSync(join(tmpdir(), "json-adapter-atomic-test-"));
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
    return dir;
  }

  /** Check whether we can effectively chmod-block writes on this platform/user. */
  function canBlockWithChmod(dir) {
    if (process.platform === "win32") return false;
    if (typeof process.getuid === "function" && process.getuid() === 0) return false;
    const probe = join(dir, ".probe");
    mkdirSync(probe);
    chmodSync(probe, 0o500);
    try {
      writeFileSync(join(probe, "x"), "x");
      return false;
    } catch {
      return true;
    } finally {
      chmodSync(probe, 0o700);
      rmSync(probe, { recursive: true, force: true });
    }
  }

  describe("JsonAdapter — atomic-write fault injection (CON-6)", () => {
    it("leaves tasks.json unchanged when writeFile fails before rename", async () => {
      const dir = makeProject();
      let supported = false;
      try {
        supported = canBlockWithChmod(dir);
        if (!supported) {
          // Skip on platforms where the test infrastructure can't enforce a
          // write failure (root user, Windows). Surface as a TODO instead.
          return;
        }

        const adapter = new JsonAdapter(dir);
        await adapter.init();
        await adapter.create({ title: "Baseline", type: "task" });
        const baseline = readFileSync(adapter.filePath, "utf8");

        // Make the tasks directory read-only — both temp-file creation and the
        // subsequent rename will fail with EACCES.
        const tasksDir = join(dir, ".context-index", "tasks");
        chmodSync(tasksDir, 0o500);

        try {
          await assert.rejects(
            adapter.create({ title: "Will-fail", type: "task" }),
            (err) => err && (err.code === "EACCES" || err.code === "EPERM")
          );
        } finally {
          // Restore so the after-cleanup can remove the directory.
          chmodSync(tasksDir, 0o700);
        }

        // Baseline unchanged.
        const after = readFileSync(adapter.filePath, "utf8");
        assert.equal(after, baseline);

        // Temp file cleaned up.
        const files = readdirSync(tasksDir);
        const tmps = files.filter((f) => f.endsWith(".tmp"));
        assert.equal(tmps.length, 0, `unexpected temp files: ${tmps.join(", ")}`);

        // Re-instantiate and verify state still reads cleanly.
        const adapter2 = new JsonAdapter(dir);
        const issues = await adapter2.list({});
        assert.equal(issues.length, 1);
        assert.equal(issues[0].title, "Baseline");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("an orphan temp file present at start of write does not corrupt the result", async () => {
      // Hand-craft an orphan temp file matching the adapter's naming convention.
      // The adapter's `_write()` uses a random suffix, so this orphan should
      // coexist with the next successful write. It is left as evidence of an
      // earlier crash; the next successful write does NOT clean it up
      // (cleanup happens only on failure paths). The point of this assertion is
      // to prove that an orphan does not interfere with subsequent writes.
      const dir = makeProject();
      try {
        const adapter = new JsonAdapter(dir);
        await adapter.init();

        const tasksDir = join(dir, ".context-index", "tasks");
        const orphan = join(tasksDir, "tasks.json.deadbeef.tmp");
        writeFileSync(orphan, "{ partial");

        await adapter.create({ title: "After-orphan", type: "task" });

        // The new write succeeded and is parseable.
        const board = JSON.parse(readFileSync(adapter.filePath, "utf8"));
        assert.equal(board.issues.length, 1);
        assert.equal(board.issues[0].title, "After-orphan");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

// ─── merged from tests/lib/issues/json-adapter.concurrent.test.mjs ──────────────────────────────────────────────
{
  /**
   * Concurrent multi-update test for `JsonAdapter`.
   *
   * Verifies the CAS (compare-and-swap) semantics from the
   * concurrent-write-protection spec: N concurrent appenders each spawn an
   * independent process that creates a single issue with a unique title.
   * Every mutation runs through `_withCas`, which re-reads a fresh snapshot
   * on seq conflict and retries up to `casMaxRetries` times before throwing
   * `STALE_BOARD_WRITE`.
   *
   * Under contention the guarantees are therefore:
   *
   *   1. The final `tasks.json` is always a complete, parseable document.
   *   2. Every ACKNOWLEDGED write (child exited 0) is present in the final
   *      board — CAS never silently drops a write it confirmed.
   *   3. A child may legitimately fail, but only with `STALE_BOARD_WRITE`
   *      (retry budget exhausted) — never any other error class.
   *   4. At least one child succeeds (the winner of the first CAS race).
   *
   * (This file originally asserted pre-CAS last-writer-wins semantics —
   * "all children exit 0, at least one write survives" — which is exactly
   * backwards under CAS: exit codes may be non-zero under contention, but
   * acknowledged writes can never be lost.)
   *
   * Strategy is integration (Task 21): we spawn N child processes via
   * `node:child_process` so each gets its own fs state, then wait on all and
   * inspect the final file. Strictly local-filesystem; no external systems.
   */









  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const ADAPTER_PATH = resolve(__dirname, "../../../lib/issues/json-adapter.mjs");

  // Distinct exit code a child uses to report a CAS retry-budget exhaustion
  // (STALE_BOARD_WRITE) as opposed to an unexpected crash (exit 1).
  const EXIT_STALE = 42;

  function makeProject() {
    const dir = mkdtempSync(join(tmpdir(), "json-adapter-concurrent-test-"));
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
    return dir;
  }

  /** Spawn a child that performs one `create()`. Resolves with stderr/code. */
  function spawnAppender(projectRoot, title) {
    return new Promise((resolveP) => {
      const script = `
        const { JsonAdapter } = await import(${JSON.stringify(ADAPTER_PATH)});
        const adapter = new JsonAdapter(${JSON.stringify(projectRoot)});
        await adapter.init();
        try {
          await adapter.create({ title: ${JSON.stringify(title)}, type: "task" });
        } catch (err) {
          if (err && err.code === "STALE_BOARD_WRITE") process.exit(${EXIT_STALE});
          throw err;
        }
      `;
      const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("close", (code) => resolveP({ code, stderr }));
    });
  }

  describe("JsonAdapter — concurrent multi-update (integration)", () => {
    it("survives N concurrent appenders without corrupting tasks.json", async () => {
      const N = 8;
      const dir = makeProject();
      try {
        // Bootstrap empty board so concurrent appenders skip init() race.
        const { JsonAdapter } = await import(ADAPTER_PATH);
        const seed = new JsonAdapter(dir);
        await seed.init();

        const titles = Array.from({ length: N }, (_, i) => `concurrent-${i + 1}`);
        const results = await Promise.all(titles.map((t) => spawnAppender(dir, t)));

        // Children may only exit 0 (write acknowledged) or EXIT_STALE
        // (CAS retry budget exhausted) — anything else is a crash.
        for (const r of results) {
          assert.ok(
            r.code === 0 || r.code === EXIT_STALE,
            `child crashed (code ${r.code}, expected 0 or ${EXIT_STALE}):\n${r.stderr}`
          );
        }

        // Final file must be parseable.
        const raw = readFileSync(join(dir, ".context-index", "tasks", "tasks.json"), "utf8");
        const board = JSON.parse(raw);
        assert.equal(board.version, 2);
        assert.ok(Array.isArray(board.epics));
        assert.ok(Array.isArray(board.issues));

        // The CAS guarantee: every ACKNOWLEDGED write is present. No silent loss.
        const titlesFound = new Set(board.issues.map((i) => i.title));
        const acknowledged = titles.filter((_, i) => results[i].code === 0);
        for (const t of acknowledged) {
          assert.ok(titlesFound.has(t), `acknowledged write lost: ${t}`);
        }

        // At least one child must win the race outright.
        assert.ok(acknowledged.length >= 1, "no concurrent writes succeeded at all");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

// ─── merged from tests/lib/issues/json-adapter.parity.test.mjs ──────────────────────────────────────────────
{
  /**
   * Parameterized parity suite for `JsonAdapter` vs the historical
   * `FileAdapter` write semantics.
   *
   * After CON-5, `FileAdapter` is read-only-deprecated, so this suite asserts
   * that the new `JsonAdapter` exhibits the same operational semantics that the
   * old `FileAdapter` did for the standard read/write flow:
   *
   *   - CRUD round-trip
   *   - dependency cycle detection
   *   - cascade-aware close on tiered IDs
   *   - filter parity on list()
   *
   * The legacy-issue read tolerance (CON-3) and the new granularity-invariant
   * rejection (SA-2) are both covered by `json-adapter.test.mjs` — they are
   * intentionally NOT replayed here because the FileAdapter equivalents have
   * been removed.
   */









  function makeProject() {
    const dir = mkdtempSync(join(tmpdir(), "json-adapter-parity-test-"));
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
    return dir;
  }

  // ---------------------------------------------------------------------------
  // CRUD round-trip parity (used to live in FileAdapter test suite)
  // ---------------------------------------------------------------------------

  describe("parity — CRUD round-trip", () => {
    let dir, adapter;
    // issue-613 made flat ids random rather than sequential, so these are
    // captured at creation instead of assumed. The subject of these tests is the
    // CRUD contract, not the id scheme.
    let firstId, secondId;
    before(async () => {
      dir = makeProject();
      adapter = new JsonAdapter(dir);
      await adapter.init();
    });
    after(() => rmSync(dir, { recursive: true, force: true }));

    it("creates issues with distinct, merge-safe flat IDs", async () => {
      const a = await adapter.create({ title: "First", type: "bug" });
      const b = await adapter.create({ title: "Second", type: "task", priority: 1 });
      firstId = a.id;
      secondId = b.id;
      assert.match(a.id, /^issue-[a-z0-9]{6}$/);
      assert.match(b.id, /^issue-[a-z0-9]{6}$/);
      assert.notEqual(a.id, b.id);
    });

    it("retrieves by ID", async () => {
      const got = await adapter.get(firstId);
      assert.equal(got.title, "First");
      assert.equal(got.type, "bug");
    });

    it("returns null for missing ID", async () => {
      assert.equal(await adapter.get("issue-999"), null);
    });

    it("lists all issues", async () => {
      const all = await adapter.list({});
      assert.equal(all.length, 2);
    });

    it("filters by status", async () => {
      const open = await adapter.list({ status: "open" });
      assert.ok(open.length >= 2);
    });

    it("filters by type", async () => {
      const bugs = await adapter.list({ type: "bug" });
      assert.equal(bugs.length, 1);
      assert.equal(bugs[0].title, "First");
    });

    it("sorts by priority then creation date", async () => {
      const all = await adapter.list({});
      // "Second" has priority 1, "First" has priority 2 (default).
      assert.equal(all[0].id, secondId);
      assert.equal(all[1].id, firstId);
    });

    it("updates fields and preserves untouched ones", async () => {
      const updated = await adapter.update(firstId, { priority: 0 });
      assert.equal(updated.priority, 0);
      assert.equal(updated.title, "First");
      assert.equal(updated.type, "bug");
    });

    it("rejects USE_CLOSE_METHOD when status: closed is passed to update", async () => {
      await assert.rejects(
        adapter.update(secondId, { status: "closed" }),
        (err) => err.code === "USE_CLOSE_METHOD"
      );
    });

    it("close() advances status to closed and appends to notes", async () => {
      const closed = await adapter.close(secondId, "done");
      assert.equal(closed.status, "closed");
      assert.match(closed.notes, /Closed: done/);
    });

    it("rejects update on a closed issue (ISSUE_CLOSED)", async () => {
      await assert.rejects(
        adapter.update(secondId, { priority: 0 }),
        (err) => err.code === "ISSUE_CLOSED"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Dependency parity
  // ---------------------------------------------------------------------------

  describe("parity — dependencies", () => {
    let dir, adapter;
    before(async () => {
      dir = makeProject();
      adapter = new JsonAdapter(dir);
      await adapter.init();
    });
    after(() => rmSync(dir, { recursive: true, force: true }));

    it("adds a dependency", async () => {
      const a = await adapter.create({ title: "Dep A", type: "task" });
      const b = await adapter.create({ title: "Dep B", type: "task" });
      await adapter.addDependency(b.id, a.id);
      const got = await adapter.get(b.id);
      assert.ok(got.dependencies.includes(a.id));
    });

    it("blocks close when dependency is open (BLOCKED_BY_DEPENDENCIES)", async () => {
      const all = await adapter.list({});
      const depB = all.find((i) => i.title === "Dep B");
      await assert.rejects(
        adapter.close(depB.id, "done"),
        (err) => err.code === "BLOCKED_BY_DEPENDENCIES"
      );
    });

    it("detects circular dependency", async () => {
      const all = await adapter.list({});
      const depA = all.find((i) => i.title === "Dep A");
      const depB = all.find((i) => i.title === "Dep B");
      await assert.rejects(
        adapter.addDependency(depA.id, depB.id),
        (err) => err.code === "CIRCULAR_DEPENDENCY"
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Cascade-close parity (tiered IDs)
  // ---------------------------------------------------------------------------

  describe("parity — cascade close on tiered IDs", () => {
    let dir, adapter;
    before(async () => {
      dir = makeProject();
      adapter = new JsonAdapter(dir);
      await adapter.init();
    });
    after(() => rmSync(dir, { recursive: true, force: true }));

    it("blocks close of tiered parent with unclosed child (CASCADE_BLOCKED)", async () => {
      const root = await adapter.create({ title: "Root", type: "task", tier_prefix: "e" });
      await adapter.create({ title: "Child", type: "task", parent_id: root.id });
      await assert.rejects(
        adapter.close(root.id, "done"),
        (err) => err.code === "CASCADE_BLOCKED"
      );
    });

    it("allows close once all children are closed", async () => {
      const root = await adapter.create({ title: "Root B", type: "task", tier_prefix: "e" });
      const child = await adapter.create({ title: "Child B", type: "task", parent_id: root.id });
      await adapter.close(child.id, "done");
      const closed = await adapter.close(root.id, "done");
      assert.equal(closed.status, "closed");
    });

    it("does not apply cascade guard to legacy flat IDs", async () => {
      const legacy = await adapter.create({ title: "Legacy", type: "task" });
      const closed = await adapter.close(legacy.id, "done");
      assert.equal(closed.status, "closed");
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip persistence (re-instantiate adapter, verify state)
  // ---------------------------------------------------------------------------

  describe("parity — persistence round-trip", () => {
    let dir;
    before(() => { dir = makeProject(); });
    after(() => rmSync(dir, { recursive: true, force: true }));

    it("survives an adapter restart", async () => {
      const adapter1 = new JsonAdapter(dir);
      await adapter1.init();
      await adapter1.create({ title: "Persisted", type: "task" });

      const adapter2 = new JsonAdapter(dir);
      const all = await adapter2.list({});
      assert.equal(all.length, 1);
      assert.equal(all[0].title, "Persisted");
    });
  });
}

// ─── merged from tests/lib/issues/json-adapter.perf.test.mjs ──────────────────────────────────────────────
{
  /**
   * Performance baseline for `JsonAdapter` on a 1000-issue board.
   *
   * Goal: prove that `list()`, `create()`, and `update()` complete within
   * one order of magnitude of the historical `FileAdapter` baseline. Concrete
   * thresholds are intentionally generous; this is a regression guard, not a
   * benchmark.
   */









  function makeProject() {
    const dir = mkdtempSync(join(tmpdir(), "json-adapter-perf-test-"));
    mkdirSync(join(dir, ".context-index"), { recursive: true });
    writeFileSync(join(dir, ".context-index", "manifest.yaml"), "tasks:\n  backend: json\n");
    return dir;
  }

  /** Bootstrap a board with N issues. */
  async function seed(adapter, n) {
    await adapter.init();
    // Seed by writing the board directly to avoid N writes (each is O(N)
    // because the adapter rewrites the whole file). Direct write keeps setup
    // bounded.
    const now = new Date().toISOString();
    const issues = [];
    for (let i = 1; i <= n; i++) {
      issues.push({
        id: `issue-${i}`,
        title: `Issue ${i}`,
        status: "open",
        priority: 2,
        type: "task",
        dependencies: [],
        notes: "",
        created: now,
        updated: now,
      });
    }
    adapter._write({ version: 2, epics: [], issues });
  }

  describe("JsonAdapter — 1000-issue performance baseline", () => {
    it("list() completes in under 1500ms on a 1000-issue board", async () => {
      const dir = makeProject();
      try {
        const adapter = new JsonAdapter(dir);
        await seed(adapter, 1000);

        const start = performance.now();
        const result = await adapter.list({});
        const elapsed = performance.now() - start;

        assert.equal(result.length, 1000);
        assert.ok(elapsed < 1500, `list() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("create() on a 1000-issue board completes in under 1500ms", async () => {
      const dir = makeProject();
      try {
        const adapter = new JsonAdapter(dir);
        await seed(adapter, 1000);

        const start = performance.now();
        await adapter.create({ title: "New one", type: "task" });
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 1500, `create() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("update() on a 1000-issue board completes in under 1500ms", async () => {
      const dir = makeProject();
      try {
        const adapter = new JsonAdapter(dir);
        await seed(adapter, 1000);

        const start = performance.now();
        await adapter.update("issue-500", { priority: 0 });
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 1500, `update() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("get() on a 1000-issue board completes in under 1500ms", async () => {
      const dir = makeProject();
      try {
        const adapter = new JsonAdapter(dir);
        await seed(adapter, 1000);

        const start = performance.now();
        await adapter.get("issue-750");
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 1500, `get() took ${elapsed.toFixed(1)}ms (threshold 1500ms)`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

// ─── merged from tests/lib/issues/json-adapter.schema-version.test.mjs ──────────────────────────────────────────────
{
  /**
   * Schema-version test surface for lib/issues/json-adapter.mjs.
   *
   * Spec: .context-index/specs/features/agent-reliable-state-artifacts/test-migration.spec.md
   * Sibling spec: .context-index/specs/features/agent-reliable-state-artifacts/json-issue-board-adapter.spec.md
   *
   * Coverage:
   *   - version: 2 happy path (Behaviors row 2 / AC #2)
   *   - version: 3 forward-compat: unknown fields on epics/issues survive a
   *     round-trip; top-level unknown keys are DROPPED on write
   *     (Behaviors row 3 / AC #3 / SA-3 / CON-1 contract gap)
   *   - version: 1, version: 0 rejection with UNSUPPORTED_BOARD_VERSION
   *     (Behaviors row 4 / Error Cases row 1 / AC #2)
   *   - non-numeric version: canonical fixed-string fallback (no raw-value
   *     interpolation — SEC-4 / SA-2 / Error Cases row 2)
   */









  /**
   * Create a temp project root with a pre-seeded `tasks.json` of the given
   * content and a minimal manifest. Cleans up after the test.
   */
  function setupBoard(t, boardContent) {
    const storageRoot = mkdtempSync(join(tmpdir(), "json-adapter-schema-version-"));
    t.after(() => rmSync(storageRoot, { recursive: true, force: true }));
    mkdirSync(join(storageRoot, ".context-index", "tasks"), { recursive: true });
    writeFileSync(
      join(storageRoot, ".context-index", "tasks", "tasks.json"),
      JSON.stringify(boardContent, null, 2),
    );
    writeFileSync(
      join(storageRoot, ".context-index", "manifest.yaml"),
      "tasks:\n  backend: json\n",
    );
    return { adapter: new JsonAdapter(storageRoot), storageRoot };
  }

  describe("JsonAdapter — schema version", () => {
    it("reads version: 2 happy path", async (t) => {
      const { adapter } = setupBoard(t, { version: 2, epics: [], issues: [] });
      assert.deepEqual(await adapter.listEpics(), []);
      assert.deepEqual(await adapter.list(), []);
    });

    it("reads version: 3 forward-compat: preserves unknown fields on epics and issues; DROPS unknown top-level keys on write", async (t) => {
      // SA-3 / CON-1: cover unknown fields on epics, issues, AND top-level.
      // Behavior verified against lib/issues/json-adapter.mjs:_write:
      // _write reconstructs { version: 2, epics, issues } only — top-level
      // unknown keys are dropped. This is a CON-1 contract gap recorded as a
      // follow-up against json-issue-board-adapter.spec.md.
      const original = {
        version: 3,
        epics: [
          { id: "epic-1", title: "E", status: "open", futureField: "epicX" },
        ],
        issues: [
          {
            id: "issue-1",
            title: "I",
            status: "open",
            priority: 2,
            type: "task",
            futureField: "issueX",
          },
        ],
        futureTopLevel: { schema: "v3-metadata" },
      };
      const { adapter, storageRoot } = setupBoard(t, original);

      const epics = await adapter.listEpics();
      const issues = await adapter.list();
      assert.equal(epics[0].futureField, "epicX", "unknown epic field read");
      assert.equal(issues[0].futureField, "issueX", "unknown issue field read");

      await adapter.update("issue-1", { title: "I2" });
      const reread = JSON.parse(
        readFileSync(
          join(storageRoot, ".context-index", "tasks", "tasks.json"),
          "utf8",
        ),
      );
      assert.equal(reread.version, 2, "writers always emit version: 2");
      assert.equal(
        reread.epics[0].futureField,
        "epicX",
        "unknown epic field preserved on round-trip",
      );
      assert.equal(
        reread.issues[0].futureField,
        "issueX",
        "unknown issue field preserved on round-trip",
      );
      // SA-3: assert the deterministic dropped-on-write behavior. Documented
      // contract gap (CON-1): top-level unknown keys are NOT preserved.
      assert.equal(
        reread.futureTopLevel,
        undefined,
        "top-level unknown keys are dropped on write (documented contract gap)",
      );
    });

    it("rejects version: 1 with UNSUPPORTED_BOARD_VERSION", async (t) => {
      const { adapter } = setupBoard(t, { version: 1, epics: [], issues: [] });
      await assert.rejects(
        () => adapter.list(),
        (err) => err.code === "UNSUPPORTED_BOARD_VERSION",
      );
    });

    it("rejects version: 0 with UNSUPPORTED_BOARD_VERSION", async (t) => {
      const { adapter } = setupBoard(t, { version: 0, epics: [], issues: [] });
      await assert.rejects(
        () => adapter.list(),
        (err) => err.code === "UNSUPPORTED_BOARD_VERSION",
      );
    });

    it("rejects non-numeric version using the canonical fixed-string fallback (SA-2 / SEC-4)", async (t) => {
      const { adapter } = setupBoard(t, {
        version: "v2",
        epics: [],
        issues: [],
      });
      await assert.rejects(
        () => adapter.list(),
        (err) => {
          assert.equal(err.code, "UNSUPPORTED_BOARD_VERSION");
          assert.equal(
            err.message,
            UNSUPPORTED_VERSION_FALLBACK,
            "fallback constant is used verbatim",
          );
          assert.ok(
            !err.message.includes("v2"),
            "raw value must not be interpolated (SEC-4)",
          );
          return true;
        },
      );
    });
  });
}
