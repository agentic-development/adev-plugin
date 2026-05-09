import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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
} from "../lib/milestones.mjs";

// --- Task 1: YAML I/O ---

describe("loadMilestones", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-io-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns empty array when milestones.yaml does not exist", () => {
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });

  it("returns empty array when milestones key is missing", () => {
    const ciDir = join(dir, ".context-index");
    mkdirSync(ciDir, { recursive: true });
    writeFileSync(join(ciDir, "milestones.yaml"), "other_key: value\n");
    const result = loadMilestones(dir);
    assert.deepStrictEqual(result, []);
  });

  it("throws PARSE_ERROR for malformed YAML", () => {
    const ciDir = join(dir, ".context-index");
    mkdirSync(ciDir, { recursive: true });
    writeFileSync(join(ciDir, "milestones.yaml"), "  bad:\n    - :\n  : broken\n");
    assert.throws(() => loadMilestones(dir), (err) => err.code === "PARSE_ERROR");
  });
});

describe("saveMilestones", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-save-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestones.yaml with milestone entries", () => {
    const ms = [{ name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }];
    saveMilestones(dir, ms);
    assert.ok(existsSync(join(dir, ".context-index", "milestones.yaml")));
  });

  it("round-trips through load", () => {
    const ms = [
      { name: "v1.0.0", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", release: null, ship_criteria: [] },
      { name: "v2.0.0", status: "planned", epic_id: null, target_date: null, release: null, ship_criteria: [{ check: "gates_pass" }] },
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
});

describe("findMilestone", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "milestone-find-test-"));
    saveMilestones(dir, [{ name: "v1", status: "planned", epic_id: "epic-1", target_date: null, ship_criteria: [] }]);
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

describe("validateMilestoneName", () => {
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

describe("validateTargetDate", () => {
  it("accepts valid YYYY-MM-DD", () => {
    assert.doesNotThrow(() => validateTargetDate("2026-06-01"));
  });

  it("rejects invalid date with INVALID_DATE", () => {
    assert.throws(() => validateTargetDate("not-a-date"), (err) => err.code === "INVALID_DATE");
    assert.throws(() => validateTargetDate("06-01-2026"), (err) => err.code === "INVALID_DATE");
  });
});

// --- Task 2: milestoneCreate ---

describe("milestoneCreate", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-create-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("creates milestone entry and writes to YAML", async () => {
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

// --- Task 3: milestoneList ---

describe("milestoneList", () => {
  let dir;
  before(() => { dir = mkdtempSync(join(tmpdir(), "milestone-list-test-")); });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("returns formatted table when milestones exist", async () => {
    saveMilestones(dir, [
      { name: "v1", status: "planned", epic_id: "epic-1", target_date: "2026-06-01", ship_criteria: [] },
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

  it("returns help message when no milestones.yaml exists", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "milestone-list-empty-"));
    try {
      const output = await milestoneList(emptyDir, {});
      assert.ok(output.includes("No milestones defined"));
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("shows broken epic warning for non-existent epic", async () => {
    saveMilestones(dir, [
      { name: "v2", status: "planned", epic_id: "epic-999", target_date: null, ship_criteria: [] },
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
      { name: "v3", status: "planned", epic_id: "epic-10", target_date: null, ship_criteria: [] },
    ]);
    const output = await milestoneList(dir, {});
    assert.ok(output.includes("epic-10"));
    // No progress column populated
    assert.ok(output.includes("—"));
  });
});

// --- Task 5: Integration test (create + list lifecycle) ---

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
    dir = mkdtempSync(join(tmpdir(), "milestone-integration-"));
    epicCounter = 0;
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("full lifecycle: create → list → create again (idempotent)", async () => {
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
  });
});
