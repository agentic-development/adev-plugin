/**
 * Tests for lib/issues/id-utils.mjs
 *
 * Covers: parseId, nextChildId, getTierConfig
 * Behaviors: 1–5, 12–14 from the tiered-hierarchy spec.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseId,
  nextChildId,
  getTierConfig,
  DEFAULT_TIER_PREFIXES,
} from "../../lib/issues/id-utils.mjs";

// ---------------------------------------------------------------------------
// getTierConfig
// ---------------------------------------------------------------------------

describe("getTierConfig", () => {
  it("returns default tier config when no overrides provided", () => {
    const config = getTierConfig(null);
    assert.deepEqual(config, { e: "Epic", f: "Feature", t: "Task" });
  });

  it("returns default when overrides is undefined", () => {
    const config = getTierConfig(undefined);
    assert.deepEqual(config, { e: "Epic", f: "Feature", t: "Task" });
  });

  it("returns custom config from manifest overrides", () => {
    const overrides = { x: "Outcome", y: "Initiative", z: "Step" };
    const config = getTierConfig(overrides);
    assert.deepEqual(config, { x: "Outcome", y: "Initiative", z: "Step" });
  });

  it("throws INVALID_TIER_CONFIG when duplicate prefix labels exist", () => {
    // duplicate label: two prefixes map to same tier name
    const overrides = { x: "Outcome", y: "Outcome" };
    assert.throws(
      () => getTierConfig(overrides),
      (err) => err.code === "INVALID_TIER_CONFIG"
    );
  });

  it("throws INVALID_TIER_CONFIG when prefix conflicts with legacy pattern 'epic'", () => {
    // prefix "epic" would conflict with legacy ID format "epic-N"
    const overrides = { epic: "Epic", f: "Feature", t: "Task" };
    assert.throws(
      () => getTierConfig(overrides),
      (err) => err.code === "INVALID_TIER_CONFIG"
    );
  });

  it("throws INVALID_TIER_CONFIG when prefix conflicts with legacy pattern 'issue'", () => {
    const overrides = { issue: "Issue", f: "Feature", t: "Task" };
    assert.throws(
      () => getTierConfig(overrides),
      (err) => err.code === "INVALID_TIER_CONFIG"
    );
  });

  it("throws INVALID_TIER_CONFIG when prefix conflicts with legacy pattern 'bd'", () => {
    const overrides = { bd: "Bead", f: "Feature", t: "Task" };
    assert.throws(
      () => getTierConfig(overrides),
      (err) => err.code === "INVALID_TIER_CONFIG"
    );
  });

  it("exports DEFAULT_TIER_PREFIXES constant", () => {
    assert.deepEqual(DEFAULT_TIER_PREFIXES, { e: "Epic", f: "Feature", t: "Task" });
  });
});

// ---------------------------------------------------------------------------
// parseId — tiered IDs
// ---------------------------------------------------------------------------

describe("parseId — tiered IDs", () => {
  it("parses depth-1 tiered ID e1", () => {
    const result = parseId("e1");
    assert.deepEqual(result, {
      tier: "Epic",
      depth: 1,
      parent_id: null,
      prefix: "e",
      counter: 1,
      legacy: false,
    });
  });

  it("parses depth-2 tiered ID e1.f2", () => {
    const result = parseId("e1.f2");
    assert.deepEqual(result, {
      tier: "Feature",
      depth: 2,
      parent_id: "e1",
      prefix: "f",
      counter: 2,
      legacy: false,
    });
  });

  it("parses depth-3 tiered ID e1.f2.t3 (spec example)", () => {
    const result = parseId("e1.f2.t3");
    assert.deepEqual(result, {
      tier: "Task",
      depth: 3,
      parent_id: "e1.f2",
      prefix: "t",
      counter: 3,
      legacy: false,
    });
  });

  it("parses depth-4 tiered ID e1.f2.t3.t4", () => {
    const result = parseId("e1.f2.t3.t4");
    assert.deepEqual(result, {
      tier: "Task",
      depth: 4,
      parent_id: "e1.f2.t3",
      prefix: "t",
      counter: 4,
      legacy: false,
    });
  });

  it("parses ID with large counter e9.f12", () => {
    const result = parseId("e9.f12");
    assert.equal(result.counter, 12);
    assert.equal(result.parent_id, "e9");
    assert.equal(result.depth, 2);
    assert.equal(result.legacy, false);
  });

  it("uses custom tier config when provided", () => {
    const config = { x: "Outcome", y: "Initiative", z: "Step" };
    const result = parseId("x1.y2.z3", config);
    assert.deepEqual(result, {
      tier: "Step",
      depth: 3,
      parent_id: "x1.y2",
      prefix: "z",
      counter: 3,
      legacy: false,
    });
  });
});

// ---------------------------------------------------------------------------
// parseId — legacy flat IDs
// ---------------------------------------------------------------------------

describe("parseId — legacy flat IDs", () => {
  it("parses epic-N as legacy", () => {
    const result = parseId("epic-1");
    assert.deepEqual(result, {
      tier: null,
      depth: 1,
      parent_id: null,
      prefix: null,
      counter: null,
      legacy: true,
    });
  });

  it("parses epic-75 as legacy", () => {
    const result = parseId("epic-75");
    assert.equal(result.legacy, true);
    assert.equal(result.tier, null);
  });

  it("parses issue-N as legacy", () => {
    const result = parseId("issue-65");
    assert.deepEqual(result, {
      tier: null,
      depth: 1,
      parent_id: null,
      prefix: null,
      counter: null,
      legacy: true,
    });
  });

  it("parses bd-XXXXXX as legacy", () => {
    const result = parseId("bd-a1b2c3");
    assert.deepEqual(result, {
      tier: null,
      depth: 1,
      parent_id: null,
      prefix: null,
      counter: null,
      legacy: true,
    });
  });
});

// ---------------------------------------------------------------------------
// parseId — invalid / garbage input
// ---------------------------------------------------------------------------

describe("parseId — invalid input", () => {
  it("returns null for empty string (+1 more contract assertions)", () => {
    // returns null for empty string
    assert.equal(parseId(""), null);

    // returns null for garbage string
    assert.equal(parseId("GARBAGE!@#"), null);
  });

  it("returns null for ID with unknown prefix in default config", () => {
    // "x1" is not a known prefix in default config {e,f,t}
    assert.equal(parseId("x1"), null);
  });

  it("returns null for ID with dots but invalid prefix (+1 more contract assertions)", () => {
    // returns null for ID with dots but invalid prefix
    assert.equal(parseId("z1.q2"), null);

    // returns null for malformed dotted ID (empty segment)
    assert.equal(parseId("e1..t2"), null);
  });

  it("returns null for segment with no counter", () => {
    // "e" alone has no counter digit
    assert.equal(parseId("e"), null);
  });
});

// ---------------------------------------------------------------------------
// nextChildId
// ---------------------------------------------------------------------------

describe("nextChildId", () => {
  it("returns prefix1 when no existing children", () => {
    const items = [];
    const result = nextChildId("e1", "f", items);
    assert.equal(result, "e1.f1");
  });

  it("returns next counter after existing children", () => {
    const items = [
      { id: "e1.f1", status: "open" },
      { id: "e1.f2", status: "open" },
    ];
    const result = nextChildId("e1", "f", items);
    assert.equal(result, "e1.f3");
  });

  it("is monotonic — closed children don't free counter", () => {
    const items = [
      { id: "e1.f1", status: "closed" },
      { id: "e1.f2", status: "closed" },
    ];
    const result = nextChildId("e1", "f", items);
    assert.equal(result, "e1.f3");
  });

  it("ignores children from different parents", () => {
    const items = [
      { id: "e1.f1", status: "open" },
      { id: "e2.f1", status: "open" }, // different parent
      { id: "e1.f1.t1", status: "open" }, // deeper child
    ];
    const result = nextChildId("e1", "f", items);
    assert.equal(result, "e1.f2");
  });

  it("handles root-level creation (null parent)", () => {
    const items = [
      { id: "e1", status: "open" },
      { id: "e2", status: "closed" },
    ];
    const result = nextChildId(null, "e", items);
    assert.equal(result, "e3");
  });

  it("returns prefix1 for root creation with no existing items", () => {
    const result = nextChildId(null, "e", []);
    assert.equal(result, "e1");
  });

  it("does not count children of children as direct children", () => {
    // e1.f1.t1 is NOT a direct child of e1 with prefix f
    const items = [
      { id: "e1.f1", status: "open" },
      { id: "e1.f1.t1", status: "open" }, // grandchild
    ];
    const result = nextChildId("e1", "f", items);
    assert.equal(result, "e1.f2");
  });

  it("returns parent.prefix1 when non-existent parent", () => {
    // spec: no validation that parent exists, just return prefix1
    const items = [];
    const result = nextChildId("e99", "f", items);
    assert.equal(result, "e99.f1");
  });
});
