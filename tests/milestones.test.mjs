import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadMilestones,
  saveMilestones,
  findMilestone,
  validateMilestoneName,
  validateTargetDate,
  milestoneCreate,
  milestoneList,
  milestoneDefer,
  evaluateShipCriteria,
  milestoneShip,
  resolveStrategy,
  warnIfMilestoneUndefined,
  getMilestoneStatusData,
} from "../lib/milestones.mjs";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Set up a temp project root with `.context-index/manifest.yaml` so the
 * path-safety defenses (validateProjectRoot) accept the directory.
 *
 * Mirrors the makeProject() helper in tests/lib/issues/json-adapter.test.mjs.
 */
function makeProject(prefix = "milestone-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, ".context-index"), { recursive: true });
  writeFileSync(
    join(dir, ".context-index", "manifest.yaml"),
    "tasks:\n  backend: json\n"
  );
  return dir;
}

/** Read the raw milestones.json file (for byte-level assertions). */
function readMilestonesRaw(dir) {
  return readFileSync(join(dir, ".context-index", "milestones.json"), "utf8");
}

/** Write `.context-index/governance/gates.yaml` into a temp project. */
function writeGates(dir, yaml) {
  mkdirSync(join(dir, ".context-index", "governance"), { recursive: true });
  writeFileSync(join(dir, ".context-index", "governance", "gates.yaml"), yaml);
}

/**
 * Mirror of this repo's own gates.yaml shape (verified 2026-08-14):
 * a required fast `test` gate (severity error) and a non-required
 * integration gate (required: false → severity warning).
 */
const GATES_FIXTURE = [
  "gates:",
  "  - id: test",
  "    name: Test Suite",
  "    kind: deterministic",
  "    tier: fast",
  "    command: [npm, test]",
  "    required: true",
  "    severity: error",
  "  - id: integration-test",
  "    name: Integration Tests",
  "    kind: deterministic",
  "    tier: integration",
  "    command: [npm, run, test:evals]",
  "    required: false",
  "    severity: warning",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// Task 1: schema lock — JSON document shape + byte format
// ---------------------------------------------------------------------------

describe("milestones.json schema (Task 1)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-schema-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("writes the canonical { version, milestones } document shape", () => {
    const fixture = [
      {
        name: "v1.0.0",
        status: "planned",
        epic_id: "epic-1",
        target_date: "2026-06-01",
        release: { strategy: "tag-only" },
        ship_criteria: [
          { check: "all_issues_closed" },
          { check: "gates_pass" },
          { confirm: "CHANGELOG updated" },
        ],
        defer_reason: null,
      },
    ];
    saveMilestones(dir, fixture);
    const raw = readMilestonesRaw(dir);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.ok(Array.isArray(parsed.milestones));
    assert.equal(parsed.milestones.length, 1);
    assert.equal(parsed.milestones[0].name, "v1.0.0");
    assert.deepStrictEqual(parsed.milestones[0].release, { strategy: "tag-only" });
    assert.equal(parsed.milestones[0].ship_criteria.length, 3);
  });

  it("uses exact 2-space indentation and a single trailing newline", () => {
    saveMilestones(dir, [
      { name: "v1", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [], defer_reason: null },
    ]);
    const raw = readMilestonesRaw(dir);
    // Exactly one trailing newline (not two).
    assert.ok(raw.endsWith("\n"), "expected trailing newline");
    assert.ok(!raw.endsWith("\n\n"), "expected exactly one trailing newline");
    // Indentation is exactly 2 spaces (not 4 spaces, not tabs).
    assert.ok(/\n {2}"version":/.test(raw) || /\n {2}"milestones":/.test(raw),
      `expected 2-space indent, got: ${raw.slice(0, 200)}`);
    // Tab character absent.
    assert.ok(!raw.includes("\t"), "JSON output must not contain tabs");
  });

  it("byte-shape parity: full fixture round-trips identically", () => {
    const fixture = [
      {
        name: "0.25.0",
        status: "planned",
        epic_id: "epic-63",
        target_date: "2026-05-14",
        release: { strategy: "release-please" },
        ship_criteria: [
          { check: "all_issues_closed" },
          { check: "gates_pass" },
          { confirm: "CHANGELOG updated" },
        ],
        defer_reason: null,
      },
    ];
    saveMilestones(dir, fixture);
    const loaded = loadMilestones(dir);
    assert.deepStrictEqual(loaded, fixture);
  });
});

// ---------------------------------------------------------------------------
// Task 2/3/7: loadMilestones — JSON I/O, error codes, default coercion
// ---------------------------------------------------------------------------

describe("loadMilestones (Tasks 2, 3, 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-load-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty array when milestones.json does not exist", () => {
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when milestones key is missing", () => {
    writeFileSync(
      join(dir, ".context-index", "milestones.json"),
      JSON.stringify({ version: 1, other_key: "value" }) + "\n"
    );
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when milestones value is not an array", () => {
    writeFileSync(
      join(dir, ".context-index", "milestones.json"),
      JSON.stringify({ version: 1, milestones: "wiped" }) + "\n"
    );
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });

  it("throws PARSE_ERROR for malformed JSON", () => {
    writeFileSync(
      join(dir, ".context-index", "milestones.json"),
      "{ not: valid json :: $"
    );
    assert.throws(
      () => loadMilestones(dir),
      (err) =>
        err.code === "PARSE_ERROR" &&
        err.message.includes("milestones.json is malformed")
    );
  });

  it("applies field-default coercion for sparse entries", () => {
    writeFileSync(
      join(dir, ".context-index", "milestones.json"),
      JSON.stringify({ version: 1, milestones: [{}] }) + "\n"
    );
    const result = loadMilestones(dir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "");
    assert.equal(result[0].status, "planned");
    assert.equal(result[0].epic_id, null);
    assert.equal(result[0].target_date, null);
    assert.equal(result[0].release, null);
    assert.deepStrictEqual(result[0].ship_criteria, []);
    assert.equal(result[0].defer_reason, null);
  });

  it("loadMilestones is synchronous (CON-5): returns array directly, not a Promise", () => {
    saveMilestones(dir, [{ name: "sync-check", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [] }]);
    const result = loadMilestones(dir);
    assert.ok(Array.isArray(result), "expected array, not Promise");
    // A Promise has a .then function; an array does not.
    assert.equal(typeof result.then, "undefined", "expected non-thenable");
  });
});

// ---------------------------------------------------------------------------
// Task 2/6: saveMilestones — atomic write, file creation
// ---------------------------------------------------------------------------

describe("saveMilestones (Tasks 2, 6)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-save-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestones.json with milestone entries", () => {
    const ms = [{ name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: null, release: null, ship_criteria: [] }];
    saveMilestones(dir, ms);
    assert.ok(existsSync(join(dir, ".context-index", "milestones.json")));
  });

  it("round-trips through load", () => {
    const ms = [
      { name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", release: null, ship_criteria: [], defer_reason: null },
      { name: "v2.0.0", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [{ check: "gates_pass" }], defer_reason: null },
    ];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].name, "v1.0.0");
    assert.equal(loaded[0].target_date, "2026-06-01");
    assert.equal(loaded[1].name, "v2.0.0");
    assert.equal(loaded[1].epic_id, null);
    assert.equal(loaded[1].ship_criteria.length, 1);
  });

  it("leaves no temp files after a successful write", () => {
    saveMilestones(dir, [{ name: "v9", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [] }]);
    const files = readdirSync(join(dir, ".context-index"));
    const tmps = files.filter((f) => f.endsWith(".tmp"));
    assert.equal(tmps.length, 0, `unexpected temp files: ${tmps.join(", ")}`);
  });

  it("creates .context-index/ if the directory is missing under the storage root", () => {
    // Make a fresh project, then remove .context-index/ between manifest seed and saveMilestones.
    const dir2 = makeProject("milestone-mkdir-");
    try {
      // The manifest stays where it is; only milestones.json's parent needs creating
      // for the test (the .context-index/ already exists from makeProject).
      // To stress the mkdir-recursive behavior, write to a nested path:
      saveMilestones(dir2, []);
      assert.ok(existsSync(join(dir2, ".context-index", "milestones.json")));
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Task 7: findMilestone — preserved behavior
// ---------------------------------------------------------------------------

describe("findMilestone (Task 7)", () => {
  let dir;
  before(() => {
    dir = makeProject("milestone-find-");
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: null, release: null, ship_criteria: [] }]);
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns milestone by name", () => {
    const ms = findMilestone(dir, "v1");
    assert.equal(ms.name, "v1");
  });

  it("returns null for non-existent milestone", () => {
    const ms = findMilestone(dir, "nonexistent");
    assert.equal(ms, null);
  });
});

// ---------------------------------------------------------------------------
// Task 7: validators — pure (no I/O), behavior unchanged
// ---------------------------------------------------------------------------

describe("validateMilestoneName (Task 7)", () => {
  it("accepts valid names", () => {
    assert.doesNotThrow(() => validateMilestoneName("v1.0.0"));
    assert.doesNotThrow(() => validateMilestoneName("my-milestone_2"));
  });

  it("rejects empty name with MISSING_NAME", () => {
    assert.throws(() => validateMilestoneName(""), (err) => err.code === "MISSING_NAME");
    assert.throws(() => validateMilestoneName(null), (err) => err.code === "MISSING_NAME");
  });

  it("rejects invalid name with INVALID_NAME", () => {
    assert.throws(() => validateMilestoneName("bad name!"), (err) => err.code === "INVALID_NAME");
    assert.throws(() => validateMilestoneName("has spaces"), (err) => err.code === "INVALID_NAME");
  });
});

describe("validateTargetDate (Task 7)", () => {
  it("accepts valid YYYY-MM-DD", () => {
    assert.doesNotThrow(() => validateTargetDate("2026-06-01"));
  });

  it("rejects invalid date with INVALID_DATE", () => {
    assert.throws(() => validateTargetDate("not-a-date"), (err) => err.code === "INVALID_DATE");
    assert.throws(() => validateTargetDate("06-01-2026"), (err) => err.code === "INVALID_DATE");
  });
});

// ---------------------------------------------------------------------------
// resolveStrategy — pure, unchanged
// ---------------------------------------------------------------------------

describe("resolveStrategy", () => {
  it("returns 'manual' for null release (+3 more contract assertions)", () => {
    // returns 'manual' for null release
    assert.equal(resolveStrategy({ release: null }), "manual");

    // returns 'manual' for undefined release
    assert.equal(resolveStrategy({}), "manual");

    // returns 'manual' for release without strategy
    assert.equal(resolveStrategy({ release: {} }), "manual");

    // returns configured strategy for valid values
    assert.equal(resolveStrategy({ release: { strategy: "tag-only" } }), "tag-only");
    assert.equal(resolveStrategy({ release: { strategy: "release-please" } }), "release-please");
    assert.equal(resolveStrategy({ release: { strategy: "manual" } }), "manual");
  });

  it("throws UNKNOWN_STRATEGY for unrecognized values", () => {
    assert.throws(
      () => resolveStrategy({ release: { strategy: "custom" } }),
      (err) => err.code === "UNKNOWN_STRATEGY"
    );
  });
});

// ---------------------------------------------------------------------------
// release field I/O — JSON round-trip parity
// ---------------------------------------------------------------------------

describe("release field I/O", () => {
  let dir;
  before(() => { dir = makeProject("milestone-release-io-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips release object through save/load", () => {
    const ms = [{ name: "v1", status: "planned", epic_id: null, target_date: null,
                  release: { strategy: "tag-only" }, ship_criteria: [] }];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    assert.deepStrictEqual(loaded[0].release, { strategy: "tag-only" });
  });

  it("preserves release: null through save/load", () => {
    const ms = [{ name: "v2", status: "planned", epic_id: null, target_date: null,
                  release: null, ship_criteria: [] }];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    assert.equal(loaded[0].release, null);
  });

  it("loads entries without release field as null", () => {
    writeFileSync(
      join(dir, ".context-index", "milestones.json"),
      JSON.stringify({
        version: 1,
        milestones: [{ name: "legacy", status: "planned", epic_id: null, target_date: null, ship_criteria: [] }],
      }) + "\n"
    );
    const loaded = loadMilestones(dir);
    assert.equal(loaded[0].release, null);
  });
});

// ---------------------------------------------------------------------------
// Task 7: milestoneCreate — preserved behavior, auto-link-to-epic
// ---------------------------------------------------------------------------

describe("milestoneCreate (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-create-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestone entry and writes JSON", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-1", ...data }) };
    const result = await milestoneCreate(dir, "v1.0.0", { issueManager: mockManager });
    assert.equal(result.name, "v1.0.0");
    assert.equal(result.status, "planned");
    assert.equal(result.epic_id, "epic-1");
  });

  it("updates existing milestone idempotently (no duplicate)", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-2", ...data }) };
    await milestoneCreate(dir, "v2", { issueManager: mockManager });
    await milestoneCreate(dir, "v2", { issueManager: mockManager, targetDate: "2026-07-01" });
    const milestones = loadMilestones(dir);
    const v2s = milestones.filter((m) => m.name === "v2");
    assert.equal(v2s.length, 1);
    assert.equal(v2s[0].target_date, "2026-07-01");
  });

  it("rejects missing name", async () => {
    await assert.rejects(() => milestoneCreate(dir, "", {}), { code: "MISSING_NAME" });
  });

  it("rejects invalid name", async () => {
    await assert.rejects(() => milestoneCreate(dir, "bad name!", {}), { code: "INVALID_NAME" });
  });

  it("rejects invalid date", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-3", ...data }) };
    await assert.rejects(
      () => milestoneCreate(dir, "v3", { issueManager: mockManager, targetDate: "not-a-date" }),
      { code: "INVALID_DATE" }
    );
  });

  it("writes milestone without epic when no issue manager provided", async () => {
    const result = await milestoneCreate(dir, "v4", {});
    assert.equal(result.name, "v4");
    assert.equal(result.epic_id, null);
  });

  it("writes milestone with epic_id null when createEpic throws", async () => {
    const mockManager = { createEpic: async () => { throw new Error("backend down"); } };
    const result = await milestoneCreate(dir, "v5", { issueManager: mockManager });
    assert.equal(result.epic_id, null);
  });

  it("populates ship_criteria from check and confirm options", async () => {
    const mockManager = { createEpic: async (data) => ({ id: "epic-6", ...data }) };
    const result = await milestoneCreate(dir, "v6", {
      issueManager: mockManager,
      checks: ["all_issues_closed", "gates_pass"],
      confirms: ["CHANGELOG updated"],
    });
    assert.equal(result.ship_criteria.length, 3);
    assert.ok(result.ship_criteria.some((c) => c.check === "all_issues_closed"));
    assert.ok(result.ship_criteria.some((c) => c.confirm === "CHANGELOG updated"));
  });
});

describe("milestoneCreate with --strategy", () => {
  let dir;
  before(() => { dir = makeProject("milestone-strategy-create-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("sets release.strategy when strategy option provided", async () => {
    const result = await milestoneCreate(dir, "v1", { strategy: "tag-only" });
    assert.deepStrictEqual(result.release, { strategy: "tag-only" });
    const loaded = loadMilestones(dir);
    assert.deepStrictEqual(loaded[0].release, { strategy: "tag-only" });
  });

  it("leaves release as null when no strategy option", async () => {
    const result = await milestoneCreate(dir, "v2", {});
    assert.equal(result.release, null);
  });

  it("rejects unknown strategy with UNKNOWN_STRATEGY", async () => {
    await assert.rejects(
      () => milestoneCreate(dir, "v3", { strategy: "unknown" }),
      { code: "UNKNOWN_STRATEGY" }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 7: milestoneList
// ---------------------------------------------------------------------------

describe("milestoneList (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-list-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns formatted table when milestones exist", async () => {
    saveMilestones(dir, [
      { name: "v1", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", release: null, ship_criteria: [] },
    ]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-1", title: "v1", status: "open" }],
      list: async () => [{ id: "issue-1", status: "open" }, { id: "issue-2", status: "closed" }],
    };
    const output = await milestoneList(dir, { issueManager: mockManager });
    assert.ok(output.includes("v1"));
    assert.ok(output.includes("planned"));
    assert.ok(output.includes("1/2 open"));
  });

  it("returns help message when no milestones.json exists", async () => {
    const emptyDir = makeProject("milestone-list-empty-");
    try {
      const output = await milestoneList(emptyDir, {});
      assert.ok(output.includes("No milestones defined"));
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("shows broken epic warning for non-existent epic", async () => {
    saveMilestones(dir, [
      { name: "v2", status: "planned", epic_id: "epic-999", target_date: null, release: null, ship_criteria: [] },
    ]);
    const mockManager = {
      listEpics: async () => [],
      list: async () => [],
    };
    const output = await milestoneList(dir, { issueManager: mockManager });
    assert.ok(output.includes("(broken)"));
  });

  it("shows epic ID without progress when no issue manager", async () => {
    saveMilestones(dir, [
      { name: "v3", status: "planned", epic_id: "epic-10", target_date: null, release: null, ship_criteria: [] },
    ]);
    const output = await milestoneList(dir, {});
    assert.ok(output.includes("epic-10"));
    // No progress column populated
    assert.ok(output.includes("—"));
  });
});

// ---------------------------------------------------------------------------
// Integration test (create + list lifecycle)
// ---------------------------------------------------------------------------

describe("milestone create + list integration", () => {
  let dir;
  let epicCounter = 0;
  const mockManager = {
    createEpic: async (data) => ({ id: `epic-${++epicCounter}`, ...data }),
    listEpics: async () => {
      const milestones = loadMilestones(dir);
      return milestones
        .filter((m) => m.epic_id)
        .map((m) => ({ id: m.epic_id, title: m.name, status: "open" }));
    },
    list: async () => [],
  };

  before(() => {
    dir = makeProject("milestone-integration-");
    epicCounter = 0;
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("full lifecycle: create -> list -> create again (idempotent)", async () => {
    // Create
    const ms1 = await milestoneCreate(dir, "v1.0.0", { issueManager: mockManager, targetDate: "2026-06-01" });
    assert.equal(ms1.name, "v1.0.0");
    assert.equal(ms1.status, "planned");
    assert.ok(ms1.epic_id);

    // List
    const output = await milestoneList(dir, { issueManager: mockManager });
    assert.ok(output.includes("v1.0.0"));
    assert.ok(output.includes("planned"));
    assert.ok(output.includes("2026-06-01"));

    // Create again (idempotent) — same epic, not duplicated
    const ms2 = await milestoneCreate(dir, "v1.0.0", { issueManager: mockManager });
    assert.equal(ms2.epic_id, ms1.epic_id);
    const milestones = loadMilestones(dir);
    assert.equal(milestones.filter((m) => m.name === "v1.0.0").length, 1);
  });

  it("create with ship criteria", async () => {
    const ms = await milestoneCreate(dir, "v2.0.0", {
      issueManager: mockManager,
      checks: ["all_issues_closed", "gates_pass"],
      confirms: ["CHANGELOG updated"],
    });
    assert.equal(ms.ship_criteria.length, 3);
    assert.ok(ms.ship_criteria.some((c) => c.check === "all_issues_closed"));
    assert.ok(ms.ship_criteria.some((c) => c.confirm === "CHANGELOG updated"));
  });

  it("all error codes match spec", async () => {
    await assert.rejects(() => milestoneCreate(dir, "", {}), { code: "MISSING_NAME" });
    await assert.rejects(() => milestoneCreate(dir, "a b", {}), { code: "INVALID_NAME" });
    await assert.rejects(
      () => milestoneCreate(dir, "ok", { issueManager: mockManager, targetDate: "nope" }),
      { code: "INVALID_DATE" }
    );
  });

  it("exports are independently testable", () => {
    assert.equal(typeof loadMilestones, "function");
    assert.equal(typeof saveMilestones, "function");
    assert.equal(typeof findMilestone, "function");
    assert.equal(typeof milestoneCreate, "function");
    assert.equal(typeof milestoneList, "function");
    assert.equal(typeof validateMilestoneName, "function");
    assert.equal(typeof validateTargetDate, "function");
    assert.equal(typeof milestoneDefer, "function");
    assert.equal(typeof evaluateShipCriteria, "function");
    assert.equal(typeof milestoneShip, "function");
  });
});

// ---------------------------------------------------------------------------
// milestoneDefer (Task 7)
// ---------------------------------------------------------------------------

describe("milestoneDefer (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-defer-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("defers milestone with reason", async () => {
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: null, release: null, ship_criteria: [] }]);
    const mockManager = { updateEpic: async () => {} };
    const result = await milestoneDefer(dir, "v1", "Pushed to Q3", { issueManager: mockManager });
    assert.equal(result.status, "deferred");
    assert.equal(result.defer_reason, "Pushed to Q3");
    const ms = findMilestone(dir, "v1");
    assert.equal(ms.status, "deferred");
    assert.equal(ms.defer_reason, "Pushed to Q3");
  });

  it("rejects shipped milestone with ALREADY_SHIPPED", async () => {
    saveMilestones(dir, [{ name: "v2", status: "shipped", epic_id: "epic-2", target_date: null, release: null, ship_criteria: [] }]);
    await assert.rejects(() => milestoneDefer(dir, "v2", "Too late", {}), { code: "ALREADY_SHIPPED" });
  });

  it("idempotently re-defers with updated reason", async () => {
    saveMilestones(dir, [{ name: "v3", status: "deferred", epic_id: "epic-3", target_date: null, release: null, ship_criteria: [], defer_reason: "Old reason" }]);
    const mockManager = { updateEpic: async () => {} };
    const result = await milestoneDefer(dir, "v3", "New reason", { issueManager: mockManager });
    assert.equal(result.defer_reason, "New reason");
    const ms = findMilestone(dir, "v3");
    assert.equal(ms.defer_reason, "New reason");
  });

  it("rejects missing reason with MISSING_REASON", async () => {
    await assert.rejects(() => milestoneDefer(dir, "v1", "", {}), { code: "MISSING_REASON" });
  });

  it("rejects not-found milestone", async () => {
    await assert.rejects(() => milestoneDefer(dir, "nope", "reason", {}), { code: "MILESTONE_NOT_FOUND" });
  });

  it("defers without epic update when no issue manager", async () => {
    saveMilestones(dir, [{ name: "v4", status: "planned", epic_id: "epic-4", target_date: null, release: null, ship_criteria: [] }]);
    const result = await milestoneDefer(dir, "v4", "No backend", {});
    assert.equal(result.status, "deferred");
  });

  it("warns but does not roll back when epic update fails", async () => {
    saveMilestones(dir, [{ name: "v5", status: "planned", epic_id: "epic-5", target_date: null, release: null, ship_criteria: [] }]);
    const mockManager = { updateEpic: async () => { throw new Error("backend down"); } };
    const result = await milestoneDefer(dir, "v5", "Epic fail", { issueManager: mockManager });
    assert.equal(result.status, "deferred");
  });

  it("defer_reason round-trips through save/load", () => {
    const ms = [{ name: "rt", status: "deferred", epic_id: null, target_date: null, release: null, ship_criteria: [], defer_reason: "Test: special chars & colons" }];
    saveMilestones(dir, ms);
    const loaded = loadMilestones(dir);
    const found = loaded.find((m) => m.name === "rt");
    assert.equal(found.defer_reason, "Test: special chars & colons");
  });
});

// ---------------------------------------------------------------------------
// evaluateShipCriteria — unchanged
// ---------------------------------------------------------------------------

describe("evaluateShipCriteria", () => {
  it("returns passed: true when all issues closed", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [{ id: "issue-1", status: "closed" }, { id: "issue-2", status: "closed" }],
    };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, true);
  });

  it("returns passed: false when issues still open", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [{ id: "issue-1", status: "open" }, { id: "issue-2", status: "closed" }],
    };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, false);
    assert.ok(results[0].detail.includes("1"));
  });

  it("returns passed: null for confirm entries", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ confirm: "CHANGELOG updated" }] };
    const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, null);
    assert.equal(results[0].confirm, "CHANGELOG updated");
  });

  it("returns empty array when no ship_criteria", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [] };
    const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.deepStrictEqual(results, []);
  });

  it("throws BROKEN_EPIC when epic_id is null", async () => {
    const milestone = { name: "v1", epic_id: null, ship_criteria: [{ check: "all_issues_closed" }] };
    await assert.rejects(() => evaluateShipCriteria(milestone, {}, {}), { code: "BROKEN_EPIC" });
  });

  it("throws BROKEN_EPIC when epic not found", async () => {
    const milestone = { name: "v1", epic_id: "epic-999", ship_criteria: [{ check: "all_issues_closed" }] };
    const mockManager = { listEpics: async () => [] };
    await assert.rejects(() => evaluateShipCriteria(milestone, mockManager, {}), { code: "BROKEN_EPIC" });
  });

  it("returns failed for gates_pass when no projectRoot is supplied", async () => {
    const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "gates_pass" }] };
    const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
    const results = await evaluateShipCriteria(milestone, mockManager, {});
    assert.equal(results[0].passed, false);
    assert.ok(results[0].detail.includes("projectRoot"), results[0].detail);
    assert.ok(results[0].detail.includes("gates.yaml"), results[0].detail);
  });
});

// ---------------------------------------------------------------------------
// gates_pass — governance gates.yaml resolution (issue-525)
//
// Gate definitions moved out of `manifest.gates.*` into
// `.context-index/governance/gates.yaml`, merged by
// lib/domains/merge-gates.mjs, with argv-list commands.
// ---------------------------------------------------------------------------

describe("evaluateShipCriteria — gates_pass via governance gates.yaml (issue-525)", () => {
  const mockManager = { listEpics: async () => [{ id: "epic-1" }] };
  const milestone = { name: "v1", epic_id: "epic-1", ship_criteria: [{ check: "gates_pass" }] };

  /** Injectable runner: `outcomes` maps gate id → pass/fail. Records argv. */
  function recordingRunner(outcomes, seen) {
    return (gate) => {
      seen.push({ id: gate.id, command: gate.command });
      const ok = outcomes[gate.id] !== false;
      return { passed: ok, output: ok ? "" : `${gate.id} exploded` };
    };
  }

  it("resolves gates from gates.yaml and passes the argv command through unsplit", async () => {
    const dir = makeProject("gates-resolve-");
    try {
      writeGates(dir, GATES_FIXTURE);
      const seen = [];
      const results = await evaluateShipCriteria(milestone, mockManager, {}, {
        projectRoot: dir,
        runGate: recordingRunner({}, seen),
      });
      assert.equal(results[0].passed, true);
      // Both declared gates ran, in tier order (fast before integration),
      // each with its argv list intact — never a split shell string.
      assert.deepStrictEqual(seen, [
        { id: "test", command: ["npm", "test"] },
        { id: "integration-test", command: ["npm", "run", "test:evals"] },
      ]);
      assert.deepStrictEqual(
        results[0].gates.map((g) => [g.id, g.severity, g.passed]),
        [["test", "error", true], ["integration-test", "warning", true]],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails the criterion when an error-severity gate fails", async () => {
    const dir = makeProject("gates-error-");
    try {
      writeGates(dir, GATES_FIXTURE);
      const seen = [];
      const results = await evaluateShipCriteria(milestone, mockManager, {}, {
        projectRoot: dir,
        runGate: recordingRunner({ test: false }, seen),
      });
      assert.equal(results[0].passed, false);
      assert.ok(results[0].detail.includes("'test'"), results[0].detail);
      assert.ok(results[0].detail.includes("error"), results[0].detail);
      assert.ok(results[0].detail.includes("test exploded"), results[0].detail);
      // An error-severity failure stops the remaining gates.
      assert.deepStrictEqual(seen.map((s) => s.id), ["test"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not fail the criterion when a warning-severity gate fails", async () => {
    const dir = makeProject("gates-warning-");
    try {
      writeGates(dir, GATES_FIXTURE);
      const seen = [];
      const results = await evaluateShipCriteria(milestone, mockManager, {}, {
        projectRoot: dir,
        runGate: recordingRunner({ "integration-test": false }, seen),
      });
      assert.equal(results[0].passed, true);
      assert.equal(results[0].detail, undefined);
      assert.ok(
        results[0].warnings.some((w) => w.includes("integration-test") && w.includes("warning")),
        JSON.stringify(results[0].warnings),
      );
      // Warning failures do not stop the run.
      assert.deepStrictEqual(seen.map((s) => s.id), ["test", "integration-test"]);
      assert.deepStrictEqual(
        results[0].gates.map((g) => [g.id, g.passed]),
        [["test", true], ["integration-test", false]],
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats `required: false` as warning even when severity says error", async () => {
    const dir = makeProject("gates-required-false-");
    try {
      writeGates(dir, [
        "gates:",
        "  - id: flaky",
        "    tier: fast",
        "    command: [npm, run, flaky]",
        "    required: false",
        "    severity: error",
        "",
      ].join("\n"));
      const results = await evaluateShipCriteria(milestone, mockManager, {}, {
        projectRoot: dir,
        runGate: () => ({ passed: false, output: "nope" }),
      });
      assert.equal(results[0].passed, true);
      assert.equal(results[0].gates[0].severity, "warning");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("narrows to a single gate when the criterion names one", async () => {
    const dir = makeProject("gates-narrow-");
    try {
      writeGates(dir, GATES_FIXTURE);
      const seen = [];
      const narrowed = {
        name: "v1",
        epic_id: "epic-1",
        ship_criteria: [{ check: "gates_pass", gate: "test" }],
      };
      const results = await evaluateShipCriteria(narrowed, mockManager, {}, {
        projectRoot: dir,
        runGate: recordingRunner({}, seen),
      });
      assert.equal(results[0].passed, true);
      assert.deepStrictEqual(seen.map((s) => s.id), ["test"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails with a named detail when the criterion references an unknown gate", async () => {
    const dir = makeProject("gates-unknown-");
    try {
      writeGates(dir, GATES_FIXTURE);
      const bogus = {
        name: "v1",
        epic_id: "epic-1",
        ship_criteria: [{ check: "gates_pass", gate: "typecheck" }],
      };
      const results = await evaluateShipCriteria(bogus, mockManager, {}, {
        projectRoot: dir,
        runGate: () => ({ passed: true, output: "" }),
      });
      assert.equal(results[0].passed, false);
      assert.ok(results[0].detail.includes("'typecheck'"), results[0].detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces INVALID_GATE when gates.yaml declares a shell-string command", async () => {
    const dir = makeProject("gates-string-cmd-");
    try {
      writeGates(dir, [
        "gates:",
        "  - id: test",
        "    tier: fast",
        '    command: "npm test && npm run lint"',
        "",
      ].join("\n"));
      const results = await evaluateShipCriteria(milestone, mockManager, {}, {
        projectRoot: dir,
        runGate: () => assert.fail("no gate should run"),
      });
      assert.equal(results[0].passed, false);
      assert.ok(results[0].detail.includes("INVALID_GATE"), results[0].detail);
      assert.ok(results[0].detail.includes("argv list"), results[0].detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails with a gates.yaml-specific detail when the file is absent", async () => {
    const dir = makeProject("gates-absent-");
    try {
      const results = await evaluateShipCriteria(milestone, mockManager, {}, { projectRoot: dir });
      assert.equal(results[0].passed, false);
      assert.ok(results[0].detail.includes("gates.yaml"), results[0].detail);
      assert.ok(results[0].detail.includes("not found"), results[0].detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("executes the argv command without a shell (real subprocess)", async () => {
    const dir = makeProject("gates-exec-");
    try {
      // `>` and `&&` are shell metacharacters: under a shell this would
      // redirect/chain. Executed as argv it is one literal node argument,
      // so the gate exits 0.
      writeGates(dir, [
        "gates:",
        "  - id: test",
        "    tier: fast",
        '    command: [node, -e, "console.log(\'a > b && c\')"]',
        "    required: true",
        "    severity: error",
        "",
      ].join("\n"));
      const results = await evaluateShipCriteria(milestone, mockManager, {}, { projectRoot: dir });
      assert.equal(results[0].passed, true, JSON.stringify(results[0]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports stdout from a real failing gate in the detail", async () => {
    const dir = makeProject("gates-exec-fail-");
    try {
      writeGates(dir, [
        "gates:",
        "  - id: test",
        "    tier: fast",
        '    command: [node, -e, "console.log(\'boom-on-stdout\'); process.exitCode = 3"]',
        "    required: true",
        "    severity: error",
        "",
      ].join("\n"));
      const results = await evaluateShipCriteria(milestone, mockManager, {}, { projectRoot: dir });
      assert.equal(results[0].passed, false);
      assert.ok(results[0].detail.includes("boom-on-stdout"), results[0].detail);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// milestoneShip (Task 7)
// ---------------------------------------------------------------------------

describe("milestoneShip — gates_pass blocking semantics (issue-525)", () => {
  const shipManager = () => ({
    listEpics: async () => [{ id: "epic-1" }],
    list: async () => [],
    close: async () => {},
  });

  const plannedMilestone = {
    name: "v1.0.0",
    status: "planned",
    epic_id: "epic-1",
    target_date: null,
    release: { strategy: "manual" },
    ship_criteria: [{ check: "gates_pass" }],
  };

  it("ships when every gate declared in gates.yaml passes", async () => {
    const dir = makeProject("ship-gates-pass-");
    try {
      writeGates(dir, GATES_FIXTURE);
      saveMilestones(dir, [{ ...plannedMilestone }]);
      const ran = [];
      const result = await milestoneShip(dir, "v1.0.0", {
        issueManager: shipManager(),
        manifest: {},
        runGate: (gate) => { ran.push(gate.id); return { passed: true, output: "" }; },
      });
      assert.equal(result.shipped, true);
      assert.deepStrictEqual(ran, ["test", "integration-test"]);
      assert.equal(findMilestone(dir, "v1.0.0").status, "shipped");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks the ship when an error-severity gate fails", async () => {
    const dir = makeProject("ship-gates-error-");
    try {
      writeGates(dir, GATES_FIXTURE);
      saveMilestones(dir, [{ ...plannedMilestone }]);
      const result = await milestoneShip(dir, "v1.0.0", {
        issueManager: shipManager(),
        manifest: {},
        runGate: (gate) => ({ passed: gate.id !== "test", output: "suite red" }),
      });
      assert.equal(result.shipped, false);
      assert.equal(result.results[0].passed, false);
      assert.equal(findMilestone(dir, "v1.0.0").status, "planned");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("still ships when only a warning-severity gate fails", async () => {
    const dir = makeProject("ship-gates-warning-");
    try {
      writeGates(dir, GATES_FIXTURE);
      saveMilestones(dir, [{ ...plannedMilestone }]);
      const result = await milestoneShip(dir, "v1.0.0", {
        issueManager: shipManager(),
        manifest: {},
        runGate: (gate) => ({ passed: gate.id !== "integration-test", output: "evals red" }),
      });
      assert.equal(result.shipped, true);
      assert.ok(
        result.results[0].warnings.some((w) => w.includes("integration-test")),
        JSON.stringify(result.results[0]),
      );
      assert.equal(findMilestone(dir, "v1.0.0").status, "shipped");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks the ship when gates.yaml is missing rather than passing vacuously", async () => {
    const dir = makeProject("ship-gates-missing-");
    try {
      saveMilestones(dir, [{ ...plannedMilestone }]);
      const result = await milestoneShip(dir, "v1.0.0", {
        issueManager: shipManager(),
        manifest: {},
      });
      assert.equal(result.shipped, false);
      assert.ok(result.results[0].detail.includes("gates.yaml"), result.results[0].detail);
      assert.equal(findMilestone(dir, "v1.0.0").status, "planned");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("milestoneShip (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-ship-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("ships milestone: updates status, closes epic, creates tag", async () => {
    saveMilestones(dir, [{ name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: null, release: { strategy: "tag-only" }, ship_criteria: [] }]);
    const closedEpics = [];
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [],
      close: async (id, reason) => { closedEpics.push({ id, reason }); },
    };
    let tagCreated = null;
    const result = await milestoneShip(dir, "v1.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: (args) => { tagCreated = args[1]; },
      confirmFn: async () => true,
    });
    assert.equal(result.shipped, true);
    assert.equal(result.tag, "v1.0.0");
    assert.equal(tagCreated, "v1.0.0");
    assert.equal(closedEpics[0].id, "epic-1");
    const ms = findMilestone(dir, "v1.0.0");
    assert.equal(ms.status, "shipped");
  });

  it("adds v prefix for semver names without it", async () => {
    saveMilestones(dir, [{ name: "2.0.0", status: "planned", epic_id: "epic-10", target_date: null, release: { strategy: "tag-only" }, ship_criteria: [] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-10" }],
      list: async () => [],
      close: async () => {},
    };
    let tagCreated = null;
    const result = await milestoneShip(dir, "2.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: (args) => { tagCreated = args[1]; },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.tag, "v2.0.0");
    assert.equal(tagCreated, "v2.0.0");
  });

  it("skips tagging for non-semver names", async () => {
    saveMilestones(dir, [{ name: "beta-1", status: "planned", epic_id: "epic-11", target_date: null, release: { strategy: "tag-only" }, ship_criteria: [] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-11" }],
      list: async () => [],
      close: async () => {},
    };
    const result = await milestoneShip(dir, "beta-1", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => { throw new Error("should not be called"); },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.tag, null);
  });

  it("is a no-op when already shipped", async () => {
    saveMilestones(dir, [{ name: "v0.9.0", status: "shipped", epic_id: "epic-2", target_date: null, release: null, ship_criteria: [] }]);
    const result = await milestoneShip(dir, "v0.9.0", { issueManager: {}, manifest: {} });
    assert.equal(result.shipped, true);
    assert.equal(result.skipped, true);
  });

  it("blocks when criteria fail", async () => {
    saveMilestones(dir, [{ name: "v2.1.0", status: "planned", epic_id: "epic-3", target_date: null, release: null, ship_criteria: [{ check: "all_issues_closed" }] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [{ id: "issue-1", status: "open" }],
    };
    const result = await milestoneShip(dir, "v2.1.0", { issueManager: mockManager, manifest: {} });
    assert.equal(result.shipped, false);
  });

  it("rejects missing name", async () => {
    await assert.rejects(() => milestoneShip(dir, "", {}), { code: "MISSING_NAME" });
  });

  it("rejects not-found milestone", async () => {
    await assert.rejects(() => milestoneShip(dir, "nonexistent", { issueManager: {}, manifest: {} }), { code: "MILESTONE_NOT_FOUND" });
  });

  it("blocks when tag exists", async () => {
    saveMilestones(dir, [{ name: "v3.0.0", status: "planned", epic_id: "epic-4", target_date: null, release: { strategy: "tag-only" }, ship_criteria: [] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [],
      close: async () => {},
    };
    const result = await milestoneShip(dir, "v3.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => {
        const e = new Error("tag exists");
        e.stderr = Buffer.from("fatal: tag 'v3.0.0' already exists");
        throw e;
      },
      confirmFn: async () => true,
    });
    assert.equal(result.shipped, false);
    assert.equal(result.error, "TAG_EXISTS");
  });

  it("handles epic close failure gracefully", async () => {
    saveMilestones(dir, [{ name: "v4.0.0", status: "planned", epic_id: "epic-5", target_date: null, release: { strategy: "tag-only" }, ship_criteria: [] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-5" }],
      list: async () => [],
      close: async () => { throw new Error("close failed"); },
    };
    const result = await milestoneShip(dir, "v4.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => {},
    });
    assert.equal(result.shipped, true);
    const ms = findMilestone(dir, "v4.0.0");
    assert.equal(ms.status, "shipped");
  });

  it("blocks when confirm is rejected", async () => {
    saveMilestones(dir, [{ name: "v5.0.0", status: "planned", epic_id: "epic-6", target_date: null, release: null, ship_criteria: [{ confirm: "CHANGELOG updated" }] }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-6" }],
      list: async () => [],
    };
    const result = await milestoneShip(dir, "v5.0.0", {
      issueManager: mockManager,
      manifest: {},
      confirmFn: async () => false,
    });
    assert.equal(result.shipped, false);
    assert.equal(result.confirmRejected, "CHANGELOG updated");
  });
});

// ---------------------------------------------------------------------------
// milestoneShip strategy: tag-only
// ---------------------------------------------------------------------------

describe("milestoneShip strategy: tag-only", () => {
  let dir;
  before(() => { dir = makeProject("milestone-ship-tag-only-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates git tag for semver names", async () => {
    saveMilestones(dir, [{
      name: "1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    let tagCreated = null;
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "1.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: (args) => { tagCreated = args[1]; },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "tag-only");
    assert.equal(result.tag, "v1.0.0");
    assert.equal(tagCreated, "v1.0.0");
  });

  it("skips tag for non-semver names", async () => {
    saveMilestones(dir, [{
      name: "beta-1", status: "planned", epic_id: "epic-2",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "beta-1", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.tag, null);
  });

  it("blocks when tag already exists", async () => {
    saveMilestones(dir, [{
      name: "v3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "v3.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => {
        const e = new Error("tag exists");
        e.stderr = Buffer.from("fatal: tag 'v3.0.0' already exists");
        throw e;
      },
    });
    assert.equal(result.shipped, false);
    assert.equal(result.error, "TAG_EXISTS");
  });

  it("calls execGh for GitHub release when available", async () => {
    saveMilestones(dir, [{
      name: "4.0.0", status: "planned", epic_id: "epic-4",
      target_date: null, release: { strategy: "tag-only" }, ship_criteria: [],
    }]);
    let ghArgs = null;
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [], close: async () => {},
    };
    await milestoneShip(dir, "4.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => {},
      execGh: (args) => { ghArgs = args; },
    });
    assert.ok(ghArgs.includes("release"));
    assert.ok(ghArgs.includes("v4.0.0"));
  });
});

// ---------------------------------------------------------------------------
// milestoneShip strategy: release-please
// ---------------------------------------------------------------------------

describe("milestoneShip strategy: release-please", () => {
  let dir;
  before(() => { dir = makeProject("milestone-ship-rp-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("writes release-as to config for semver names", async () => {
    const config = { packages: { ".": { "release-type": "node", "package-name": "test" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "1.0.0", {
      issueManager: mockManager, manifest: {},
      execGh: () => "[]",
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "release-please");
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], "1.0.0");
  });

  it("strips v prefix from version in release-as", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "v2.0.0", status: "planned", epic_id: "epic-2",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [], close: async () => {},
    };
    await milestoneShip(dir, "v2.0.0", {
      issueManager: mockManager, manifest: {},
      execGh: () => "[]",
    });
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], "2.0.0");
  });

  it("falls back to manual when config file missing", async () => {
    const noConfigDir = makeProject("milestone-no-rp-");
    saveMilestones(noConfigDir, [{
      name: "3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(noConfigDir, "3.0.0", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
    rmSync(noConfigDir, { recursive: true, force: true });
  });

  it("throws RELEASE_CONFIG_INVALID for malformed JSON", async () => {
    const badDir = makeProject("milestone-bad-rp-");
    writeFileSync(join(badDir, "release-please-config.json"), "not json{{{");
    saveMilestones(badDir, [{
      name: "4.0.0", status: "planned", epic_id: "epic-4",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-4" }],
      list: async () => [],
    };
    await assert.rejects(
      () => milestoneShip(badDir, "4.0.0", { issueManager: mockManager, manifest: {} }),
      (err) => err.code === "RELEASE_CONFIG_INVALID"
    );
    rmSync(badDir, { recursive: true, force: true });
  });

  it("skips config write for non-semver names", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "alpha-1", status: "planned", epic_id: "epic-5",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-5" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "alpha-1", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    const updated = JSON.parse(readFileSync(join(dir, "release-please-config.json"), "utf8"));
    assert.equal(updated.packages["."]["release-as"], undefined);
  });

  it("does NOT create git tags", async () => {
    const config = { packages: { ".": { "release-type": "node" } } };
    writeFileSync(join(dir, "release-please-config.json"), JSON.stringify(config, null, 2));
    saveMilestones(dir, [{
      name: "5.0.0", status: "planned", epic_id: "epic-6",
      target_date: null, release: { strategy: "release-please" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-6" }],
      list: async () => [], close: async () => {},
    };
    const result = await milestoneShip(dir, "5.0.0", {
      issueManager: mockManager, manifest: {},
      execGit: () => { throw new Error("should not create tags"); },
      execGh: () => "[]",
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "release-please");
  });
});

// ---------------------------------------------------------------------------
// milestoneShip strategy: manual
// ---------------------------------------------------------------------------

describe("milestoneShip strategy: manual", () => {
  let dir;
  before(() => { dir = makeProject("milestone-ship-manual-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("ships with manual strategy (no git ops)", async () => {
    saveMilestones(dir, [{
      name: "v1.0.0", status: "planned", epic_id: "epic-1",
      target_date: null, release: { strategy: "manual" }, ship_criteria: [],
    }]);
    const closedEpics = [];
    const mockManager = {
      listEpics: async () => [{ id: "epic-1" }],
      list: async () => [],
      close: async (id, reason) => { closedEpics.push({ id, reason }); },
    };
    const result = await milestoneShip(dir, "v1.0.0", {
      issueManager: mockManager,
      manifest: {},
      execGit: () => { throw new Error("should not be called for manual"); },
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
    assert.equal(closedEpics[0].id, "epic-1");
    assert.equal(findMilestone(dir, "v1.0.0").status, "shipped");
  });

  it("defaults to manual when release is null", async () => {
    saveMilestones(dir, [{
      name: "v2.0.0", status: "planned", epic_id: "epic-2",
      target_date: null, release: null, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-2" }],
      list: async () => [],
      close: async () => {},
    };
    const result = await milestoneShip(dir, "v2.0.0", {
      issueManager: mockManager, manifest: {},
    });
    assert.equal(result.shipped, true);
    assert.equal(result.strategy, "manual");
  });

  it("throws UNKNOWN_STRATEGY for bad strategy", async () => {
    saveMilestones(dir, [{
      name: "v3.0.0", status: "planned", epic_id: "epic-3",
      target_date: null, release: { strategy: "bad" }, ship_criteria: [],
    }]);
    const mockManager = {
      listEpics: async () => [{ id: "epic-3" }],
      list: async () => [],
    };
    await assert.rejects(
      () => milestoneShip(dir, "v3.0.0", { issueManager: mockManager, manifest: {} }),
      { code: "UNKNOWN_STRATEGY" }
    );
  });
});

// ---------------------------------------------------------------------------
// warnIfMilestoneUndefined (Task 7)
// ---------------------------------------------------------------------------

describe("warnIfMilestoneUndefined (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-warn-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns null when milestone exists", () => {
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [] }]);
    assert.equal(warnIfMilestoneUndefined(dir, "v1"), null);
  });

  it("returns warning when milestone not found", () => {
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [] }]);
    const result = warnIfMilestoneUndefined(dir, "v2");
    assert.ok(result.includes("Warning"));
    assert.ok(result.includes("v2"));
    // message text references milestones.json (truthful after migration)
    assert.ok(result.includes("milestones.json"));
  });

  it("returns null when milestones.json does not exist", () => {
    const emptyDir = makeProject("milestone-warn-empty-");
    try {
      assert.equal(warnIfMilestoneUndefined(emptyDir, "v1"), null);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("returns null when milestones.json is malformed (fail-open)", () => {
    const badDir = makeProject("milestone-warn-bad-");
    try {
      writeFileSync(join(badDir, ".context-index", "milestones.json"), "{ not json");
      assert.equal(warnIfMilestoneUndefined(badDir, "v1"), null);
    } finally {
      rmSync(badDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// getMilestoneStatusData (Task 7)
// ---------------------------------------------------------------------------

describe("getMilestoneStatusData (Task 7)", () => {
  let dir;
  before(() => { dir = makeProject("milestone-status-"); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns milestone data when found", () => {
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", release: null, ship_criteria: [{ check: "gates_pass" }] }]);
    const result = getMilestoneStatusData(dir, "v1");
    assert.equal(result.found, true);
    assert.equal(result.milestone.name, "v1");
    assert.equal(result.milestone.target_date, "2026-06-01");
    assert.equal(result.milestone.ship_criteria.length, 1);
  });

  it("returns not-found when milestone missing", () => {
    const result = getMilestoneStatusData(dir, "nonexistent");
    assert.equal(result.found, false);
    assert.equal(result.milestone, null);
  });

  it("returns not-found when file missing", () => {
    const emptyDir = makeProject("milestone-status-empty-");
    try {
      const result = getMilestoneStatusData(emptyDir, "v1");
      assert.equal(result.found, false);
      assert.equal(result.milestone, null);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("returns not-found when file malformed", () => {
    const badDir = makeProject("milestone-status-bad-");
    try {
      writeFileSync(join(badDir, ".context-index", "milestones.json"), "{ not json");
      const result = getMilestoneStatusData(badDir, "v1");
      assert.equal(result.found, false);
      assert.equal(result.milestone, null);
    } finally {
      rmSync(badDir, { recursive: true, force: true });
    }
  });
});
