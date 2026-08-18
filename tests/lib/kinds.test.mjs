/**
 * Tests for lib/kinds.mjs — closed kind enumerations + validators.
 *
 * Covers the 8 behaviors from
 * .context-index/specs/features/lifecycle-artifacts/kind-enumeration.spec.md
 * plus the frozen-array invariant and the module-identity postcondition.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SPEC_KINDS,
  CHARTER_KINDS,
  isValidKind,
  defaultKindFor,
} from "../../lib/kinds.mjs";

// ── Behavior 1: SPEC_KINDS shape, order, and frozen-ness ────────────────────

describe("SPEC_KINDS", () => {
  it("deep-equals the documented six-value array in stable order (+1 more contract assertions)", () => {
    // deep-equals the documented six-value array in stable order
    assert.deepEqual(SPEC_KINDS, [
    "behavioral",
    "refactor",
    "action",
    "skill",
    "integration",
    "artifact",
    ]);

    // is frozen
    assert.equal(Object.isFrozen(SPEC_KINDS), true);
  });

  it("rejects mutation via push (strict mode TypeError)", () => {
    assert.throws(() => SPEC_KINDS.push("x"), TypeError);
  });

  it("rejects mutation via index assignment (strict mode TypeError)", () => {
    assert.throws(() => {
      SPEC_KINDS[0] = "mutated";
    }, TypeError);
  });
});

// ── Behavior 2: CHARTER_KINDS shape, order, and frozen-ness ─────────────────

describe("CHARTER_KINDS", () => {
  it("deep-equals the documented four-value array in stable order (+1 more contract assertions)", () => {
    // deep-equals the documented four-value array in stable order
    assert.deepEqual(CHARTER_KINDS, [
    "module",
    "feature",
    "cross-cutting",
    "initiative",
    ]);

    // is frozen
    assert.equal(Object.isFrozen(CHARTER_KINDS), true);
  });

  it("rejects mutation via push (strict mode TypeError)", () => {
    assert.throws(() => CHARTER_KINDS.push("x"), TypeError);
  });
});

// ── Module identity postcondition ───────────────────────────────────────────

describe("module identity", () => {
  it("re-imports return the same array references", async () => {
    const again = await import("../../lib/kinds.mjs");
    assert.equal(again.SPEC_KINDS, SPEC_KINDS);
    assert.equal(again.CHARTER_KINDS, CHARTER_KINDS);
  });
});

// ── Behavior 3: isValidKind returns true for every documented pair ──────────

describe("isValidKind — valid pairs", () => {
  for (const kind of [
    "behavioral",
    "refactor",
    "action",
    "skill",
    "integration",
    "artifact",
  ]) {
    it(`returns true for ('spec', '${kind}')`, () => {
      assert.equal(isValidKind("spec", kind), true);
    });
  }

  for (const kind of ["module", "feature", "cross-cutting", "initiative"]) {
    it(`returns true for ('charter', '${kind}')`, () => {
      assert.equal(isValidKind("charter", kind), true);
    });
  }
});

// ── Behavior 4: unknown kind returns false (does not throw) ─────────────────

describe("isValidKind — unknown kind", () => {
  it("returns false for ('spec', 'unknown') (+3 more contract assertions)", () => {
    // returns false for ('spec', 'unknown')
    assert.equal(isValidKind("spec", "unknown"), false);

    // returns false for cross-layer ('charter', 'behavioral')
    assert.equal(isValidKind("charter", "behavioral"), false);

    // returns false for cross-layer ('spec', 'feature')
    assert.equal(isValidKind("spec", "feature"), false);

    // returns false for empty string
    assert.equal(isValidKind("spec", ""), false);
  });
});

// ── Behavior 5: non-string kind returns false (does not throw) ──────────────

describe("isValidKind — non-string kind", () => {
  it("returns false for null (+4 more contract assertions)", () => {
    // returns false for null
    assert.equal(isValidKind("spec", null), false);

    // returns false for undefined
    assert.equal(isValidKind("spec", undefined), false);

    // returns false for a number
    assert.equal(isValidKind("spec", 123), false);

    // returns false for an object
    assert.equal(isValidKind("spec", {}), false);

    // returns false for an array
    assert.equal(isValidKind("spec", ["behavioral"]), false);
  });
});

// ── Behavior 6: invalid layer throws INVALID_LAYER ──────────────────────────

describe("isValidKind — invalid layer", () => {
  it("throws an Error with code INVALID_LAYER for ('foo', 'behavioral')", () => {
    assert.throws(
      () => isValidKind("foo", "behavioral"),
      (err) => err instanceof Error && err.code === "INVALID_LAYER",
    );
  });

  it("error message names the offending value", () => {
    try {
      isValidKind("foo", "behavioral");
      assert.fail("expected throw");
    } catch (err) {
      assert.match(err.message, /foo/);
    }
  });

  it("throws INVALID_LAYER for empty-string layer", () => {
    assert.throws(
      () => isValidKind("", "behavioral"),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("throws INVALID_LAYER for null layer", () => {
    assert.throws(
      () => isValidKind(null, "behavioral"),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("throws INVALID_LAYER for a number layer", () => {
    assert.throws(
      () => isValidKind(42, "behavioral"),
      (err) => err.code === "INVALID_LAYER",
    );
  });
});

// ── Behavior 7: defaultKindFor returns the documented defaults ──────────────

describe("defaultKindFor — valid layer", () => {
  it("returns 'behavioral' for 'spec' (+1 more contract assertions)", () => {
    // returns 'behavioral' for 'spec'
    assert.equal(defaultKindFor("spec"), "behavioral");

    // returns 'feature' for 'charter'
    assert.equal(defaultKindFor("charter"), "feature");
  });
});

// ── Behavior 8: defaultKindFor throws INVALID_LAYER on bad layer ────────────

describe("defaultKindFor — invalid layer", () => {
  it("throws Error with code INVALID_LAYER for 'foo'", () => {
    assert.throws(
      () => defaultKindFor("foo"),
      (err) => err instanceof Error && err.code === "INVALID_LAYER",
    );
  });

  it("error message names the offending value", () => {
    try {
      defaultKindFor("foo");
      assert.fail("expected throw");
    } catch (err) {
      assert.match(err.message, /foo/);
    }
  });

  it("throws INVALID_LAYER for null layer", () => {
    assert.throws(
      () => defaultKindFor(null),
      (err) => err.code === "INVALID_LAYER",
    );
  });

  it("throws INVALID_LAYER for empty-string layer", () => {
    assert.throws(
      () => defaultKindFor(""),
      (err) => err.code === "INVALID_LAYER",
    );
  });
});
